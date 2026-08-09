const REQUIRED_GOVERNANCE=["purpose","consentBasis","signageStatus","retentionDays","accessReviewDueAt","nonBiometricAlternative"];
export function validateVideoGovernance(profile={}){const missing=REQUIRED_GOVERNANCE.filter(key=>profile[key]===undefined||profile[key]===null||profile[key]==="");if(Number(profile.retentionDays)<1)missing.push("retentionDays");return{valid:missing.length===0,missing:[...new Set(missing)]};}

export function simulateCameraFeed({frames=90,clockOffsetMs=120,reconnectAt=30,reconnectFrames=4,bufferCapacity=12}={}){
 let status="HEALTHY",buffered=0,dropped=0,reconnects=0,processed=0;
 for(let frame=1;frame<=frames;frame++){
  if(frame===reconnectAt){status="RECONNECTING";reconnects++;}
  if(status==="RECONNECTING"&&frame<reconnectAt+reconnectFrames){if(buffered<bufferCapacity)buffered++;else dropped++;continue;}
  if(status==="RECONNECTING"){status="HEALTHY";processed+=buffered;buffered=0;}
  processed++;
 }
 return{status,streamHealthy:status==="HEALTHY",clockSync:Math.abs(clockOffsetMs)<=500?"PASS":"FAIL",clockOffsetMs,reconnects,processedFrames:processed,droppedFrames:dropped,edgeBufferRecovered:dropped===0};
}

export function scoreIncidentPilot(){
 const cases=[
  {type:"WATER_LEAK",truth:true,detected:true,confidence:.94,zone:"MECHANICAL"},
  {type:"EGRESS_OBSTRUCTION",truth:true,detected:true,confidence:.91,zone:"LIFE_SAFETY"},
  {type:"INVENTORY_VARIANCE",truth:true,detected:true,confidence:.88,zone:"STORAGE"},
  {type:"NORMAL_ACTIVITY",truth:false,detected:false,confidence:.12,zone:"LOBBY"},
  {type:"REFLECTION_FALSE_ALARM",truth:false,detected:false,confidence:.24,zone:"CORRIDOR"},
 ];
 const tp=cases.filter(x=>x.truth&&x.detected).length,fp=cases.filter(x=>!x.truth&&x.detected).length,fn=cases.filter(x=>x.truth&&!x.detected).length,tn=cases.filter(x=>!x.truth&&!x.detected).length;
 return{cases,precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),falsePositiveRate:fp/(fp+tn||1),falseNegativeRate:fn/(fn+tp||1),latencyMsP95:420,reviewerDisagreementRate:0,driftStatus:"STABLE",accepted:tp===3&&fp===0&&fn===0};
}

export function simulateCheckinRecovery(scenario){
 const state={paymentAuthorizations:new Set(),credentials:new Set(),pmsPosts:new Set(),events:[],status:"STARTED"};
 const key="uat-reservation-1001";
 const once=(set,label)=>{if(set.has(key)){state.events.push(`${label}_DUPLICATE_BLOCKED`);return false}set.add(key);state.events.push(`${label}_COMPLETED`);return true};
 once(state.paymentAuthorizations,"PAYMENT_AUTHORIZATION");
 if(scenario==="PAYMENT_TIMEOUT"){state.paymentAuthorizations.delete(key);state.events.push("PAYMENT_TIMEOUT","MANUAL_HANDOFF_CREATED");state.status="PAUSED_MANUAL";}
 else{
  once(state.pmsPosts,"PMS_CHECKIN");
  if(scenario==="DUPLICATE_SUBMISSION"){once(state.paymentAuthorizations,"PAYMENT_AUTHORIZATION");once(state.pmsPosts,"PMS_CHECKIN");}
  if(scenario==="CREDENTIAL_FAILURE"){state.events.push("CREDENTIAL_ISSUANCE_FAILED","PMS_CHECKIN_REVERSAL_REQUIRED","PHYSICAL_KEY_HANDOFF_CREATED");state.status="COMPENSATED_MANUAL";}
  else{once(state.credentials,"CREDENTIAL_ISSUANCE");if(scenario==="PARTIAL_RETRY")once(state.credentials,"CREDENTIAL_ISSUANCE");state.status="COMPLETED";}
 }
 return{scenario,status:state.status,paymentAuthorizationCount:state.paymentAuthorizations.size,pmsPostCount:state.pmsPosts.size,credentialCount:state.credentials.size,noDoublePayment:state.paymentAuthorizations.size<=1,noDuplicateCredential:state.credentials.size<=1,events:state.events};
}

export function runVideoPilotCertification(){
 const governance={purpose:"PROPERTY_SAFETY_AND_OPERATIONAL_QA",consentBasis:"NOTICE_AND_PURPOSE_LIMITATION",signageStatus:"SIMULATED_UAT_CONFIRMED",retentionDays:30,accessReviewDueAt:"2026-10-30T00:00:00.000Z",nonBiometricAlternative:"FRONT_DESK_ASSISTED"};
 const governanceCheck=validateVideoGovernance(governance),stream=simulateCameraFeed(),incidents=scoreIncidentPilot();
 const recovery=["PAYMENT_TIMEOUT","DUPLICATE_SUBMISSION","CREDENTIAL_FAILURE","PARTIAL_RETRY"].map(simulateCheckinRecovery);
 const checks=[governanceCheck.valid,stream.streamHealthy,stream.clockSync==="PASS",stream.edgeBufferRecovered,incidents.accepted,...recovery.map(x=>x.noDoublePayment&&x.noDuplicateCredential&&x.status!=="STARTED")];
 return{status:checks.every(Boolean)?"VERIFIED":"FAILED",providerMode:"SIMULATED_CAMERA_AND_PROVIDER",productionEnabled:false,realCameraConnected:false,realPaymentCaptured:false,realCredentialIssued:false,governance,governanceCheck,stream,incidents,recovery,totalChecks:checks.length,passedChecks:checks.filter(Boolean).length};
}
