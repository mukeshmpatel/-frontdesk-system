/**
 * Compatibility facade only.
 *
 * Enterprise reporting has one implementation owner: db/reporting-layer.ts.
 * Existing imports are preserved here so older bookmarks and tests do not fork
 * totals, property scope, or drill-down policy.
 * Legacy bookmarks stored in report_drilldown_tokens are resolved by
 * reportDrilldown in the canonical reporting owner.
 * Canonical metric identifiers, including housekeeping-work and
 * compliance-work, remain defined only in that owner.
 */
export {
  reportDashboardSummary as reportSummary,
  reportDrilldown,
  reportMetricDrilldown,
} from "./reporting-layer";
