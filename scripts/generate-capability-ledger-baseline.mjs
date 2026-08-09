import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const appRoot = path.join(root, "app");
const generatedAt = "2026-08-03";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function source(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function variableInitializer(tree, name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node.initializer;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(tree);
  while (found && (ts.isAsExpression(found) || ts.isSatisfiesExpression(found) || ts.isParenthesizedExpression(found))) found = found.expression;
  return found;
}

function literal(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

const capabilityFile = path.join(root, "lib/aaiq-capabilities.ts");
const capabilityTree = source(capabilityFile);
const capabilityArray = variableInitializer(capabilityTree, "AAIQ_CAPABILITIES");
const capabilities = [];
if (capabilityArray && ts.isArrayLiteralExpression(capabilityArray)) {
  for (const element of capabilityArray.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;
    const row = {};
    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = property.name.getText(capabilityTree).replaceAll('"', "");
      row[key] = literal(property.initializer);
    }
    if (row.key && row.href && row.label) capabilities.push(row);
  }
}

const moduleOverrides = {
  AAIQ_QUALITY_CENTER: ["working_incomplete", "Property-scoped deterministic golden-case preparation, regression gating, shadow sampling, and named release review are implemented and automated tests pass; an independent judged/hybrid evaluator, representative live samples, and authorized human UAT remain required before working_verified."],
  AAIQ_SAMPLE_LAB: ["simulated", "Sample environments are explicitly synthetic and cannot be treated as production workflow evidence."],
  AAIQ_HOUSEKEEPING: ["working_incomplete", "A purpose-built departure-to-assignment-to-evidence-to-maintenance chain is implemented and automated tests pass; representative property sources, private media, and authorized human UAT remain required before working_verified."],
  AAIQ_MAINTENANCE: ["working_incomplete", "A dedicated property-scoped defect-to-repair workflow is implemented and automated tests pass; representative property staff, assets, private media, notification providers, and authorized human UAT remain required before working_verified."],
  AAIQ_COMPLIANCE_CENTER: ["working_incomplete", "A dedicated source-backed, property-scoped rule-to-reviewed-closure chain is implemented and automated tests pass; approved local sources/ranges, registered assets, eligible staff, private evidence, provider delivery, and authorized human UAT remain required before working_verified."],
  AAIQ_AGENT_STUDIO: ["working_incomplete", "Authority definitions and controls exist, but the catalog does not prove trigger-to-action-to-verification Digital Employee runtime chains."],
  AAIQ_PILOT_LAUNCH: ["working_incomplete", "Provisioning and checklist records exist, but earlier readiness controls accepted operator assertions without independent evidence."],
  AAIQ_REPORTING: ["working_incomplete", "Property-scoped operational metrics, exact source drill-down, task badge reconciliation, prior-period comparisons, RBAC, report receipts, and checksummed CSV exports are implemented and automated tests pass. PMS/finance/market sources and authorized human UAT remain required before working_verified."],
  AAIQ_WEBSITE_FACTORY: ["working_incomplete", "Draft/project logic exists; external publishing, source completeness, templates, and generated content are not verified end to end."],
  AAIQ_ONLINE_PRESENCE: ["working_incomplete", "Planning and federation screens exist; external social/network/phone/camera actions remain credential-gated and unverified."],
};

const entries = capabilities.map(item => {
  const override = moduleOverrides[item.key];
  return {
    itemKey: `module:${item.key}`,
    itemName: item.label,
    itemType: "module",
    owningModule: item.key,
    status: override?.[0] ?? "working_incomplete",
    knownGapDescription: override?.[1] ?? "The module has application code, but no stored seven-question workflow verification run and no human review establishes complete functional behavior.",
    sourcePath: `lib/aaiq-capabilities.ts#${item.key}`,
  };
});

function moduleForFile(relative) {
  const normalized = relative.replaceAll("\\", "/");
  if (normalized === "app/page.tsx" || normalized.startsWith("app/daymark")) return "AAIQ_HOME";
  const matches = capabilities
    .filter(item => item.href !== "/")
    .map(item => ({ ...item, prefix: `app${item.href}/` }))
    .filter(item => normalized.startsWith(item.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  if (matches[0]) return matches[0].key;
  if (normalized.startsWith("app/components/")) return "AAIQ_SHARED_SHELL";
  if (normalized.startsWith("app/reports/")) return "AAIQ_REPORTING";
  return `AAIQ_ROUTE_${normalized.split("/")[1]?.replaceAll("-", "_").toUpperCase() || "UNKNOWN"}`;
}

function attribute(opening, name) {
  return opening.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name);
}

function collectStrings(node, values = []) {
  if (ts.isJsxText(node)) {
    const value = node.getText().replace(/\s+/g, " ").trim();
    if (value) values.push(value);
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (node.text.trim()) values.push(node.text.trim());
  }
  ts.forEachChild(node, child => collectStrings(child, values));
  return values;
}

function buttonLabel(opening, node) {
  for (const name of ["aria-label", "title"]) {
    const item = attribute(opening, name);
    if (item?.initializer && ts.isStringLiteral(item.initializer)) return item.initializer.text;
  }
  const values = collectStrings(node).filter((value, index, all) => all.indexOf(value) === index);
  return values.slice(0, 4).join(" / ").slice(0, 180) || "Unlabeled button";
}

function hasSubmissionPath(node, opening) {
  if (attribute(opening, "onClick") || attribute(opening, "formAction")) return true;
  const type = attribute(opening, "type");
  if (type?.initializer && ts.isStringLiteral(type.initializer) && type.initializer.text === "submit") return true;
  let parent = node.parent;
  while (parent) {
    if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText() === "form") {
      return Boolean(attribute(parent.openingElement, "onSubmit") || attribute(parent.openingElement, "action"));
    }
    parent = parent.parent;
  }
  return false;
}

for (const file of walk(appRoot).filter(file => file.endsWith(".tsx"))) {
  const tree = source(file);
  const relative = path.relative(root, file).replaceAll("\\", "/");
  function visit(node) {
    let opening;
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "button") opening = node.openingElement;
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "button") opening = node;
    if (opening) {
      const location = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      const line = location.line + 1, column = location.character + 1;
      const wired = hasSubmissionPath(node, opening);
      entries.push({
        itemKey: `button:${relative}:${line}:${column}`,
        itemName: `${buttonLabel(opening, node)} [${relative}:${line}:${column}]`,
        itemType: "button",
        owningModule: moduleForFile(relative),
        status: wired ? "working_incomplete" : "ui_shell",
        knownGapDescription: wired
          ? "A handler or form path exists, but no stored seven-question workflow evidence and human review prove the resulting business outcome."
          : "Static inspection found no direct handler or governed form submission path; runtime behavior is unproven.",
        sourcePath: `${relative}:${line}:${column}`,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

const authorityFile = path.join(root, "db/digital-employee-authority.ts");
const authorityTree = source(authorityFile);
const authorityArray = variableInitializer(authorityTree, "AUTHORITY");
for (const element of authorityArray && ts.isArrayLiteralExpression(authorityArray) ? authorityArray.elements : []) {
  if (!ts.isArrayLiteralExpression(element)) continue;
  const [role, capability, description] = element.elements.map(literal);
  if (!role || !capability || !description) continue;
  entries.push({
    itemKey: `duty:${role}:${capability}`,
    itemName: `${role} — ${capability.replaceAll("_", " ")}`,
    itemType: "digital_employee_duty",
    owningModule: "AAIQ_AGENT_STUDIO",
    status: "ui_shell",
    knownGapDescription: `Authority policy exists (${description}), but the complete trigger → authorized data → decision → action/tool → independent verification → audit → escalation runtime is not evidenced.`,
    sourcePath: `db/digital-employee-authority.ts#${capability}`,
  });
}

const integrationFile = path.join(root, "db/open-source-integrations.ts");
const integrationTree = source(integrationFile);
for (const [variable, prefix] of [["DEFINITIONS", "integration"], ["CHANNEL_CATALOG", "channel"]]) {
  const array = variableInitializer(integrationTree, variable);
  if (!array || !ts.isArrayLiteralExpression(array)) continue;
  for (const element of array.elements) {
    if (!ts.isArrayLiteralExpression(element)) continue;
    const values = element.elements.map(literal);
    const [key, name] = values;
    if (!key || !name) continue;
    const status = variable === "DEFINITIONS" ? values[5] : "CONFIGURATION_REQUIRED";
    const credentialBlocked = status === "CONFIGURATION_REQUIRED" || status === "FEDERATION_PENDING" || variable === "CHANNEL_CATALOG";
    entries.push({
      itemKey: `${prefix}:${key}`,
      itemName: name,
      itemType: "integration",
      owningModule: variable === "DEFINITIONS" ? "AAIQ_INTEGRATION_CENTER" : "AAIQ_ONLINE_PRESENCE",
      status: credentialBlocked ? "blocked_credentials" : "working_incomplete",
      knownGapDescription: credentialBlocked
        ? "Provider credentials/federation and a successful read/action/verification evidence run are not available."
        : "Runtime code is present, but no human-reviewed external end-to-end verification artifact establishes the claimed integration outcome.",
      sourcePath: `db/open-source-integrations.ts#${key}`,
    });
  }
}

const reportingFile = path.join(root, "app/reports/pms-reporting-center.tsx");
const reportingTree = source(reportingFile);
const libraryArray = variableInitializer(reportingTree, "library");
if (libraryArray && ts.isArrayLiteralExpression(libraryArray)) {
  for (const section of libraryArray.elements) {
    if (!ts.isObjectLiteralExpression(section)) continue;
    let group = "Reporting", pending = false, items = [];
    for (const property of section.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = property.name.getText(reportingTree);
      if (key === "group") group = literal(property.initializer) ?? group;
      if (key === "pending") pending = property.initializer.kind === ts.SyntaxKind.TrueKeyword;
      if (key === "items" && ts.isArrayLiteralExpression(property.initializer)) {
        items = property.initializer.elements.flatMap(item => {
          const simple = literal(item);
          if (simple) return [{ name: simple, pending }];
          if (!ts.isObjectLiteralExpression(item)) return [];
          let name = null, itemPending = pending;
          for (const field of item.properties) {
            if (!ts.isPropertyAssignment(field)) continue;
            const fieldName = field.name.getText(reportingTree).replaceAll('"', "");
            if (fieldName === "label") name = literal(field.initializer);
            if (fieldName === "pending") itemPending = field.initializer.kind === ts.SyntaxKind.TrueKeyword;
          }
          return name ? [{ name, pending: itemPending }] : [];
        });
      }
    }
    for (const item of items) entries.push({
      itemKey: `report:${group}:${item.name}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-"),
      itemName: item.name,
      itemType: "report",
      owningModule: "AAIQ_REPORTING",
      status: item.pending || pending ? "blocked_credentials" : "working_incomplete",
      knownGapDescription: item.pending || pending
        ? "The required OPERA/OHIP revenue, folio, settlement, or tax source connection is not configured and verified."
        : "A report entry and supporting query path exist, but reconciliation accuracy, RBAC, drill-down, export, failure behavior, and human-reviewed evidence are not all proven.",
      sourcePath: "app/reports/pms-reporting-center.tsx#library",
    });
  }
}

entries.sort((a, b) => a.itemType.localeCompare(b.itemType) || a.owningModule.localeCompare(b.owningModule) || a.itemName.localeCompare(b.itemName));
const duplicateKeys = entries.filter((row, index) => entries.findIndex(other => other.itemKey === row.itemKey) !== index);
if (duplicateKeys.length) throw new Error(`Duplicate ledger keys: ${duplicateKeys.map(row => row.itemKey).join(", ")}`);

const generatedModule = `// Generated by scripts/generate-capability-ledger-baseline.mjs. Do not hand-edit.\nexport const CAPABILITY_LEDGER_BASELINE_VERSION = "${generatedAt}-b3-5";\nexport type BaselineCapabilityStatus = "working_verified"|"working_incomplete"|"simulated"|"ui_shell"|"broken"|"blocked_credentials";\nexport type BaselineCapabilityItem = {itemKey:string;itemName:string;itemType:"module"|"button"|"digital_employee_duty"|"integration"|"report";owningModule:string;status:BaselineCapabilityStatus;knownGapDescription:string;sourcePath:string};\nexport const CAPABILITY_LEDGER_BASELINE = ${JSON.stringify(entries, null, 2)} as const satisfies readonly BaselineCapabilityItem[];\n`;
fs.writeFileSync(path.join(root, "lib/capability-ledger-baseline.ts"), generatedModule);

const counts = entries.reduce((map, row) => {
  map.types[row.itemType] = (map.types[row.itemType] ?? 0) + 1;
  map.statuses[row.status] = (map.statuses[row.status] ?? 0) + 1;
  return map;
}, { types: {}, statuses: {} });
const lines = [
  "# AAIQ Truthful Capability Ledger Baseline — 2026-08-03",
  "",
  "> Constitution status: baseline only. No row is `working_verified`; Mukesh must review stored workflow evidence before that status is permitted.",
  "",
  "## Scope and method",
  "",
  "This ledger inventories the canonical module registry, every JSX `<button>` found in the application source, every Digital Employee authority duty, governed/open-channel integrations, and the Enterprise Reports catalog. Static discovery can establish that code or controls exist; it cannot establish functional success. Accordingly, wired controls are at most `working_incomplete`, unproven duties are `ui_shell`, explicitly synthetic behavior is `simulated`, and external providers without verified credentials are `blocked_credentials`.",
  "",
  `Total entries: **${entries.length}**. Modules: **${counts.types.module ?? 0}**; buttons: **${counts.types.button ?? 0}**; Digital Employee duties: **${counts.types.digital_employee_duty ?? 0}**; integrations/channels: **${counts.types.integration ?? 0}**; reports: **${counts.types.report ?? 0}**.`,
  "",
  "## Status summary",
  "",
  "| Status | Count | Meaning in this baseline |",
  "|---|---:|---|",
  ...Object.entries(counts.statuses).sort().map(([status, count]) => `| ${status} | ${count} | Not human-verified; see each known gap. |`),
  "",
  "## Ledger",
  "",
  "| Type | Item | Owning module | Status | Known gap | Source |",
  "|---|---|---|---|---|---|",
  ...entries.map(row => `| ${row.itemType} | ${row.itemName.replaceAll("|", "\\|")} | ${row.owningModule} | ${row.status} | ${row.knownGapDescription.replaceAll("|", "\\|")} | ${row.sourcePath} |`),
  "",
  "## Verification gate",
  "",
  "An item can only be proposed for `working_verified` after a stored `workflow_verification_runs` record answers all seven constitutional questions, includes a deliberately tested failure case, has an openable audit URL, and is reviewed by Mukesh. The application enforces this in the live ledger update path.",
  "",
];
fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, `docs/capability_ledger_baseline_${generatedAt}.md`), lines.join("\n"));
console.log(JSON.stringify({ total: entries.length, ...counts }, null, 2));
