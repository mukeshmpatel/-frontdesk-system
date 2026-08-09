export type DepartureStatus = "DEPARTED" | "DUE_OUT" | "DIRTY";
export type ParsedDeparture = {
  sourceRowNumber: number;
  roomNumber: string;
  departureStatus: DepartureStatus;
  guestReference: string | null;
  departedAt: string | null;
  expectedArrivalAt: string | null;
  earlyArrival: boolean;
  vip: boolean;
  rawRowText: string;
  parseConfidence: number;
};

export type ParseIssue = { sourceRowNumber: number; reason: string; rawRowText: string };
export type HousekeeperCandidate = { email: string; displayName: string; openLoad: number; clockedIn: boolean };
export type PlannedAssignment = {
  departure: ParsedDeparture;
  assignedToEmail: string | null;
  assignedToName: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  priorityScore: number;
  dueAt: string;
  rosterSource: "CLOCKED_IN" | "PROPERTY_ASSIGNMENT" | "NO_ELIGIBLE_ROSTER";
  decisionReason: { policy: string; facts: string[]; assignment: string; candidateLoadBefore: number | null };
};

export const HOUSEKEEPING_POLICY_VERSION = "HK-DEPARTURE-PRIORITY-V1";
export const REQUIRED_HOUSEKEEPING_EVIDENCE = [
  { area: "ENTRY", stage: "BEFORE" },
  { area: "ENTRY", stage: "AFTER" },
  { area: "BEDS", stage: "AFTER" },
  { area: "BATHROOM", stage: "AFTER" },
  { area: "VANITY", stage: "AFTER" },
  { area: "FLOOR", stage: "AFTER" },
  { area: "FINAL_WIDE", stage: "AFTER" },
] as const;

const truthy = new Set(["1", "TRUE", "YES", "Y", "VIP", "EARLY"]);
const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function splitDelimited(line: string) {
  const delimiter = line.includes("\t") ? "\t" : line.includes("|") ? "|" : line.includes(";") ? ";" : ",";
  const values: string[] = [];
  let current = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) { values.push(current.trim()); current = ""; }
    else current += character;
  }
  values.push(current.trim());
  return values;
}

function valueFor(row: Record<string, string>, names: string[]) {
  for (const name of names) if (row[name]?.trim()) return row[name].trim();
  return "";
}

function safeDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusFrom(value: string, raw: string): DepartureStatus | null {
  const upper = `${value} ${raw}`.toUpperCase();
  if (/CHECKED[ -]?OUT|DEPARTED|ACTUAL DEPARTURE/.test(upper)) return "DEPARTED";
  if (/DUE[ -]?OUT|EXPECTED DEPARTURE|DEPARTURE TODAY/.test(upper)) return "DUE_OUT";
  if (/VACANT[ -]?DIRTY|\bVD\b|\bDIRTY\b/.test(upper)) return "DIRTY";
  return null;
}

export function parseDepartureReport(text: string): { rows: ParsedDeparture[]; issues: ParseIssue[]; totalDataRows: number } {
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 1001);
  if (!rawLines.length) throw new Error("The departure report is empty.");
  const first = splitDelimited(rawLines[0]);
  const normalized = first.map(normalizeHeader);
  const hasHeader = normalized.some(header => ["room", "room_number", "room_no", "roomnumber"].includes(header));
  const headers = hasHeader ? normalized : [];
  const lines = hasHeader ? rawLines.slice(1) : rawLines;
  const rows: ParsedDeparture[] = [], issues: ParseIssue[] = [];
  lines.forEach((rawRowText, index) => {
    const sourceRowNumber = index + (hasHeader ? 2 : 1);
    const values = splitDelimited(rawRowText);
    const record: Record<string, string> = {};
    headers.forEach((header, position) => { record[header] = values[position] ?? ""; });
    const room = (hasHeader
      ? valueFor(record, ["room", "room_number", "room_no", "roomnumber"])
      : values.find(value => /^[a-z]?\d{2,5}[a-z]?$/i.test(value)) ?? rawRowText.match(/\b\d{2,5}\b/)?.[0] ?? "")
      .replace(/[^a-z0-9-]/gi, "").slice(0, 12);
    const validRoom = /^(?=.*\d)[a-z0-9-]{1,12}$/i.test(room);
    const statusValue = hasHeader ? valueFor(record, ["status", "room_status", "departure_status", "reservation_status"]) : "";
    const departureStatus = statusFrom(statusValue, rawRowText);
    if (!validRoom || !departureStatus) {
      issues.push({ sourceRowNumber, reason: !room ? "ROOM_NUMBER_MISSING" : !validRoom ? "ROOM_NUMBER_INVALID" : "DEPARTURE_STATUS_UNRECOGNIZED", rawRowText: rawRowText.slice(0, 1000) });
      return;
    }
    const vipValue = hasHeader ? valueFor(record, ["vip", "vip_status", "is_vip"]) : "";
    const earlyValue = hasHeader ? valueFor(record, ["early_arrival", "early_checkin", "early_check_in"]) : "";
    const departedAtValue = hasHeader ? valueFor(record, ["departed_at", "checkout_at", "checked_out_at", "departure_time"]) : "";
    const arrivalValue = hasHeader ? valueFor(record, ["expected_arrival_at", "next_arrival_at", "arrival_time", "next_checkin"]) : "";
    const departedAt = safeDate(departedAtValue), expectedArrivalAt = safeDate(arrivalValue);
    const guest = hasHeader ? valueFor(record, ["guest_reference", "confirmation", "confirmation_number", "reservation_reference"]) : "";
    const earlyArrival = truthy.has(earlyValue.toUpperCase()) || /EARLY[ -]?(ARRIVAL|CHECK.?IN)/i.test(rawRowText);
    const vip = truthy.has(vipValue.toUpperCase()) || /\bVIP\b/i.test(rawRowText);
    const suppliedDates = [departedAtValue, arrivalValue].filter(Boolean).length;
    const validDates = [departedAt, expectedArrivalAt].filter(Boolean).length;
    const parseConfidence = Math.max(0.5, Math.min(1, 0.75 + (hasHeader ? 0.15 : 0) + (suppliedDates === validDates ? 0.1 : 0)));
    rows.push({ sourceRowNumber, roomNumber: room, departureStatus, guestReference: guest ? guest.slice(-24) : null,
      departedAt, expectedArrivalAt, earlyArrival, vip, rawRowText: rawRowText.slice(0, 1000), parseConfidence });
  });
  if (!rows.length) throw new Error("No recognizable departure rows were found. Include a room number and a status such as Departed, Due Out, or Vacant Dirty.");
  return { rows, issues, totalDataRows: lines.length };
}

export function scoreDeparture(row: ParsedDeparture) {
  let score = 0;
  const facts: string[] = [];
  if (row.departureStatus === "DEPARTED") { score += 40; facts.push("guest_departed:+40"); }
  else if (row.departureStatus === "DUE_OUT") { score += 10; facts.push("due_out:+10"); }
  else facts.push("vacant_dirty:+0");
  if (row.earlyArrival) { score += 30; facts.push("early_arrival_pressure:+30"); }
  if (row.vip) { score += 20; facts.push("vip:+20"); }
  const priority = score >= 80 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW";
  return { score, priority, facts } as const;
}

export function planHousekeepingAssignments(rows: ParsedDeparture[], candidates: HousekeeperCandidate[], now = new Date()): PlannedAssignment[] {
  const clocked = candidates.filter(candidate => candidate.clockedIn);
  const available = (clocked.length ? clocked : candidates).map(candidate => ({ ...candidate }));
  const rosterSource: PlannedAssignment["rosterSource"] = clocked.length ? "CLOCKED_IN" : available.length ? "PROPERTY_ASSIGNMENT" : "NO_ELIGIBLE_ROSTER";
  return [...rows].sort((left, right) => scoreDeparture(right).score - scoreDeparture(left).score || left.roomNumber.localeCompare(right.roomNumber)).map(departure => {
    const scored = scoreDeparture(departure);
    available.sort((left, right) => left.openLoad - right.openLoad || left.email.localeCompare(right.email));
    const candidate = available[0] ?? null;
    const candidateLoadBefore = candidate?.openLoad ?? null;
    if (candidate) candidate.openLoad += 1;
    const minutes = scored.priority === "CRITICAL" ? 30 : scored.priority === "HIGH" ? 60 : scored.priority === "MEDIUM" ? 120 : 180;
    const sourceDue = departure.expectedArrivalAt ? new Date(departure.expectedArrivalAt) : null;
    const due = sourceDue && sourceDue > now ? sourceDue : new Date(now.getTime() + minutes * 60_000);
    return { departure, assignedToEmail: candidate?.email ?? null, assignedToName: candidate?.displayName ?? null,
      priority: scored.priority, priorityScore: scored.score, dueAt: due.toISOString(), rosterSource,
      decisionReason: { policy: HOUSEKEEPING_POLICY_VERSION, facts: scored.facts,
        assignment: candidate ? `lowest_open_load:${candidate.email}` : "no_eligible_housekeeping_roster",
        candidateLoadBefore } };
  });
}

export function decideHousekeepingInspection(input: {
  evidence: Array<{ area: string; stage: string; status: string }>;
  checklist: Array<{ key: string; passed: boolean; note?: string }>;
  confidence: number | null;
  supervisorDecision: boolean;
}) {
  const missing = REQUIRED_HOUSEKEEPING_EVIDENCE.filter(required => !input.evidence.some(item =>
    item.area === required.area && item.stage === required.stage && item.status !== "REWORK_REQUIRED"));
  if (missing.length) return { outcome: "MISSING_EVIDENCE" as const, missing, failed: [] };
  const failed = input.checklist.filter(item => !item.passed);
  if (failed.length) return { outcome: "MAINTENANCE_HOLD" as const, missing: [], failed };
  if (!input.supervisorDecision || input.confidence === null || input.confidence < 0.8)
    return { outcome: "SUPERVISOR_REVIEW" as const, missing: [], failed: [] };
  return { outcome: "VERIFIED" as const, missing: [], failed: [] };
}
