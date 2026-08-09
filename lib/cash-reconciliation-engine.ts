export type CashSourceRow = {
  businessDate: string;
  shiftCode: string;
  amountCents: number;
  sourceReference: string;
  occurredAt: string | null;
  sourceRowNumber: number;
  rawRowText: string;
};

export type CashSessionRow = {
  id: string;
  shiftCode: string;
  employeeEmail: string;
  status: string;
  employeeCountedCents: number;
  managerReceivedCents: number | null;
  submittedAt: string | null;
  verifiedAt: string | null;
};

export type CashShiftReconciliation = {
  shiftCode: string;
  expectedCents: number | null;
  countedCents: number;
  varianceCents: number | null;
  sourceRowCount: number;
  sessionCount: number;
  submittedSessionCount: number;
  managerVerifiedSessionCount: number;
  sourceReferences: string[];
  sessionIds: string[];
  gaps: Array<"MISSING_SOURCE" | "MISSING_DROP" | "MISSING_MANAGER_VERIFICATION">;
};

export type CashReconciliationResult = {
  expectedTotalCents: number | null;
  countedTotalCents: number;
  varianceCents: number | null;
  sourceStatus: "AVAILABLE" | "UNAVAILABLE" | "INVALID";
  reconciliationStatus: "SOURCE_UNAVAILABLE" | "PENDING_REVIEW" | "RECONCILED_CLEAN" | "RECONCILED_WITH_VARIANCE";
  unresolvedGapCount: number;
  shifts: CashShiftReconciliation[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeBusinessDate(value: unknown) {
  const date = String(value ?? "").trim();
  if (!DATE_RE.test(date)) throw new Error("Business date must use YYYY-MM-DD.");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Enter a real calendar business date.");
  }
  return date;
}

export function businessDateInTimezone(timezone = "America/Chicago", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return normalizeBusinessDate(`${part("year")}-${part("month")}-${part("day")}`);
}

export function normalizeShiftCode(value: unknown) {
  const shift = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  if (!shift) throw new Error("Every cash row needs a shift code.");
  return shift;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += character;
  }
  if (quoted) throw new Error("A quoted CSV value is not closed.");
  cells.push(value.trim());
  return cells;
}

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function headerIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function moneyToCents(value: string, header: string) {
  const cleaned = value.trim().replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!cleaned || !/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) throw new Error(`Invalid cash amount "${value}".`);
  const numeric = Number(cleaned);
  const cents = header.includes("cents") ? numeric : numeric * 100;
  if (!Number.isSafeInteger(Math.round(cents)) || Math.abs(cents) > 100_000_000_000) throw new Error("Cash amount is outside the supported range.");
  return Math.round(cents);
}

export function parseCashReport(content: string, fallbackBusinessDate: string): CashSourceRow[] {
  const businessDate = normalizeBusinessDate(fallbackBusinessDate);
  if (typeof content !== "string" || !content.trim()) throw new Error("Paste the authorized cash report rows before importing.");
  if (new TextEncoder().encode(content).byteLength > 1_000_000) throw new Error("Cash report content must be 1 MB or smaller.");
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Cash report must contain a header and at least one data row.");
  if (lines.length > 10_001) throw new Error("Cash report is limited to 10,000 data rows per batch.");
  const headers = parseCsvLine(lines[0]).map(normalizedHeader);
  const dateIndex = headerIndex(headers, ["business_date", "businessdate", "date", "business_day"]);
  const shiftIndex = headerIndex(headers, ["shift", "shift_code", "shift_name", "desk_shift"]);
  const amountIndex = headerIndex(headers, ["cash", "cash_amount", "amount", "net_cash", "cash_collected", "amount_cents", "cash_cents"]);
  const referenceIndex = headerIndex(headers, ["reference", "transaction_reference", "transaction_id", "receipt", "id"]);
  const occurredIndex = headerIndex(headers, ["occurred_at", "timestamp", "transaction_time", "time"]);
  if (shiftIndex < 0 || amountIndex < 0) throw new Error("Required CSV headers are shift and cash_amount. business_date may be omitted when the selected date applies to every row.");
  const rows: CashSourceRow[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = parseCsvLine(lines[lineIndex]);
    try {
      const rowBusinessDate = dateIndex >= 0 && cells[dateIndex] ? normalizeBusinessDate(cells[dateIndex]) : businessDate;
      if (rowBusinessDate !== businessDate) throw new Error(`row business date ${rowBusinessDate} does not match selected date ${businessDate}`);
      const occurredRaw = occurredIndex >= 0 ? String(cells[occurredIndex] ?? "").trim() : "";
      const occurredAt = occurredRaw ? new Date(occurredRaw) : null;
      if (occurredRaw && Number.isNaN(occurredAt?.getTime())) throw new Error(`invalid transaction time "${occurredRaw}"`);
      rows.push({
        businessDate: rowBusinessDate,
        shiftCode: normalizeShiftCode(cells[shiftIndex]),
        amountCents: moneyToCents(String(cells[amountIndex] ?? ""), headers[amountIndex]),
        sourceReference: String(referenceIndex >= 0 ? cells[referenceIndex] ?? "" : "").trim().slice(0, 160) || `ROW-${lineIndex + 1}`,
        occurredAt: occurredAt?.toISOString() ?? null,
        sourceRowNumber: lineIndex + 1,
        rawRowText: lines[lineIndex].slice(0, 2_000),
      });
    } catch (error) {
      throw new Error(`Cash report row ${lineIndex + 1}: ${error instanceof Error ? error.message : "invalid row"}.`);
    }
  }
  return rows;
}

export function computeCashReconciliation(input: {
  expectedShiftCodes: string[];
  sourceRows: CashSourceRow[];
  sessions: CashSessionRow[];
}): CashReconciliationResult {
  const expectedShifts = Array.from(new Set(input.expectedShiftCodes.map(normalizeShiftCode)));
  const shiftCodes = Array.from(new Set([
    ...expectedShifts,
    ...input.sourceRows.map((row) => normalizeShiftCode(row.shiftCode)),
    ...input.sessions.map((row) => normalizeShiftCode(row.shiftCode)),
  ])).sort((a, b) => expectedShifts.indexOf(a) - expectedShifts.indexOf(b) || a.localeCompare(b));
  const shifts: CashShiftReconciliation[] = shiftCodes.map((shiftCode) => {
    const sources = input.sourceRows.filter((row) => normalizeShiftCode(row.shiftCode) === shiftCode);
    const sessions = input.sessions.filter((row) => normalizeShiftCode(row.shiftCode) === shiftCode);
    const submitted = sessions.filter((row) => ["SUBMITTED", "VERIFIED"].includes(row.status));
    const managerVerified = sessions.filter((row) => row.status === "VERIFIED" && row.managerReceivedCents !== null);
    const expectedCents = sources.length ? sources.reduce((sum, row) => sum + row.amountCents, 0) : null;
    const countedCents = submitted.reduce((sum, row) => sum + (row.managerReceivedCents ?? row.employeeCountedCents), 0);
    const gaps: CashShiftReconciliation["gaps"] = [];
    if (expectedShifts.includes(shiftCode) && !sources.length) gaps.push("MISSING_SOURCE");
    if (expectedShifts.includes(shiftCode) && !submitted.length) gaps.push("MISSING_DROP");
    if (submitted.length && managerVerified.length < submitted.length) gaps.push("MISSING_MANAGER_VERIFICATION");
    return {
      shiftCode,
      expectedCents,
      countedCents,
      varianceCents: expectedCents === null ? null : countedCents - expectedCents,
      sourceRowCount: sources.length,
      sessionCount: sessions.length,
      submittedSessionCount: submitted.length,
      managerVerifiedSessionCount: managerVerified.length,
      sourceReferences: Array.from(new Set(sources.map((row) => row.sourceReference))),
      sessionIds: sessions.map((row) => row.id),
      gaps,
    };
  });
  const missingSourceCount = shifts.filter((shift) => shift.gaps.includes("MISSING_SOURCE")).length;
  const sourceStatus: CashReconciliationResult["sourceStatus"] = input.sourceRows.length === 0 ? "UNAVAILABLE" : missingSourceCount ? "INVALID" : "AVAILABLE";
  const expectedTotalCents = sourceStatus === "AVAILABLE" ? shifts.reduce((sum, shift) => sum + Number(shift.expectedCents ?? 0), 0) : null;
  const countedTotalCents = shifts.reduce((sum, shift) => sum + shift.countedCents, 0);
  const varianceCents = expectedTotalCents === null ? null : countedTotalCents - expectedTotalCents;
  const unresolvedGapCount = shifts.reduce((sum, shift) => sum + shift.gaps.length, 0);
  const reconciliationStatus: CashReconciliationResult["reconciliationStatus"] = sourceStatus !== "AVAILABLE"
    ? "SOURCE_UNAVAILABLE"
    : unresolvedGapCount
      ? "PENDING_REVIEW"
      : varianceCents === 0
        ? "RECONCILED_CLEAN"
        : "RECONCILED_WITH_VARIANCE";
  return { expectedTotalCents, countedTotalCents, varianceCents, sourceStatus, reconciliationStatus, unresolvedGapCount, shifts };
}

