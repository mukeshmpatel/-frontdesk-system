import { gmailMockInbound, gmailMockSend, twilioMockSend, twilioMockWebhook, twilioSignature } from "./messaging-contract-profiles.mjs";

export const DELIVERY_ORDER={QUEUED:0,SENT:1,DELIVERED:2,OPENED:3,READ:4,FAILED:5,BOUNCED:6,RECONCILED:7};
const HIGH_RISK=[
 ["LEGAL",/lawyer|attorney|lawsuit|sue\b|legal notice/i],
 ["REFUND",/refund|chargeback|cash back|reverse (the )?charge/i],
 ["DISCRIMINATION",/discriminat|race|religion|disability|national origin|sexual orientation/i],
 ["SAFETY",/fire|weapon|injury|ambulance|police|unsafe|threat/i],
 ["PUBLIC_REVIEW",/post (this|it) publicly|google review|tripadvisor|public review/i],
];

export function universalConversationId({organizationId,propertyId,sourceKey,sourceThreadId}){
 return `${organizationId}:${propertyId}:${sourceKey}:${sourceThreadId}`.toLowerCase();
}
export function classifyReplyRisk(text){const categories=HIGH_RISK.filter(([,rule])=>rule.test(text)).map(([name])=>name);return{categories,requiresApproval:categories.length>0,riskLevel:categories.includes("SAFETY")?"CRITICAL":categories.length?"HIGH":"STANDARD"};}
export function communicationPolicy({sourceKey,body,consentStatus="OPTED_IN",localHour=12,quietStart=21,quietEnd=8}){
 const stop=/^\s*(stop|unsubscribe|cancel|end|quit)\s*[.!]?\s*$/i.test(body||"");
 if(stop)return{allowed:false,outcome:"UNSUBSCRIBED",consentStatus:"OPTED_OUT",reason:"Recognized channel opt-out keyword."};
 if(["TWILIO_SMS","SMS","WHATSAPP"].includes(sourceKey)&&consentStatus!=="OPTED_IN")return{allowed:false,outcome:"CONSENT_BLOCKED",consentStatus,reason:"Messaging consent is not active."};
 const quiet=quietStart>quietEnd?localHour>=quietStart||localHour<quietEnd:localHour>=quietStart&&localHour<quietEnd;
 if(quiet&&["TWILIO_SMS","SMS","WHATSAPP"].includes(sourceKey))return{allowed:false,outcome:"QUIET_HOURS_DEFERRED",consentStatus,reason:`Deferred until quiet hours end at ${quietEnd}:00.`};
 return{allowed:true,outcome:"POLICY_ALLOWED",consentStatus,reason:"Consent and quiet-hours policy passed."};
}
export function reconcileDelivery(current,next){
 if(!(next in DELIVERY_ORDER))return{accepted:false,outcome:"MALFORMED_STATUS_REJECTED",current};
 if(current===next)return{accepted:false,outcome:"DUPLICATE_IGNORED",current};
 if(current&&DELIVERY_ORDER[next]<DELIVERY_ORDER[current])return{accepted:false,outcome:"OUT_OF_ORDER_BUFFERED",current,pending:next};
 return{accepted:true,outcome:next==="BOUNCED"||next==="FAILED"?"DELIVERY_EXCEPTION_RECORDED":"STATUS_RECONCILED",current:next};
}

export async function runMasterInboxCertification(){
 const gmailSeen=new Set(),gmailNotice={message:{data:Buffer.from(JSON.stringify({emailAddress:"uat@aaiq.internal",historyId:"991"})).toString("base64")}};
 const gmailInbound=gmailMockInbound(gmailNotice,gmailSeen),gmailDuplicate=gmailMockInbound(gmailNotice,gmailSeen);
 const gmailReply=gmailMockSend({method:"POST",path:"/gmail/v1/users/me/messages/send",body:{raw:"UmVwbHk=",threadId:"gmail-thread-1"},headers:{References:"<source@guest.test>","In-Reply-To":"<source@guest.test>",Subject:"Reservation question"}});
 const smsPath="/2010-04-01/Accounts/AC11111111111111111111111111111111/Messages.json",smsSend=twilioMockSend({method:"POST",path:smsPath,form:{To:"+17855550100",Body:"Approved reply",MessagingServiceSid:"MG11111111111111111111111111111111",StatusCallback:"https://aaiq.example.test/twilio/status"}});
 const callbackUrl="https://aaiq.example.test/twilio/status",authToken="sandbox-auth-token",delivered={MessageSid:smsSend.body.sid,MessageStatus:"delivered",ErrorCode:""};
 const signature=await twilioSignature(authToken,callbackUrl,delivered),smsDelivered=await twilioMockWebhook({authToken,url:callbackUrl,params:delivered,signature});
 const duplicateDelivered=await twilioMockWebhook({authToken,url:callbackUrl,params:delivered,signature,knownStatus:"delivered"});
 const bounced=reconcileDelivery("SENT","BOUNCED"),lateSent=reconcileDelivery("DELIVERED","SENT");
 const cases=[
  ["gmail_inbound",gmailInbound.outcome==="HISTORY_RECONCILIATION_REQUIRED",gmailInbound],
  ["duplicate_inbound",gmailDuplicate.outcome==="DUPLICATE_IGNORED",gmailDuplicate],
  ["same_source_threaded_reply",gmailReply.status===200,gmailReply],
  ["sms_delivery_receipt",smsDelivered.outcome==="STATUS_RECONCILED",smsDelivered],
  ["duplicate_receipt",duplicateDelivered.outcome==="DUPLICATE_IGNORED",duplicateDelivered],
  ["out_of_order_receipt",lateSent.outcome==="OUT_OF_ORDER_BUFFERED",lateSent],
  ["bounce_reconciliation",bounced.outcome==="DELIVERY_EXCEPTION_RECORDED",bounced],
  ["unsubscribe_mid_conversation",communicationPolicy({sourceKey:"TWILIO_SMS",body:"STOP"}).outcome==="UNSUBSCRIBED",communicationPolicy({sourceKey:"TWILIO_SMS",body:"STOP"})],
  ["quiet_hours",communicationPolicy({sourceKey:"TWILIO_SMS",body:"Hello",localHour:23}).outcome==="QUIET_HOURS_DEFERRED",communicationPolicy({sourceKey:"TWILIO_SMS",body:"Hello",localHour:23})],
  ...["Our attorney will sue.","Refund the full charge.","This is discrimination based on disability.","There is a fire and an injury.","Post this reply to the public review."].map((text,index)=>[`approval_risk_${index+1}`,classifyReplyRisk(text).requiresApproval,classifyReplyRisk(text)]),
 ];
 return{status:cases.every(([,passed])=>passed)?"VERIFIED":"FAILED",providerMode:"CONTRACT_ACCURATE_MOCK",productionEnabled:false,realMessageSent:false,totalCases:cases.length,passedCases:cases.filter(([,passed])=>passed).length,cases:cases.map(([scenario,passed,evidence])=>({scenario,passed,evidence}))};
}
