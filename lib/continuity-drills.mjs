const enc=new TextEncoder();
export async function sha256(value){const bytes=await crypto.subtle.digest("SHA-256",enc.encode(String(value)));return[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");}
export function simulateProviderOutage(){
 const state={provider:"SIMULATED_EMAIL",mode:"ONLINE",queue:[],receipts:[],dataLoss:0};
 state.mode="DEGRADED_MANUAL";state.queue.push({id:"msg-1",idempotencyKey:"outage:msg-1",status:"QUEUED_MANUAL_FALLBACK"});
 state.receipts.push({event:"PROVIDER_UNAVAILABLE",circuit:"OPEN"},{event:"MANUAL_FALLBACK_ENGAGED",queueDepth:1});
 state.mode="RECOVERING";const item=state.queue[0];item.status="RECONCILED_NOT_SENT";state.receipts.push({event:"PROVIDER_RECOVERED",circuit:"HALF_OPEN"},{event:"QUEUE_RECONCILED",idempotencyKey:item.idempotencyKey,realMessageSent:false});state.mode="ONLINE";
 return{...state,recovered:true,queueDepthAfter:0,reconciledCount:1,realMessageSent:false};
}
export async function privilegedChangeAlert({actor="uat-admin@aaiq.internal",before=75,after=25}={}){
 const event={eventType:"PRIVILEGED_CONFIGURATION_CHANGED",actor,setting:"FRONT_DESK_CREDIT_THRESHOLD",before,after,severity:"HIGH",alertStatus:"FIRED",occurredAt:"2026-08-01T00:00:00.000Z"};
 const previousHash="GENESIS",checksum=await sha256(JSON.stringify({...event,previousHash}));return{...event,previousHash,checksum,tamperEvident:true};
}
