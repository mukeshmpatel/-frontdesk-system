import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { emitReportEvent } from "./reporting-layer";

type ImportFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
type AccountingMethod = "UNCONFIRMED" | "CASH" | "ACCRUAL";

function db(): D1Database {
  if (!env.DB) throw new Error("Tax preparation storage is unavailable.");
  return env.DB;
}

async function ensureTaxTables() {
  db();
}

const aliases: Record<string, string[]> = {
  date: ["date", "businessdate", "business_date", "staydate", "transactiondate"],
  reference: ["reference", "folio", "folioid", "report", "source"],
  grossRevenue: ["grossrevenue", "gross_revenue", "totalrevenue", "revenue", "grosssales"],
  taxableRoomRevenue: ["taxableroomrevenue", "taxable_room_revenue", "roomrevenue", "roomcharges", "lodgingrevenue"],
  taxableOtherSales: ["taxableothersales", "taxable_other_sales", "foodbeverage", "fb", "othersales", "taxablesales"],
  exemptRevenue: ["exemptrevenue", "exempt_revenue", "taxexempt", "exemptsales"],
  refunds: ["refunds", "refund", "returns"],
  discounts: ["discounts", "discount", "promotions"],
  adjustments: ["adjustments", "adjustment", "allowances", "writeoffs"],
  operatingExpenses: ["operatingexpenses", "operating_expenses", "expenses", "deductions"],
  salesTaxCollected: ["salestaxcollected", "sales_tax_collected", "salestax"],
  lodgingTaxCollected: ["lodgingtaxcollected", "lodging_tax_collected", "occupancytax", "lodgingtax"],
  liquorSales: ["liquorsales","liquor_sales","alcoholsales","baralcoholsales"],
  liquorTaxCollected: ["liquortaxcollected","liquor_tax_collected","liquortax"],
  taxableOutOfStatePurchases: ["taxableoutofstatepurchases","taxable_out_of_state_purchases","use_tax_purchases","compensatingtaxpurchases"],
  consumerCompensatingTaxPaid: ["consumercompensatingtaxpaid","consumer_compensating_tax_paid","usetaxpaid","compensatingtaxpaid"],
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function numberValue(value: unknown) {
  const raw = String(value ?? "0").trim();
  const negative = /^\(.*\)$/.test(raw);
  const parsed = Number(raw.replace(/[$,%()\s,]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
}

function findColumn(headers: string[], key: string) {
  const candidates = aliases[key] ?? [];
  return headers.findIndex((header) => candidates.includes(normalized(header)));
}

function parseDelimited(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 5_001);
  if (lines.length < 2) throw new Error("The report needs a header row and at least one data row.");
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes("|") ? "|" : ",";
  const parse = (line: string) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const headers = parse(lines[0]);
  const indexes = Object.fromEntries(Object.keys(aliases).map((key) => [key, findColumn(headers, key)]));
  if (indexes.date < 0) throw new Error("AAIQ could not find a business-date column.");
  if (indexes.grossRevenue < 0 && indexes.taxableRoomRevenue < 0 && indexes.taxableOtherSales < 0) {
    throw new Error("AAIQ could not find revenue columns. Include gross revenue, room revenue, or taxable sales.");
  }
  const exceptions: string[] = [];
  const rows = lines.slice(1).flatMap((line, rowIndex) => {
    const cells = parse(line);
    const rawDate = cells[indexes.date] ?? "";
    const date = new Date(rawDate);
    if (!rawDate || Number.isNaN(date.getTime())) {
      exceptions.push(`Row ${rowIndex + 2}: business date could not be verified.`);
      return [];
    }
    const read = (key: string) => indexes[key] >= 0 ? numberValue(cells[indexes[key]]) : 0;
    const room = read("taxableRoomRevenue");
    const other = read("taxableOtherSales");
    return [{
      businessDate: date.toISOString().slice(0, 10),
      sourceReference: indexes.reference >= 0 ? cells[indexes.reference] : null,
      grossRevenue: indexes.grossRevenue >= 0 ? read("grossRevenue") : room + other + read("exemptRevenue"),
      taxableRoomRevenue: room,
      taxableOtherSales: other,
      exemptRevenue: read("exemptRevenue"),
      refunds: read("refunds"),
      discounts: read("discounts"),
      adjustments: read("adjustments"),
      operatingExpenses: read("operatingExpenses"),
      salesTaxCollected: read("salesTaxCollected"),
      lodgingTaxCollected: read("lodgingTaxCollected"),
      liquorSales: read("liquorSales"),
      liquorTaxCollected: read("liquorTaxCollected"),
      taxableOutOfStatePurchases: read("taxableOutOfStatePurchases"),
      consumerCompensatingTaxPaid: read("consumerCompensatingTaxPaid"),
    }];
  });
  return { rows, exceptions, headers };
}

export async function taxCenter(email: string) {
  const context = await activeStaffContext(email);
  if (!context) return null;
  await ensureTaxTables();
  const now = new Date().toISOString();
  await db().prepare(`INSERT OR IGNORE INTO tax_preparation_profiles
    (organization_id,accounting_method,accounting_method_confirmed,gross_includes_tax,
     sales_tax_rate,lodging_tax_rate,liquor_tax_rate,consumer_compensating_tax_rate,jurisdiction_label,verified_by,verified_at,updated_at)
    VALUES (?,'UNCONFIRMED',0,NULL,NULL,NULL,NULL,NULL,'',NULL,NULL,?)`).bind(context.organizationId, now).run();
  const [profile, imports, workpapers] = await Promise.all([
    db().prepare("SELECT * FROM tax_preparation_profiles WHERE organization_id=?")
      .bind(context.organizationId).first<Record<string, unknown>>(),
    db().prepare("SELECT * FROM tax_source_imports WHERE organization_id=? ORDER BY imported_at DESC LIMIT 30")
      .bind(context.organizationId).all<Record<string, unknown>>(),
    db().prepare("SELECT * FROM tax_return_workpapers WHERE organization_id=? ORDER BY period_end DESC LIMIT 24")
      .bind(context.organizationId).all<Record<string, unknown>>(),
  ]);
  return { role: context.role, profile, imports: imports.results, workpapers: workpapers.results };
}

export async function updateTaxProfile(email: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(email);
  if (!context || context.role !== "admin") return null;
  await ensureTaxTables();
  const method: AccountingMethod = input.accountingMethod === "CASH" || input.accountingMethod === "ACCRUAL"
    ? input.accountingMethod
    : "UNCONFIRMED";
  if (!input.confirmed || method === "UNCONFIRMED") throw new Error("Confirm whether the books use cash or accrual accounting.");
  const salesRate = Number(input.salesTaxRate);
  const lodgingRate = Number(input.lodgingTaxRate);
  const liquorRate = Number(input.liquorTaxRate);
  const compensatingRate = Number(input.consumerCompensatingTaxRate);
  if (!Number.isFinite(salesRate) || salesRate < 0 || salesRate > 25) throw new Error("Verify the combined sales-tax rate.");
  if (!Number.isFinite(lodgingRate) || lodgingRate < 0 || lodgingRate > 25) throw new Error("Verify the combined lodging-tax rate.");
  if (!Number.isFinite(liquorRate) || liquorRate < 0 || liquorRate > 25) throw new Error("Verify the liquor-liability tax rate.");
  if (!Number.isFinite(compensatingRate) || compensatingRate < 0 || compensatingRate > 25) throw new Error("Verify the consumer compensating-tax rate.");
  const now = new Date().toISOString();
  await db().prepare(`UPDATE tax_preparation_profiles SET accounting_method=?,accounting_method_confirmed=1,
    gross_includes_tax=?,sales_tax_rate=?,lodging_tax_rate=?,liquor_tax_rate=?,consumer_compensating_tax_rate=?,jurisdiction_label=?,verified_by=?,verified_at=?,updated_at=?
    WHERE organization_id=?`).bind(
      method, input.grossIncludesTax ? 1 : 0, salesRate, lodgingRate,
      liquorRate, compensatingRate, String(input.jurisdictionLabel ?? "").slice(0, 160), context.email, now, now, context.organizationId,
    ).run();
  return { updated: true };
}

export async function importTaxReport(
  email: string,
  file: { name: string },
  objectKey: string,
  text: string,
  input: { frequency: string; periodStart: string; periodEnd: string },
) {
  const context = await activeStaffContext(email);
  if (!context || context.role !== "admin") return null;
  await ensureTaxTables();
  const frequency: ImportFrequency = ["DAILY", "WEEKLY", "MONTHLY"].includes(input.frequency)
    ? input.frequency as ImportFrequency
    : "MONTHLY";
  const periodStart = String(input.periodStart);
  const periodEnd = String(input.periodEnd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart > periodEnd) {
    throw new Error("Select a valid report period.");
  }
  const duplicate = await db().prepare(`SELECT id FROM tax_source_imports
    WHERE organization_id=? AND lower(file_name)=lower(?) AND period_start=? AND period_end=? LIMIT 1`)
    .bind(context.organizationId, file.name, periodStart, periodEnd).first();
  if (duplicate) throw new Error("This report file and period were already imported. Remove or rename only after verifying it is a corrected report.");
  const parsed = parseDelimited(text);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db().prepare(`INSERT INTO tax_source_imports
      (id,organization_id,object_key,file_name,frequency,period_start,period_end,row_count,mapped_rows,
       exceptions_json,imported_by,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, context.organizationId, objectKey, file.name.slice(0, 180), frequency, periodStart, periodEnd,
        text.split(/\r?\n/).filter(Boolean).length - 1, parsed.rows.length, JSON.stringify(parsed.exceptions), email, now),
    ...parsed.rows.map((row) => db().prepare(`INSERT INTO tax_financial_facts
      (id,organization_id,import_id,business_date,source_reference,gross_revenue,taxable_room_revenue,
       taxable_other_sales,exempt_revenue,refunds,discounts,adjustments,operating_expenses,
       sales_tax_collected,lodging_tax_collected,liquor_sales,liquor_tax_collected,
       taxable_out_of_state_purchases,consumer_compensating_tax_paid,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, id, row.businessDate, row.sourceReference,
        row.grossRevenue, row.taxableRoomRevenue, row.taxableOtherSales, row.exemptRevenue, row.refunds,
        row.discounts, row.adjustments, row.operatingExpenses, row.salesTaxCollected, row.lodgingTaxCollected,
        row.liquorSales,row.liquorTaxCollected,row.taxableOutOfStatePurchases,row.consumerCompensatingTaxPaid,now)),
  ];
  await db().batch(statements);
  await emitReportEvent({
    organizationId: context.organizationId,
    sourceModule: "TAX_PREPARATION",
    eventType: "PMS_FINANCIAL_REPORT_IMPORTED",
    entityType: "tax_source_import",
    entityId: id,
    idempotencyKey: `tax-import:${id}`,
    occurredAt: now,
    payload: { frequency, periodStart, periodEnd, mappedRows: parsed.rows.length, exceptions: parsed.exceptions.length },
  });
  return { id, mappedRows: parsed.rows.length, exceptions: parsed.exceptions };
}

export async function prepareTaxWorkpaper(email: string, periodStart: string, periodEnd: string) {
  const context = await activeStaffContext(email);
  if (!context || context.role !== "admin") return null;
  await ensureTaxTables();
  const profile = await db().prepare("SELECT * FROM tax_preparation_profiles WHERE organization_id=?")
    .bind(context.organizationId).first<Record<string, any>>();
  if (!profile || !profile.accounting_method_confirmed || profile.gross_includes_tax === null ||
      profile.sales_tax_rate === null || profile.lodging_tax_rate === null ||
      profile.liquor_tax_rate === null || profile.consumer_compensating_tax_rate === null) {
    throw new Error("Verify accounting method, tax treatment, and jurisdiction rates before preparing a workpaper.");
  }
  const totals = await db().prepare(`SELECT COUNT(*) source_rows,
    COALESCE(SUM(gross_revenue),0) gross_revenue,
    COALESCE(SUM(taxable_room_revenue),0) taxable_room_revenue,
    COALESCE(SUM(taxable_other_sales),0) taxable_other_sales,
    COALESCE(SUM(exempt_revenue),0) exempt_revenue,
    COALESCE(SUM(refunds),0) refunds,COALESCE(SUM(discounts),0) discounts,
    COALESCE(SUM(adjustments),0) adjustments,COALESCE(SUM(operating_expenses),0) operating_expenses,
    COALESCE(SUM(sales_tax_collected),0) sales_tax_collected,
    COALESCE(SUM(lodging_tax_collected),0) lodging_tax_collected,
    COALESCE(SUM(liquor_sales),0) liquor_sales,COALESCE(SUM(liquor_tax_collected),0) liquor_tax_collected,
    COALESCE(SUM(taxable_out_of_state_purchases),0) taxable_out_of_state_purchases,
    COALESCE(SUM(consumer_compensating_tax_paid),0) consumer_compensating_tax_paid
    FROM tax_financial_facts WHERE organization_id=? AND business_date BETWEEN ? AND ?`)
    .bind(context.organizationId, periodStart, periodEnd).first<Record<string, number>>();
  if (!totals?.source_rows) throw new Error("No imported financial rows were found for this period.");
  const deductions = totals.refunds + totals.discounts + totals.adjustments;
  const combinedTaxable = totals.taxable_room_revenue + totals.taxable_other_sales;
  const adjustmentShare = Math.min(Math.max(0, deductions), Math.max(0, combinedTaxable));
  const salesAdjustment = combinedTaxable > 0 ? adjustmentShare * (totals.taxable_other_sales / combinedTaxable) : 0;
  const lodgingAdjustment = combinedTaxable > 0 ? adjustmentShare * (totals.taxable_room_revenue / combinedTaxable) : 0;
  const salesTaxableBase = Math.max(0, totals.taxable_other_sales - salesAdjustment);
  const lodgingTaxableBase = Math.max(0, totals.taxable_room_revenue - lodgingAdjustment);
  const computedSalesTax = salesTaxableBase * (profile.sales_tax_rate / 100);
  const computedLodgingTax = lodgingTaxableBase * (profile.lodging_tax_rate / 100);
  const computedLiquorTax=totals.liquor_sales*(profile.liquor_tax_rate/100);
  const computedConsumerCompensatingTax=totals.taxable_out_of_state_purchases*(profile.consumer_compensating_tax_rate/100);
  const taxVariance = (totals.sales_tax_collected - computedSalesTax) +
    (totals.lodging_tax_collected - computedLodgingTax)+
    (totals.liquor_tax_collected-computedLiquorTax)+
    (totals.consumer_compensating_tax_paid-computedConsumerCompensatingTax);
  const taxesExcluded = profile.gross_includes_tax
    ? totals.sales_tax_collected + totals.lodging_tax_collected + totals.liquor_tax_collected
    : 0;
  const netOperatingIncome = totals.gross_revenue - deductions - totals.operating_expenses - taxesExcluded;
  const exceptions: string[] = [];
  if (Math.abs(taxVariance) > 1) exceptions.push(`Collected-versus-computed tax variance: $${taxVariance.toFixed(2)}.`);
  if (totals.exempt_revenue > 0) exceptions.push("Tax-exempt revenue requires supporting exemption documentation.");
  if (totals.adjustments > 0) exceptions.push("Manual adjustments require source-report or manager support.");
  if (totals.operating_expenses === 0) exceptions.push("No operating-expense data was imported; provisional net income is incomplete.");
  const calculation = {
    ...totals, deductions, salesTaxableBase, lodgingTaxableBase, computedSalesTax,
    computedLodgingTax, computedLiquorTax, computedConsumerCompensatingTax, taxVariance, taxesExcluded, netOperatingIncome,
    accountingMethod: profile.accounting_method,
    grossIncludesTax: Boolean(profile.gross_includes_tax),
    salesTaxRate: profile.sales_tax_rate,
    lodgingTaxRate: profile.lodging_tax_rate,
    liquorTaxRate:profile.liquor_tax_rate,consumerCompensatingTaxRate:profile.consumer_compensating_tax_rate,
  };
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db().prepare(`INSERT INTO tax_return_workpapers
    (id,organization_id,period_start,period_end,accounting_method,calculation_json,status,
     exceptions_json,prepared_by,prepared_at,approved_by,approved_at)
    VALUES (?,?,?,?,?,?,'DRAFT_REVIEW_REQUIRED',?,?,?,NULL,NULL)
    ON CONFLICT(organization_id,period_start,period_end) DO UPDATE SET
      accounting_method=excluded.accounting_method,calculation_json=excluded.calculation_json,
      status='DRAFT_REVIEW_REQUIRED',exceptions_json=excluded.exceptions_json,
      prepared_by=excluded.prepared_by,prepared_at=excluded.prepared_at,approved_by=NULL,approved_at=NULL`)
    .bind(id, context.organizationId, periodStart, periodEnd, profile.accounting_method,
      JSON.stringify(calculation), JSON.stringify(exceptions), email, now).run();
  return { calculation, exceptions, status: "DRAFT_REVIEW_REQUIRED" };
}
