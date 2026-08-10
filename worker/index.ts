/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runEscalationMatrix } from "../db/platform-controls";
import { runCashReconciliationEscalations, runScheduledCashReconciliations } from "../db/cash-reconciliation";
import { runHousekeepingEscalations } from "../db/housekeeping-departures";
import { runMaintenanceEscalations } from "../db/maintenance-repairs";
import { runComplianceEscalations, runScheduledComplianceAutomation } from "../db/compliance-inspections";
import { runScheduledQualityMonitoring } from "../db/quality-evaluations";
import { runScheduledDigitalEmployeeBriefings } from "../app/server/agents/scheduled-digital-employees";
import { runCashVarianceAnomalyEscalations, runReviewSentimentAnomalyEscalations } from "../db/anomaly-detection";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // The public workers.dev hostname is pilot-only and must be protected by
    // Cloudflare Access. Verify the assertion again inside the application so
    // a forged identity header can never become an AAIQ user.
    if (url.hostname.endsWith(".workers.dev")) {
      const identity = await verifiedAccessIdentity(request, env);
      if (!identity.ok) return Response.json({
        error: identity.error,
        code: "CLOUDFLARE_ACCESS_REQUIRED",
      }, { status: identity.status, headers: { "cache-control": "no-store" } });
      const headers = new Headers(request.headers);
      headers.set("oai-authenticated-user-email", identity.email);
      request = new Request(request, { headers });
    }

    if (url.pathname === "/_vinext/image") {
      if (!env.IMAGES) {
        return Response.json({error:"Image transformation is disabled for this text-only pilot."},{status:404});
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.all([
      runEscalationMatrix(),
      runScheduledCashReconciliations(),
      runCashReconciliationEscalations(),
      runHousekeepingEscalations(),
      runMaintenanceEscalations(),
      runScheduledComplianceAutomation(),
      runComplianceEscalations(),
      runScheduledQualityMonitoring(),
      runScheduledDigitalEmployeeBriefings(),
      runCashVarianceAnomalyEscalations(),
      runReviewSentimentAnomalyEscalations(),
    ]));
  },
};

type AccessIdentity = {ok:true;email:string}|{ok:false;error:string;status:number};
let jwksCache:{expires:number;keys:JsonWebKey[]}|null=null;

async function verifiedAccessIdentity(request:Request,env:Env):Promise<AccessIdentity>{
  if(!env.CF_ACCESS_AUD||!env.CF_ACCESS_TEAM_DOMAIN){
    return {ok:false,status:503,error:"Pilot Access validation is not configured."};
  }
  const token=request.headers.get("cf-access-jwt-assertion");
  if(!token)return {ok:false,status:401,error:"Cloudflare Access sign-in is required."};
  const parts=token.split(".");
  if(parts.length!==3)return {ok:false,status:401,error:"Invalid Access assertion."};
  try{
    const header=JSON.parse(new TextDecoder().decode(base64Url(parts[0]))) as {alg?:string;kid?:string};
    const payload=JSON.parse(new TextDecoder().decode(base64Url(parts[1]))) as {aud?:string|string[];exp?:number;nbf?:number;iss?:string;email?:string};
    if(header.alg!=="RS256"||!header.kid)throw new Error("Unsupported assertion algorithm.");
    const now=Math.floor(Date.now()/1000),audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];
    if(!payload.exp||payload.exp<=now||payload.nbf&&payload.nbf>now+30)throw new Error("Expired Access assertion.");
    if(!audiences.includes(env.CF_ACCESS_AUD))throw new Error("Access audience mismatch.");
    const domain=env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
    if(payload.iss!==`https://${domain}`)throw new Error("Access issuer mismatch.");
    if(!payload.email)throw new Error("Access identity has no email.");
    const keys=await accessKeys(domain),jwk=keys.find(key=>key.kid===header.kid);
    if(!jwk)throw new Error("Access signing key was not found.");
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,base64Url(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if(!valid)throw new Error("Access signature validation failed.");
    return {ok:true,email:payload.email.toLowerCase()};
  }catch(error){
    return {ok:false,status:401,error:error instanceof Error?error.message:"Invalid Access assertion."};
  }
}

async function accessKeys(domain:string):Promise<JsonWebKey[]>{
  if(jwksCache&&jwksCache.expires>Date.now())return jwksCache.keys;
  const response=await fetch(`https://${domain}/cdn-cgi/access/certs`,{headers:{accept:"application/json"}});
  if(!response.ok)throw new Error("Access signing keys are unavailable.");
  const body=await response.json() as {keys?:JsonWebKey[]};
  if(!body.keys?.length)throw new Error("Access signing keys are empty.");
  jwksCache={keys:body.keys,expires:Date.now()+5*60_000};
  return body.keys;
}

function base64Url(value:string):Uint8Array{
  const normalized=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  const raw=atob(normalized),bytes=new Uint8Array(raw.length);
  for(let index=0;index<raw.length;index++)bytes[index]=raw.charCodeAt(index);
  return bytes;
}

export default worker;
