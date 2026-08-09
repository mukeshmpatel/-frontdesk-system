export const AAIQ_NAVIGATION_GROUPS = ["My Work", "Hotel Operations", "People & Knowledge", "Growth & Revenue", "Technology & Control"] as const;

export type AaiqNavigationGroup = typeof AAIQ_NAVIGATION_GROUPS[number];
export type AaiqCapability = {
  key: string;
  href: string;
  label: string;
  group: AaiqNavigationGroup;
  badge?: string;
  tone?: "green" | "gold" | "blue";
};

/**
 * Canonical AAIQ capability registry.
 * Navigation, access administration, page/API authorization and help must use
 * these exact keys instead of maintaining local module lists.
 */
export const AAIQ_CAPABILITIES = [
  { key: "AAIQ_HOME", href: "/", label: "AAIQ Today", group: "My Work" },
  { key: "AAIQ_ACTION_CENTER", href: "/action-center", label: "AAIQ Action Center", group: "My Work" },
  { key: "AAIQ_PILOT_LAUNCH", href: "/aaiq-pilot-launch", label: "AAIQ Sample Launch Center", group: "My Work", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_DIGITAL_FRONT_DESK", href: "/digital-front-desk", label: "AAIQ Digital Front Desk", group: "Hotel Operations", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_HOUSEKEEPING", href: "/housekeeping", label: "AAIQ Housekeeping", group: "Hotel Operations", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_MAINTENANCE", href: "/maintenance", label: "AAIQ Maintenance", group: "Hotel Operations", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_COMPLIANCE_CENTER", href: "/compliance-center", label: "AAIQ Compliance Center", group: "Hotel Operations" },
  { key: "AAIQ_PROPERTY_OPERATIONS", href: "/property-operations", label: "AAIQ Team Operations", group: "Hotel Operations" },
  { key: "AAIQ_EVENT_WORKFORCE", href: "/aaiq-event-workforce", label: "AAIQ Event Workforce", group: "Hotel Operations", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_TIME_MANAGEMENT", href: "/workforce-time-clock", label: "AAIQ Workforce & Time Clock", group: "People & Knowledge", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_WORKFORCE_LIFECYCLE", href: "/aaiq-workforce-lifecycle", label: "AAIQ Hiring & Workforce Lifecycle", group: "People & Knowledge", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_PROPERTY_INTELLIGENCE", href: "/property-intelligence", label: "AAIQ Inventory & Procurement", group: "Hotel Operations", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_CASH_CUSTODY", href: "/aaiq-cash-custody", label: "AAIQ Cash & Check Custody", group: "Hotel Operations", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_REPORTING", href: "/reports", label: "AAIQ Enterprise Reports", group: "My Work", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_REVIEW_INTELLIGENCE", href: "/aaiq-review-center", label: "AAIQ Review Intelligence", group: "Growth & Revenue" },
  { key: "AAIQ_OTA_RECONCILIATION", href: "/aaiq-ota-reconciliation", label: "AAIQ OTA Reconciliation", group: "Growth & Revenue" },
  { key: "AAIQ_WEBSITE_FACTORY", href: "/aaiq-website-factory", label: "AAIQ Website & Growth Factory", group: "Growth & Revenue" },
  { key: "AAIQ_TAX_PREPARATION", href: "/aaiq-tax-center", label: "AAIQ Tax & Profit Center", group: "Growth & Revenue" },
  { key: "AAIQ_ASSET_REGISTRY", href: "/aaiq-asset-registry", label: "AAIQ Property & Assets", group: "Hotel Operations" },
  { key: "AAIQ_SETUP_AGENT", href: "/aaiq-setup-agent", label: "AAIQ Autonomous Configuration", group: "Technology & Control", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_USER_MANAGEMENT", href: "/aaiq-user-management", label: "AAIQ User & Access", group: "Technology & Control" },
  { key: "AAIQ_MEMORY_AGENT", href: "/memory-agent", label: "AAIQ Memory Agent", group: "People & Knowledge" },
  { key: "AAIQ_CONNECTED_SOURCES", href: "/accounts", label: "AAIQ Connected Sources", group: "Technology & Control" },
  { key: "AAIQ_COMMUNICATION_CENTER", href: "/aaiq-communication-center", label: "AAIQ Master Inbox", group: "People & Knowledge", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_AGENT_STUDIO", href: "/aaiq-agent-studio", label: "AAIQ Digital Employees", group: "Technology & Control", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_INTEGRATION_CENTER", href: "/aaiq-integration-center", label: "AAIQ Governed Integrations", group: "Technology & Control" },
  { key: "AAIQ_ONLINE_PRESENCE", href: "/aaiq-online-presence", label: "AAIQ Online Presence & Technology", group: "Growth & Revenue", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_CUSTOMER_INTELLIGENCE", href: "/aaiq-customer-intelligence", label: "AAIQ Customer Intelligence", group: "Growth & Revenue" },
  { key: "AAIQ_VIDEO_INTELLIGENCE", href: "/aaiq-video-intelligence", label: "AAIQ Video Intelligence", group: "Technology & Control", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_DOCUMENT_VAULT", href: "/aaiq-document-vault", label: "AAIQ Document Vault", group: "People & Knowledge", badge: "PREVIEW", tone: "blue" },
  { key: "AAIQ_QUALITY_CENTER", href: "/aaiq-quality-center", label: "AAIQ Truth & Verification Center", group: "Technology & Control", badge: "SIMULATED", tone: "blue" },
  { key: "AAIQ_SECURITY", href: "/aaiq-security", label: "AAIQ Location & IP Security", group: "Technology & Control" },
  { key: "AAIQ_SAMPLE_LAB", href: "/aaiq-sample-lab", label: "AAIQ Sample Environments", group: "Technology & Control" },
] as const satisfies readonly AaiqCapability[];

export type AaiqCapabilityKey = typeof AAIQ_CAPABILITIES[number]["key"];
export const AAIQ_CAPABILITY_KEYS = AAIQ_CAPABILITIES.map(item => item.key) as AaiqCapabilityKey[];

export function capabilityForPath(pathname: string) {
  return AAIQ_CAPABILITIES.find(item => pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`)));
}
