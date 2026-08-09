import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { QdrantClient } from "@qdrant/js-client-rest";
import { finishSocialPublication, integrationExecutionContext, markMemoryIndexed, recordIntegrationRun,
  saveMemory, searchLocalMemories, socialDraftForApproval, updateHealth,
  getIntegrationCredential } from "../../../db/open-source-integrations";

const HealthState = Annotation.Root({
  userEmail: Annotation<string>, organizationId: Annotation<string>, providerKey: Annotation<string>,
  endpoint: Annotation<string>, status: Annotation<string>,
  message: Annotation<string>, latencyMs: Annotation<number>,
});

async function credential(organizationId: string, providerKey: string, fieldKey?: string) {
  const field = fieldKey || ({
    QDRANT: "QDRANT_API_KEY", POSTIZ: "POSTIZ_API_KEY",
    SUPERSET: "SUPERSET_ACCESS_TOKEN", CHATWOOT: "CHATWOOT_API_ACCESS_TOKEN",
    OPENAI_AGENTS: "OPENAI_API_KEY", META_CAPI: "META_CAPI_ACCESS_TOKEN",
  } as Record<string, string>)[providerKey];
  if (!field) return undefined;
  const saved = await getIntegrationCredential(organizationId, providerKey, field);
  const environment: Record<string, string | undefined> = {
    QDRANT_API_KEY: process.env.QDRANT_API_KEY, POSTIZ_API_KEY: process.env.POSTIZ_API_KEY,
    SUPERSET_API_TOKEN: process.env.SUPERSET_API_TOKEN,
    SUPERSET_API_SECRET: process.env.SUPERSET_API_SECRET,
    SUPERSET_ACCESS_TOKEN: process.env.SUPERSET_ACCESS_TOKEN,
    CHATWOOT_API_ACCESS_TOKEN: process.env.CHATWOOT_API_ACCESS_TOKEN,
    CHATWOOT_ACCOUNT_ID: process.env.CHATWOOT_ACCOUNT_ID, OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    META_CAPI_ACCESS_TOKEN: process.env.META_CAPI_ACCESS_TOKEN,
    META_CAPI_DATASET_ID: process.env.META_CAPI_DATASET_ID,
    META_CAPI_TEST_EVENT_CODE: process.env.META_CAPI_TEST_EVENT_CODE,
  };
  return saved || environment[field];
}

async function supersetAccessToken(organizationId: string) {
  const apiToken = await credential(organizationId, "SUPERSET", "SUPERSET_API_TOKEN");
  const apiSecret = await credential(organizationId, "SUPERSET", "SUPERSET_API_SECRET");
  if (apiToken || apiSecret) {
    if (!apiToken || !apiSecret) {
      throw new Error("Both the Preset API token name and API secret are required.");
    }
    const response = await fetch("https://api.app.preset.io/v1/auth/", {
      method: "POST",
      headers: { "accept": "application/json", "content-type": "application/json" },
      body: JSON.stringify({ name: apiToken, secret: apiSecret }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Preset credential exchange returned HTTP ${response.status}.`);
    }
    const body = await response.json() as { payload?: { access_token?: string } };
    const accessToken = body.payload?.access_token;
    if (!accessToken) throw new Error("Preset did not return an access token.");
    return accessToken;
  }
  return credential(organizationId, "SUPERSET", "SUPERSET_ACCESS_TOKEN");
}

async function probe(state: typeof HealthState.State) {
  const started = Date.now();
  if (state.providerKey === "OPENAI_AGENTS") {
    const key = await credential(state.organizationId, "OPENAI_AGENTS");
    if (!key) return { status: "CONFIGURATION_REQUIRED",
      message: "OpenAI API key is not configured.", latencyMs: Date.now()-started };
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          input: "Return only the word READY.",
          max_output_tokens: 16,
          store: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        return { status: "UNHEALTHY",
          message: `OpenAI Responses validation returned HTTP ${response.status}${payload.error?.message ? `: ${payload.error.message}` : "."}`,
          latencyMs: Date.now()-started };
      }
      return { status: "HEALTHY",
        message: "OpenAI Agents runtime and Responses API permission verified.",
        latencyMs: Date.now()-started };
    } catch (error) {
      return { status: "UNHEALTHY",
        message: error instanceof Error ? error.message : "OpenAI Agents runtime validation failed.",
        latencyMs: Date.now()-started };
    }
  }
  if (state.providerKey === "LANGGRAPH") return { status: "HEALTHY", message: "Embedded LangGraph workflow executed.", latencyMs: Date.now()-started };
  if (state.providerKey === "AAIQ_NATIVE_COMMS") return { status: "HEALTHY",
    message: "AAIQ native communication routing, approvals, audit and manual fallback are active.",
    latencyMs: Date.now()-started };
  if (!state.endpoint) return { status: "CONFIGURATION_REQUIRED", message: "Administrator endpoint configuration is required.", latencyMs: Date.now()-started };
  try {
    if (state.providerKey === "META_CAPI") {
      const token = await credential(state.organizationId, "META_CAPI", "META_CAPI_ACCESS_TOKEN");
      const datasetId = await credential(state.organizationId, "META_CAPI", "META_CAPI_DATASET_ID");
      if (!token || !datasetId) return { status: "CONFIGURATION_REQUIRED",
        message: "Meta dataset ID and Conversions API access token are required.", latencyMs: Date.now()-started };
      if (!/^\d{6,30}$/.test(datasetId)) return { status: "UNHEALTHY",
        message: "The Meta dataset ID must contain digits only.", latencyMs: Date.now()-started };
      const response = await fetch(`${state.endpoint.replace(/\/$/,"")}/${datasetId}?fields=id,name`, {
        headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
      });
      const payload = await response.json().catch(() => ({})) as {
        id?: string; name?: string; error?: { message?: string; code?: number }
      };
      const writeOnlyToken = response.status === 400 && payload.error?.code === 100 &&
        /missing permission/i.test(payload.error?.message || "");
      return { status: writeOnlyToken ? "READY_FOR_TEST_EVENT"
          : response.ok && payload.id === datasetId ? "HEALTHY" : "UNHEALTHY",
        message: writeOnlyToken
          ? "Meta accepted the saved credential format but this event-write token cannot read dataset metadata. No event was sent. Add a Meta Test Event Code and run the governed test-event check to verify delivery."
          : response.ok
          ? `Meta dataset ${payload.name || datasetId} verified. No event was sent and no advertising spend occurred.`
          : `Meta dataset validation returned HTTP ${response.status}${payload.error?.message ? `: ${payload.error.message}` : "."}`,
        latencyMs: Date.now()-started };
    }
    if (state.providerKey === "QDRANT") {
      const key = await credential(state.organizationId, "QDRANT");
      if (!key) return { status: "CONFIGURATION_REQUIRED",
        message: "Qdrant Database API key is required.", latencyMs: Date.now()-started };
      const result = await new QdrantClient({ url: state.endpoint, apiKey: key }).getCollections();
      return { status: "HEALTHY", message: `${result.collections.length} Qdrant collection(s) available.`, latencyMs: Date.now()-started };
    }
    const token = state.providerKey === "SUPERSET"
      ? await supersetAccessToken(state.organizationId)
      : await credential(state.organizationId, state.providerKey);
    if (state.providerKey === "SUPERSET" && !token) return {
      status: "CONFIGURATION_REQUIRED",
      message: "Preset API token name and secret are required.",
      latencyMs: Date.now()-started,
    };
    if (["POSTIZ","CHATWOOT"].includes(state.providerKey) && !token) return {
      status: "CONFIGURATION_REQUIRED", message: `${state.providerKey} credential is required.`, latencyMs: Date.now()-started };
    const healthPath = state.providerKey === "SUPERSET" ? "/api/v1/dashboard/?q=(page:0,page_size:1)" :
      state.providerKey === "CHATWOOT" ? "/api/v1/profile" : "/is-connected";
    const response = await fetch(`${state.endpoint.replace(/\/$/,"")}${healthPath}`, {
      headers: token ? (state.providerKey === "CHATWOOT"
        ? { api_access_token: token } : { authorization: state.providerKey === "POSTIZ" ? token : `Bearer ${token}` }) : {},
      signal: AbortSignal.timeout(8_000),
    });
    return { status: response.ok ? "HEALTHY" : "UNHEALTHY",
      message: `${state.providerKey} responded with HTTP ${response.status}.`, latencyMs: Date.now()-started };
  } catch (error) {
    return { status: "UNHEALTHY", message: error instanceof Error ? error.message : "Health probe failed.", latencyMs: Date.now()-started };
  }
}

const healthGraph = new StateGraph(HealthState)
  .addNode("probe", probe).addEdge(START, "probe").addEdge("probe", END).compile();

export async function runGovernedHealthCheck(userEmail: string, providerKey: string) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution) return null;
  const integration = execution.integrations.find(item => item.provider_key === providerKey);
  if (!integration) throw new Error("The selected integration is disabled or unavailable.");
  const endpoint = integration.endpoint ||
    (providerKey === "SUPERSET" ? process.env.SUPERSET_BASE_URL : "");
  const result = await healthGraph.invoke({ userEmail, organizationId: execution.context.organizationId,
    providerKey, endpoint,
    status: "VALIDATING", message: "", latencyMs: 0 });
  await updateHealth(execution.context.organizationId, providerKey, result.status, result.message);
  await recordIntegrationRun(execution.context, execution.property.id, providerKey, "HEALTH_CHECK",
    result.status, { endpointConfigured: Boolean(integration.endpoint) },
    { message: result.message }, result.latencyMs);
  return result;
}

export async function runMetaCapiTestEvent(userEmail: string) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution || execution.context.role !== "admin") return null;
  const integration = execution.integrations.find(item => item.provider_key === "META_CAPI");
  if (!integration?.endpoint) throw new Error("Configure the Meta Graph API endpoint first.");
  const token = await credential(execution.context.organizationId, "META_CAPI", "META_CAPI_ACCESS_TOKEN");
  const datasetId = await credential(execution.context.organizationId, "META_CAPI", "META_CAPI_DATASET_ID");
  const testEventCode = await credential(execution.context.organizationId, "META_CAPI", "META_CAPI_TEST_EVENT_CODE");
  if (!token || !datasetId) {
    throw new Error("Meta dataset ID and Conversions API token are required.");
  }
  const started = Date.now();
  const externalId = Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`${execution.context.organizationId}:${execution.property.id}:integration-test`),
  ))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const eventId = crypto.randomUUID();
  const response = await fetch(`${integration.endpoint.replace(/\/$/,"")}/${datasetId}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      data: [{
        event_name: "AAIQIntegrationVerification",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "system_generated",
        user_data: { external_id: [externalId] },
        custom_data: { integration_test: true, property_code: execution.property.code },
      }],
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({})) as {
    events_received?: number; fbtrace_id?: string; error?: { message?: string }
  };
  const healthy = response.ok && Number(payload.events_received || 0) > 0;
  const status = healthy ? "HEALTHY" : "UNHEALTHY";
  const message = healthy
    ? testEventCode
      ? `Meta received ${payload.events_received} governed test event. No audience, public post, or advertising spend was created.`
      : `Meta received ${payload.events_received} governed diagnostic event. Meta no longer exposes a Test Event Code for every dataset, so verify it in Events Manager Overview or History. No audience or advertising spend was created.`
    : `Meta test-event validation returned HTTP ${response.status}${payload.error?.message ? `: ${payload.error.message}` : "."}`;
  await updateHealth(execution.context.organizationId, "META_CAPI", status, message);
  await recordIntegrationRun(execution.context, execution.property.id, "META_CAPI", "TEST_EVENT",
    status, { datasetIdConfigured: true, testEventCodeConfigured: Boolean(testEventCode), diagnosticMode: testEventCode ? "TEST_EVENTS" : "OVERVIEW_HISTORY" },
    { message, eventsReceived: payload.events_received || 0, traceAvailable: Boolean(payload.fbtrace_id) },
    Date.now() - started);
  return { status, message, eventsReceived: payload.events_received || 0 };
}

async function embedding(organizationId: string, text: string) {
  const apiKey = await credential(organizationId, "QDRANT", "OPENAI_API_KEY")
    || await credential(organizationId, "OPENAI_AGENTS", "OPENAI_API_KEY");
  if (!apiKey) return null;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text, dimensions: 512 }),
  });
  if (!response.ok) throw new Error(`Embedding service returned HTTP ${response.status}.`);
  const body = await response.json() as { data: Array<{ embedding: number[] }> };
  return body.data[0]?.embedding || null;
}

export async function indexOrganizationalMemory(userEmail: string, input: Record<string, unknown>) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution) return null;
  const memory = await saveMemory(userEmail, input);
  if (!memory) return null;
  const qdrant = execution.integrations.find(item => item.provider_key === "QDRANT");
  const qdrantKey = await credential(execution.context.organizationId, "QDRANT");
  const openAiKey = await credential(execution.context.organizationId, "QDRANT", "OPENAI_API_KEY")
    || await credential(execution.context.organizationId, "OPENAI_AGENTS", "OPENAI_API_KEY");
  if (!qdrant?.endpoint || !qdrantKey || !openAiKey) {
    await markMemoryIndexed(execution.context.organizationId, execution.property.id,
      memory.sourceType, memory.sourceId, null, "LOCAL_ONLY");
    return { memoryId: memory.id, status: "LOCAL_ONLY", manualFallback:
      "Memory is preserved in AAIQ. Configure Qdrant and the embedding provider to enable semantic retrieval." };
  }
  const vector = await embedding(execution.context.organizationId, memory.summary);
  if (!vector) throw new Error("Embedding could not be created.");
  const client = new QdrantClient({ url: qdrant.endpoint, apiKey: qdrantKey });
  const collection = `aaiq_${execution.context.organizationId.replace(/[^a-zA-Z0-9_]/g,"_").slice(0,40)}`;
  const collections = await client.getCollections();
  if (!collections.collections.some(item => item.name === collection)) {
    await client.createCollection(collection, { vectors: { size: 512, distance: "Cosine" } });
  }
  const pointId = crypto.randomUUID();
  await client.upsert(collection, { wait: true, points: [{ id: pointId, vector, payload: {
    organizationId: execution.context.organizationId, propertyId: execution.property.id,
    sourceType: memory.sourceType, sourceId: memory.sourceId, summary: memory.summary,
  }}]});
  await markMemoryIndexed(execution.context.organizationId, execution.property.id,
    memory.sourceType, memory.sourceId, pointId, "INDEXED");
  return { memoryId: memory.id, pointId, status: "INDEXED" };
}

export async function searchOrganizationalMemory(userEmail: string, query: string) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution) return null;
  const cleanQuery = query.trim().slice(0, 500);
  if (!cleanQuery) throw new Error("Enter a memory question or search phrase.");
  const started = Date.now();
  const qdrant = execution.integrations.find(item => item.provider_key === "QDRANT");
  const qdrantKey = await credential(execution.context.organizationId, "QDRANT");
  const openAiKey = await credential(execution.context.organizationId, "QDRANT", "OPENAI_API_KEY")
    || await credential(execution.context.organizationId, "OPENAI_AGENTS", "OPENAI_API_KEY");
  if (qdrant?.endpoint && qdrantKey && openAiKey) {
    const vector = await embedding(execution.context.organizationId, cleanQuery);
    if (vector) {
      const client = new QdrantClient({ url: qdrant.endpoint, apiKey: qdrantKey });
      const collection = `aaiq_${execution.context.organizationId.replace(/[^a-zA-Z0-9_]/g,"_").slice(0,40)}`;
      const found = await client.search(collection, {
        vector, limit: 10, with_payload: true,
        filter: { must: [
          { key: "organizationId", match: { value: execution.context.organizationId } },
          { key: "propertyId", match: { value: execution.property.id } },
        ]},
      });
      const results = found.map(item => ({ score: item.score, ...(item.payload || {}) }));
      await recordIntegrationRun(execution.context, execution.property.id, "QDRANT", "MEMORY_SEARCH",
        "SUCCEEDED", { query: cleanQuery }, { count: results.length }, Date.now() - started);
      return { mode: "SEMANTIC", results };
    }
  }
  const results = await searchLocalMemories(userEmail, cleanQuery);
  await recordIntegrationRun(execution.context, execution.property.id, "QDRANT", "MEMORY_SEARCH",
    "MANUAL_FALLBACK", { query: cleanQuery }, { count: results?.length || 0, mode: "LOCAL_KEYWORD" }, Date.now() - started);
  return { mode: "LOCAL_KEYWORD", results: results || [],
    manualFallback: "Semantic retrieval is not connected. AAIQ safely searched the current property's authoritative memory ledger." };
}

export async function syncGovernedReadOnlyData(userEmail: string, providerKey: string) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution) return null;
  if (!["SUPERSET", "CHATWOOT"].includes(providerKey)) throw new Error("This connector does not support read-only synchronization.");
  const integration = execution.integrations.find(item => item.provider_key === providerKey);
  const token = providerKey === "SUPERSET"
    ? await supersetAccessToken(execution.context.organizationId)
    : await credential(execution.context.organizationId, providerKey);
  const configuredEndpoint = integration?.endpoint ||
    (providerKey === "SUPERSET" ? process.env.SUPERSET_BASE_URL : "");
  if (!configuredEndpoint || !token) {
    return { status: "CONFIGURATION_REQUIRED", providerKey,
      manualFallback: "Configure the service endpoint and its vault-backed runtime token before synchronization." };
  }
  const started = Date.now();
  const base = configuredEndpoint.replace(/\/$/, "");
  const path = providerKey === "SUPERSET" ? "/api/v1/dashboard/?q=(page:0,page_size:25)"
    : `/api/v1/accounts/${encodeURIComponent(
      await credential(execution.context.organizationId, "CHATWOOT", "CHATWOOT_ACCOUNT_ID") || ""
    )}/conversations/meta`;
  const chatwootAccountId = providerKey === "CHATWOOT"
    ? await credential(execution.context.organizationId, "CHATWOOT", "CHATWOOT_ACCOUNT_ID") : null;
  if (providerKey === "CHATWOOT" && !chatwootAccountId) {
    return { status: "CONFIGURATION_REQUIRED", providerKey,
      manualFallback: "CHATWOOT_ACCOUNT_ID is required for property-scoped conversation summaries." };
  }
  const response = await fetch(`${base}${path}`, {
    headers: providerKey === "SUPERSET" ? { authorization: `Bearer ${token}` } : { api_access_token: token },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({ httpStatus: response.status }));
  if (!response.ok) throw new Error(`${providerKey} read-only synchronization returned HTTP ${response.status}.`);
  const summary = providerKey === "SUPERSET"
    ? { dashboards: Array.isArray((payload as any).result) ? (payload as any).result.length : 0 }
    : { conversations: (payload as any).meta || payload };
  await recordIntegrationRun(execution.context, execution.property.id, providerKey, "READ_ONLY_SYNC",
    "SUCCEEDED", { propertyId: execution.property.id }, summary, Date.now() - started);
  return { status: "SUCCEEDED", providerKey, summary };
}

export async function approvePostizDraft(userEmail: string, id: string) {
  const approval = await socialDraftForApproval(userEmail, id);
  if (!approval) return null;
  const postiz = approval.execution.integrations.find(item => item.provider_key === "POSTIZ");
  const postizKey = await credential(approval.execution.context.organizationId, "POSTIZ");
  if (!postiz?.endpoint || !postizKey) {
    return finishSocialPublication(userEmail, id, {
      manualFallback: "Postiz endpoint or API key is not configured. The approved content remains preserved.",
    }, "APPROVED_MANUAL_SUBMISSION");
  }
  const content = JSON.parse(approval.item.content_json || "{}");
  const channels = JSON.parse(approval.item.channels_json || "[]") as Array<{id:string;type:string}>;
  const providerSettings = (type: string) => ({
    __type: type,
    ...(["instagram", "instagram-standalone"].includes(type) ? { post_type: "post" } : {}),
  });
  const payload = {
    type: content.mode === "schedule" ? "schedule" : "draft",
    date: content.scheduledAt || new Date(Date.now() + 3_600_000).toISOString(),
    shortLink: false, tags: [],
    posts: channels.map(channel => ({
      integration: { id: channel.id },
      value: [{ content: content.content, image: [] }],
      settings: providerSettings(channel.type),
    })),
  };
  const response = await fetch(`${postiz.endpoint.replace(/\/$/,"")}/posts`, {
    method: "POST", headers: { authorization: postizKey, "content-type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({ status: response.status }));
  if (!response.ok) {
    const providerMessage = typeof result?.message === "string" ? result.message
      : typeof result?.error === "string" ? result.error : "";
    throw new Error(`Postiz rejected the approved draft with HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : "."}`);
  }
  return finishSocialPublication(userEmail, id, result, content.mode === "schedule" ? "SCHEDULED" : "POSTIZ_DRAFT_CREATED");
}

export async function listPostizChannels(userEmail: string) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution) return null;
  const postiz = execution.integrations.find(item => item.provider_key === "POSTIZ");
  const postizKey = await credential(execution.context.organizationId, "POSTIZ");
  if (!postiz?.endpoint || !postizKey) {
    return { status: "CONFIGURATION_REQUIRED", channels: [],
      manualFallback: "Configure and verify Postiz before loading connected social channels." };
  }
  const started = Date.now();
  const response = await fetch(`${postiz.endpoint.replace(/\/$/,"")}/integrations`, {
    headers: { authorization: postizKey }, signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Postiz channel discovery returned HTTP ${response.status}.`);
  const channels = (Array.isArray(payload) ? payload : []).filter(item => !item.disabled).map(item => ({
    id: String(item.id || ""), name: String(item.name || item.profile || item.identifier || "Connected channel"),
    identifier: String(item.identifier || ""), profile: String(item.profile || ""),
    picture: typeof item.picture === "string" ? item.picture : null,
  })).filter(item => item.id && item.identifier);
  await recordIntegrationRun(execution.context, execution.property.id, "POSTIZ", "CHANNEL_DISCOVERY",
    "SUCCEEDED", { propertyId: execution.property.id }, { count: channels.length }, Date.now() - started);
  return { status: "SUCCEEDED", channels };
}
