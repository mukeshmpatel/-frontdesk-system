/**
 * AI-driven Website Factory generation: given a plain-language request
 * ("make a website for Days Inn Salina"), produces 3 genuinely distinct
 * content options for the active property, grounded in verified AAIQ
 * property facts plus real web research when a Brave Search key is
 * configured (db/website-factory.ts's researchProperty()). Never invents an
 * address, phone number, room type, or amenity that no tool returned.
 *
 * This is its own dedicated agent implementation, not routed through the
 * shared registry (app/server/agents/agent-runtime.ts), because its output
 * shape — 3 structured site variants — doesn't fit groundedOperationsSchema,
 * the same reason the maintenance dispatcher has its own file.
 */
import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents";
import { z } from "zod";
import { beginAgentRun, createAgentFallback, finishAgentRun, recordToolCall } from "../../../db/agent-platform";
import { propertyFactsForGeneration, researchProperty, WEBSITE_TEMPLATES, type GeneratedWebsiteOption } from "../../../db/website-factory";
import { resolveModelConnection, correctionsInstructionAddendum } from "./agent-runtime";

const TEMPLATE_LIST = WEBSITE_TEMPLATES.map(t => `${t.id} (${t.tone})`).join(", ");

const optionSchema = z.object({
  optionLabel: z.string().describe("A short, human-readable name for this option, e.g. 'Modern Direct — clear and conversion-focused'."),
  templateId: z.string().describe(`Must be exactly one of these template ids: ${TEMPLATE_LIST}`),
  heroTitle: z.string(),
  heroDescription: z.string().describe("2-3 sentences. Only state facts a tool actually returned — never invent an amenity, view, or feature."),
  amenitiesHighlight: z.array(z.string()).describe("Only amenities the property-facts tool actually returned."),
  localAreaBlurb: z.string().describe("Only from research results, if any were returned; otherwise a generic statement that local details are not yet verified."),
  callToAction: z.string(),
});

const generationSchema = z.object({
  propertyName: z.string(),
  researchUsed: z.boolean(),
  sourcesUsed: z.array(z.object({ label: z.string(), url: z.string().nullable() })),
  missingInformation: z.array(z.string()),
  options: z.array(optionSchema).length(3),
});

export type WebsiteGenerationOutput = z.infer<typeof generationSchema>;

export type WebsiteGenerationRunResult =
  | { runId: string; status: "SUCCEEDED" | "NEEDS_REVIEW"; generation: WebsiteGenerationOutput }
  | { runId: string; status: "MANUAL_FALLBACK"; fallback: unknown };

export async function generateWebsiteOptions(
  userEmail: string, input: { query: string; propertyContextId?: string | null },
): Promise<WebsiteGenerationRunResult | null> {
  const run = await beginAgentRun(userEmail, "website-manager", `Generate 3 website options: ${input.query}`.slice(0, 2000));
  if (!run) return null;
  const connection = await resolveModelConnection(run.context.organizationId);
  if (!connection) {
    const fallback = await createAgentFallback(run, "INTEGRATION_UNAVAILABLE",
      "The model connection is not configured in this runtime. The request has been preserved for manual completion.");
    return { runId: run.id, status: "MANUAL_FALLBACK", fallback };
  }
  const correctionsAddendum = await correctionsInstructionAddendum(run.context.organizationId, String(run.property.id), "website-manager");

  const propertyFactsTool = tool({
    name: "read_property_facts",
    description: "Read the active property's verified facts (name, address, timezone, room types, room count, amenities). Read-only.",
    parameters: z.object({}),
    execute: async () => {
      const output = await propertyFactsForGeneration(userEmail, input.propertyContextId);
      await recordToolCall(run, "read_property_facts", {}, output);
      return output;
    },
  });
  const researchTool = tool({
    name: "research_property_online",
    description: "Search the web for real, current information about the named property or hotel brand and location. Returns search result snippets (title/url/description), not full page content. If no search provider is configured, returns { connected: false } — in that case, ground content only in read_property_facts and say local-area details are not yet verified rather than inventing them.",
    parameters: z.object({ query: z.string().describe("A specific search query, e.g. 'Days Inn Salina Kansas hotel'.") }),
    execute: async ({ query }) => {
      const output = await researchProperty(run.context.organizationId, query);
      await recordToolCall(run, "research_property_online", { query }, output);
      return output;
    },
  });

  try {
    const agent = new Agent({
      name: "AAIQ Website Manager",
      model: connection.model,
      instructions: `You are the AAIQ Website Manager, generating website content options. Always call read_property_facts
first — every fact in your output (address, phone, room types, amenities) must come from there or from
research_property_online; never invent one. Call research_property_online when the request names a specific
hotel/brand/location, to ground local-area and brand-specific copy in real search results; if it returns
{ connected: false }, proceed using only read_property_facts and say so in missingInformation rather than
inventing local details. Generate exactly 3 genuinely distinct options — different template, different tone,
different emphasis (e.g. one direct-booking focused, one local-experience focused, one business-travel
focused) — never 3 near-identical variants. Choose each templateId only from the supplied list. List every
source you actually used (property facts and/or research URLs) in sourcesUsed, and set researchUsed to
whether research_property_online returned any results.` + correctionsAddendum,
      tools: [propertyFactsTool, researchTool],
      outputType: generationSchema,
    });
    const runner = new Runner({
      modelProvider: new OpenAIProvider({ apiKey: connection.apiKey, baseURL: connection.baseURL, useResponses: connection.useResponses }),
    });
    const result = await runner.run(agent, input.query || "Generate website options for the active property.");
    const output = result.finalOutput;
    if (!output) throw new Error("The agent did not return structured website options.");
    const status = output.missingInformation.length ? "NEEDS_REVIEW" : "SUCCEEDED";
    await finishAgentRun(run, {
      status, sources: output.sourcesUsed.map(s => s.url || s.label), evidence: output.options,
      plan: output.options.map(o => o.optionLabel), output, missing: output.missingInformation,
      approvalStatus: "NOT_REQUIRED",
    });
    return { runId: run.id, status, generation: output as WebsiteGenerationOutput };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed.";
    const fallback = await createAgentFallback(run, "FAILED", message);
    return { runId: run.id, status: "MANUAL_FALLBACK", fallback };
  }
}

export function narrowToGeneratedOptions(output: WebsiteGenerationOutput): GeneratedWebsiteOption[] {
  return output.options.map(option => ({
    optionLabel: option.optionLabel,
    templateId: WEBSITE_TEMPLATES.some(t => t.id === option.templateId) ? option.templateId : WEBSITE_TEMPLATES[0].id,
    heroTitle: option.heroTitle,
    heroDescription: option.heroDescription,
    amenitiesHighlight: option.amenitiesHighlight,
    localAreaBlurb: option.localAreaBlurb,
    callToAction: option.callToAction,
  }));
}
