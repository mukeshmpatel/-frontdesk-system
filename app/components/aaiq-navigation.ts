// Compatibility re-export. Canonical entries, including AAIQ Pilot Launch Center,
// live in lib/aaiq-capabilities.ts so navigation and authorization cannot diverge.
export { AAIQ_CAPABILITIES as AAIQ_NAVIGATION, AAIQ_NAVIGATION_GROUPS } from "../../lib/aaiq-capabilities";
export type { AaiqCapability as AaiqNavigationItem } from "../../lib/aaiq-capabilities";
