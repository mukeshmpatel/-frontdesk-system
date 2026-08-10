import type { AuthUser, IntakeRequest } from "../contracts.js";
import { processIntake } from "../intake.js";
import { redactForModel } from "../security.js";

export interface InboundAiPayload {
  tenantId: string;
  propertyId: string;
  source: "SMS" | "WHATSAPP" | "CHAT" | "VOICE" | "MEDIA";
  senderHash: string;
  textInput: string;
  timestamp: string;
  submittedBy: AuthUser;
  inlineImages?: string[];
}

/**
 * Central adapter over the canonical LLM intake, serializable persistence,
 * audit chain, realtime publishing, reminder queue, and escalation engine.
 */
export async function triggerAiOrchestratorPipeline(
  payload: InboundAiPayload,
  correlationId: string,
) {
  if (payload.tenantId !== payload.submittedBy.tenantId) {
    throw Object.assign(new Error("Tenant context mismatch."), { statusCode: 403 });
  }
  const text = redactForModel(payload.textInput);
  const request: IntakeRequest = {
    propertyId: payload.propertyId,
    text,
    chat_history_chunk: [{
      author: `${payload.source} sender ${payload.senderHash.slice(0, 12)}`,
      text,
      timestamp: payload.timestamp,
    }],
  };
  const result = await processIntake(payload.submittedBy, request, {
    correlationId,
    ...(payload.inlineImages?.length ? { inlineImages: payload.inlineImages } : {}),
  });
  return {
    success: true as const,
    ...result,
    downstreamAction: result.intent === "SCHEDULE_CALENDAR_BLOCK"
      ? "APPROVAL_REQUIRED" as const
      : result.execution ? "AUTOMATED" as const : "NO_ACTION" as const,
  };
}
