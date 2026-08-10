"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

export default function TaxCenterClient() {
  const [data, setData] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [workpaper, setWorkpaper] = useState<any>(null);

  async function load() {
    const response = await fetch("/api/v1/tax-center", { cache: "no-store" });
    setData(await response.json());
  }
  useEffect(() => { void load(); }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/tax-center", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "profile",
        accountingMethod: form.get("accountingMethod"),
        grossIncludesTax: form.get("grossIncludesTax") === "on",
        salesTaxRate: form.get("salesTaxRate"),
        lodgingTaxRate: form.get("lodgingTaxRate"),
        liquorTaxRate:form.get("liquorTaxRate"),
        consumerCompensatingTaxRate:form.get("consumerCompensatingTaxRate"),
        jurisdictionLabel: form.get("jurisdictionLabel"),
        confirmed: form.get("confirmed") === "on",
      }),
    });
    const result = await response.json() as any;
    setNotice(result.error ?? "Accounting method and tax assumptions verified.");
    if (response.ok) await load();
  }

  async function upload(file?: File) {
    if (!file) return;
    setNotice("AAIQ is mapping and validating the PMS report…");
    const form = new FormData();
    form.set("file", file);
    form.set("frequency", frequency);
    form.set("periodStart", periodStart);
    form.set("periodEnd", periodEnd);
    const response = await fetch("/api/v1/tax-center", { method: "POST", body: form });
    const result = await response.json() as any;
    setNotice(result.error ?? `${result.mappedRows} financial rows mapped. ${result.exceptions.length} exception(s) need review.`);
    if (response.ok) await load();
  }

  async function prepare() {
    const response = await fetch("/api/v1/tax-center", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "prepare", periodStart, periodEnd }),
    });
    const result = await response.json() as any;
    setNotice(result.error ?? "Draft return workpaper prepared for manager review.");
    if (response.ok) { setWorkpaper(result); await load(); }
  }

  const latest = useMemo(() => {
    const item = workpaper ?? (data?.workpapers?.[0] ? {
      calculation: JSON.parse(data.workpapers[0].calculation_json),
      exceptions: JSON.parse(data.workpapers[0].exceptions_json),
      status: data.workpapers[0].status,
    } : null);
    return item;
  }, [data, workpaper]);

  if (!data) return <main className="tax-shell"><p>Loading AAIQ Tax & Profit Center…</p></main>;
  const profile = data.profile ?? {};
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

  return <main className="tax-shell">
    <header><a href="/">← AAIQ Home</a><div><p>Financial automation</p><h1>AAIQ Tax & Profit Center</h1><span>Prepare sales, lodging, liquor-liability and consumer compensating-tax workpapers with provisional net income.</span></div><b>DRAFTS REQUIRE REVIEW</b></header>
    {notice && <div className="tax-notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    <section className="tax-warning"><strong>Preparation control</strong><p>AAIQ prepares auditable workpapers; it does not file a return or provide tax advice. Verify jurisdiction rules, exemptions, accounting treatment and source totals before submission.</p></section>
    <section className="tax-grid">
      <form className="tax-card" onSubmit={saveProfile}>
        <small>STEP 1 · REQUIRED VERIFICATION</small><h2>Accounting & tax profile</h2>
        <label>Accounting method<select name="accountingMethod" defaultValue={profile.accounting_method ?? "UNCONFIRMED"}><option value="UNCONFIRMED">Select and verify…</option><option value="CASH">Cash basis</option><option value="ACCRUAL">Accrual basis</option></select></label>
        <label>Tax jurisdiction<input name="jurisdictionLabel" defaultValue={profile.jurisdiction_label ?? ""} placeholder="Example: Salina, Kansas"/></label>
        <div className="tax-fields"><label>Sales tax rate (%)<input name="salesTaxRate" type="number" step=".0001" min="0" max="25" defaultValue={profile.sales_tax_rate ?? ""}/></label><label>Lodging tax rate (%)<input name="lodgingTaxRate" type="number" step=".0001" min="0" max="25" defaultValue={profile.lodging_tax_rate ?? ""}/></label></div>
        <div className="tax-fields"><label>Liquor liability tax rate (%)<input name="liquorTaxRate" type="number" step=".0001" min="0" max="25" defaultValue={profile.liquor_tax_rate ?? ""}/></label><label>Consumer compensating tax rate (%)<input name="consumerCompensatingTaxRate" type="number" step=".0001" min="0" max="25" defaultValue={profile.consumer_compensating_tax_rate ?? ""}/></label></div>
        <label className="tax-check"><input name="grossIncludesTax" type="checkbox" defaultChecked={Boolean(profile.gross_includes_tax)}/>PMS gross revenue includes collected sales/lodging taxes</label>
        <label className="tax-check confirm"><input name="confirmed" type="checkbox" required/>I verified the accounting method and rates against current records.</label>
        <button disabled={data.role !== "admin"}>Save verified profile</button>
      </form>
      <section className="tax-card">
        <small>STEP 2 · SOURCE INGESTION</small><h2>Upload revenue report</h2><p>No PMS integration? Upload the daily, weekly or monthly CSV/text revenue report. AAIQ maps common PMS columns and identifies exceptions.</p>
        <div className="tax-fields"><label>Frequency<select value={frequency} onChange={(e) => setFrequency(e.target.value)}><option>DAILY</option><option>WEEKLY</option><option>MONTHLY</option></select></label><label>Period start<input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}/></label><label>Period end<input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}/></label></div>
        <label className="tax-upload">Choose PMS revenue report<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => void upload(e.target.files?.[0])}/></label>
        <div className="tax-imports">{data.imports.slice(0, 4).map((item: Row) => <article key={item.id}><b>{item.file_name}</b><span>{item.frequency} · {item.period_start} to {item.period_end}</span><em>{item.mapped_rows} mapped rows</em></article>)}</div>
      </section>
    </section>
    <section className="tax-prepare"><div><small>STEP 3 · RECONCILIATION</small><h2>Prepare return workpaper</h2><p>Calculates taxable bases, collected-versus-computed variance, adjustments, deductions and provisional net operating income.</p></div><button onClick={() => void prepare()}>Prepare draft →</button></section>
    {latest && <section className="tax-results">
      <header><div><small>AI-ASSISTED DRAFT</small><h2>Reconciled workpaper</h2></div><b>{latest.status.replaceAll("_", " ")}</b></header>
      <div className="tax-metrics"><article><span>Gross revenue</span><strong>{money(latest.calculation.gross_revenue)}</strong></article><article><span>Refunds, discounts & adjustments</span><strong>{money(latest.calculation.deductions)}</strong></article><article><span>Operating expenses</span><strong>{money(latest.calculation.operating_expenses)}</strong></article><article><span>Provisional net operating income</span><strong>{money(latest.calculation.netOperatingIncome)}</strong></article><article><span>Computed sales tax</span><strong>{money(latest.calculation.computedSalesTax)}</strong></article><article><span>Computed lodging tax</span><strong>{money(latest.calculation.computedLodgingTax)}</strong></article><article><span>Computed liquor liability tax</span><strong>{money(latest.calculation.computedLiquorTax)}</strong></article><article><span>Consumer compensating tax</span><strong>{money(latest.calculation.computedConsumerCompensatingTax)}</strong></article></div>
      <div className="tax-exceptions"><strong>Verification queue</strong>{latest.exceptions.length ? latest.exceptions.map((item: string) => <p key={item}>⚠ {item}</p>) : <p>✓ No automated exceptions detected. Source and jurisdiction review is still required.</p>}</div>
    </section>}
  </main>;
}
