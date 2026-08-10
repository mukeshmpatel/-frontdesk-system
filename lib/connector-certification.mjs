export const CONNECTOR_STATES=Object.freeze(["UNCONFIGURED","CREDENTIALS_PRESENT","HEALTH_CHECK_PASSED","SANDBOX_CERTIFIED","PRODUCTION_ENABLED","DEGRADED","REVOKED"]);
export const CONNECTOR_FAMILIES=Object.freeze([
 ["OPERA_OHIP","OPERA / OHIP","PMS"],["SKYTOUCH","SkyTouch","PMS"],["SKYTAB_SHIFT4","SkyTab / Shift4","POS_PAYMENTS"],
 ["LOCKS_MOBILE_KEYS","Locks / Mobile Keys","ACCESS"],["EMAIL","Email","COMMUNICATIONS"],["SMS","SMS","COMMUNICATIONS"],
 ["OTA_REVIEWS","OTA / Reviews","DISTRIBUTION"],["CAMERAS_VMS","Cameras / VMS","VIDEO"],["BANKING_ACCOUNTING","Banking / Accounting","FINANCE"],
 ["MALWARE","Malware Scanning","DOCUMENTS"],["OCR","OCR","DOCUMENTS"],["ESIGNATURE","E-signature","DOCUMENTS"],
]);
export const FAILURE_SCENARIOS=Object.freeze(["SUCCESS","TIMEOUT","HTTP_500","MALFORMED_PAYLOAD","DUPLICATE_DELIVERY","OUT_OF_ORDER_WEBHOOK"]);

export function runMockCertificationScenario(family,scenario){
 if(!CONNECTOR_FAMILIES.some(([key])=>key===family))throw new Error("Unknown connector family.");
 if(!FAILURE_SCENARIOS.includes(scenario))throw new Error("Unknown certification scenario.");
 const base={family,scenario,idempotencyKey:`cert:${family}:fixed-event`,signatureVerified:true,receiptStored:true,reconciled:true,retries:0,deadLettered:false,circuitOpen:false,passed:true};
 if(scenario==="TIMEOUT")return{...base,retries:3,deadLettered:true,circuitOpen:true,passed:true,outcome:"RETRY_EXHAUSTED_TO_DLQ"};
 if(scenario==="HTTP_500")return{...base,retries:3,deadLettered:true,circuitOpen:true,passed:true,outcome:"TRANSIENT_FAILURE_CONTAINED"};
 if(scenario==="MALFORMED_PAYLOAD")return{...base,signatureVerified:false,deadLettered:true,reconciled:false,passed:true,outcome:"REJECTED_BEFORE_PROCESSING"};
 if(scenario==="DUPLICATE_DELIVERY")return{...base,outcome:"IDEMPOTENT_DUPLICATE_IGNORED"};
 if(scenario==="OUT_OF_ORDER_WEBHOOK")return{...base,outcome:"BUFFERED_AND_RECONCILED"};
 return{...base,outcome:"ACCEPTED_WITH_RECEIPT"};
}

export function certifyMockFamily(family){
 const scenarios=FAILURE_SCENARIOS.map(scenario=>runMockCertificationScenario(family,scenario));
 const passed=scenarios.every(item=>item.passed&&item.receiptStored);
 return{family,state:passed?"HEALTH_CHECK_PASSED":"DEGRADED",providerMode:"GENERIC_FAILURE_HARNESS",contractProfileVerified:false,productionEnabled:false,scenarios};
}
