export const COMPLIANCE_POLICY_VERSION = "AAIQ-COMPLIANCE-INSPECTION-V1";

export type ComplianceState = "CONFIGURATION_REQUIRED"|"UNASSIGNED"|"ASSIGNED"|"ACKNOWLEDGED"|"INSPECTING"|
  "FAILED_HOLD"|"REMEDIATION_REQUIRED"|"AWAITING_EVIDENCE"|"AWAITING_REVIEW"|"COMPLIANT"|"REWORK_REQUIRED"|"WAIVED"|"CANCELLED";
export type ComplianceResult = "PASS"|"FAIL"|"NOT_APPLICABLE";
export type ResponseType = "PASS_FAIL"|"NUMBER"|"TEXT"|"DATE";

export type ProgramItem = { code:string; instruction:string; responseType:ResponseType; required:boolean; critical:boolean;
  measurementUnit?:string; minimum?:number; maximum?:number; evidenceRequiredOnFailure?:boolean };
export type BaselineProgram = { code:string; name:string; description:string; frequency:string; targetKind:string;
  licensedSignoffRequired:boolean; evidence:string[]; items:ProgramItem[] };

export const COMPLIANCE_BASELINES: readonly BaselineProgram[] = [
  { code:"FIRE-EXT-MONTHLY",name:"Fire extinguisher inspection",description:"Property-approved extinguisher condition and inspection record.",frequency:"MONTHLY",targetKind:"FIRE_EXTINGUISHER",licensedSignoffRequired:false,evidence:["OVERVIEW","IDENTIFICATION_TAG"],items:[
    {code:"ACCESS",instruction:"Confirm the unit is present, visible, and unobstructed.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"GAUGE",instruction:"Record whether the pressure indicator is in the property-approved operating range.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"PIN_SEAL",instruction:"Inspect the pin and tamper seal.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"CONDITION",instruction:"Inspect the hose, cylinder, mounting, corrosion, and visible damage.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"TAG_DATE",instruction:"Record the date shown on the inspection tag.",responseType:"DATE",required:true,critical:false},
  ]},
  { code:"POOL-DAILY",name:"Pool safety and chemistry log",description:"Property-approved pool readings and physical safety checks.",frequency:"DAILY",targetKind:"POOL",licensedSignoffRequired:false,evidence:["OVERVIEW","INSTRUMENT_READING"],items:[
    {code:"SANITIZER",instruction:"Record sanitizer reading and compare it with the approved property range.",responseType:"NUMBER",required:true,critical:true,measurementUnit:"configured unit",evidenceRequiredOnFailure:true},
    {code:"PH",instruction:"Record pH and compare it with the approved property range.",responseType:"NUMBER",required:true,critical:true,measurementUnit:"pH",evidenceRequiredOnFailure:true},
    {code:"TEMPERATURE",instruction:"Record water temperature.",responseType:"NUMBER",required:true,critical:false,measurementUnit:"°F"},
    {code:"GATES",instruction:"Inspect gates and latches against the approved checklist.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"RESCUE",instruction:"Confirm required rescue equipment and signs are present and accessible.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
  ]},
  { code:"EM-LIGHT-MONTHLY",name:"Emergency lighting test",description:"Function test of emergency fixtures and exit signs.",frequency:"MONTHLY",targetKind:"EMERGENCY_LIGHT",licensedSignoffRequired:false,evidence:["OVERVIEW","IDENTIFICATION_TAG"],items:[
    {code:"VISIBLE_CONDITION",instruction:"Inspect the fixture and sign for visible damage.",responseType:"PASS_FAIL",required:true,critical:false,evidenceRequiredOnFailure:true},
    {code:"BACKUP_FUNCTION",instruction:"Record the result of the approved backup-power function test.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"NORMAL_RESTORE",instruction:"Confirm controls were restored to normal operation.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
  ]},
  { code:"HVAC-QUARTERLY",name:"Guest-room HVAC preventive maintenance",description:"Property-approved HVAC preventive-maintenance inspection.",frequency:"QUARTERLY",targetKind:"HVAC",licensedSignoffRequired:false,evidence:["OVERVIEW","INSTRUMENT_READING"],items:[
    {code:"FILTER",instruction:"Inspect and record filter condition.",responseType:"PASS_FAIL",required:true,critical:false,evidenceRequiredOnFailure:true},
    {code:"CONDENSATE",instruction:"Inspect coil, pan, and condensate path for blockage or leakage.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"SUPPLY_TEMP",instruction:"Record the measured supply temperature.",responseType:"NUMBER",required:true,critical:false,measurementUnit:"°F"},
    {code:"RETURN_TEMP",instruction:"Record the measured return temperature.",responseType:"NUMBER",required:true,critical:false,measurementUnit:"°F"},
    {code:"OPERATION",instruction:"Verify heating/cooling operation using the approved property test.",responseType:"PASS_FAIL",required:true,critical:false,evidenceRequiredOnFailure:true},
  ]},
  { code:"GUESTROOM-PMI",name:"Guest-room preventive maintenance inspection",description:"Property-approved guest-room preventive-maintenance checklist.",frequency:"QUARTERLY",targetKind:"ROOM",licensedSignoffRequired:false,evidence:["OVERVIEW"],items:[
    {code:"ENTRY_LIFE_SAFETY",instruction:"Inspect entry hardware and life-safety devices using the approved checklist.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"ELECTRICAL",instruction:"Test lights, receptacles, and GFCI using approved procedures.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"PLUMBING",instruction:"Inspect fixtures, drains, caulk, leakage, hot water, and exhaust.",responseType:"PASS_FAIL",required:true,critical:false,evidenceRequiredOnFailure:true},
    {code:"HVAC",instruction:"Verify HVAC operation.",responseType:"PASS_FAIL",required:true,critical:false,evidenceRequiredOnFailure:true},
    {code:"FINISHES",instruction:"Inspect furniture, walls, flooring, window, drapery, and visible finishes.",responseType:"PASS_FAIL",required:true,critical:false,evidenceRequiredOnFailure:true},
  ]},
  { code:"BACKFLOW-ANNUAL",name:"Backflow prevention review",description:"Current certified backflow record and physical condition review.",frequency:"ANNUAL",targetKind:"BACKFLOW",licensedSignoffRequired:true,evidence:["CERTIFICATE","IDENTIFICATION_TAG"],items:[
    {code:"CERTIFICATE",instruction:"Record whether the current certificate is present and within its approved period.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"CONDITION",instruction:"Inspect for visible leakage, damage, and access obstruction.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"CERTIFIED_DATE",instruction:"Record the certified inspection date.",responseType:"DATE",required:true,critical:false},
  ]},
  { code:"BOILER-ANNUAL",name:"Boiler and water-heating inspection",description:"Property-approved operating and service inspection record.",frequency:"ANNUAL",targetKind:"BOILER",licensedSignoffRequired:true,evidence:["OVERVIEW","INSTRUMENT_READING","CERTIFICATE"],items:[
    {code:"VISIBLE_CONDITION",instruction:"Inspect for visible leakage, corrosion, venting concerns, and abnormal condition.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
    {code:"TEMPERATURE",instruction:"Record operating temperature.",responseType:"NUMBER",required:true,critical:false,measurementUnit:"°F"},
    {code:"PRESSURE",instruction:"Record operating pressure.",responseType:"NUMBER",required:true,critical:false,measurementUnit:"configured unit"},
    {code:"SAFETY_CONTROL",instruction:"Record the qualified-person result for required safety-control checks.",responseType:"PASS_FAIL",required:true,critical:true,evidenceRequiredOnFailure:true},
  ]},
] as const;

const transitions: Record<ComplianceState, readonly ComplianceState[]> = {
  CONFIGURATION_REQUIRED:["UNASSIGNED","ASSIGNED","CANCELLED"],UNASSIGNED:["ASSIGNED","CANCELLED"],
  ASSIGNED:["ACKNOWLEDGED","CANCELLED"],ACKNOWLEDGED:["INSPECTING","CANCELLED"],
  INSPECTING:["FAILED_HOLD","REMEDIATION_REQUIRED","AWAITING_EVIDENCE","AWAITING_REVIEW","CANCELLED"],
  FAILED_HOLD:["REWORK_REQUIRED"],REMEDIATION_REQUIRED:["REWORK_REQUIRED","WAIVED"],
  AWAITING_EVIDENCE:["INSPECTING","AWAITING_REVIEW","CANCELLED"],AWAITING_REVIEW:["COMPLIANT","REWORK_REQUIRED","FAILED_HOLD"],
  REWORK_REQUIRED:["INSPECTING","CANCELLED"],COMPLIANT:[],WAIVED:[],CANCELLED:[],
};

export function assertComplianceTransition(from:string,to:ComplianceState) {
  if (!(transitions[from as ComplianceState] || []).includes(to)) throw new Error(`Compliance transition ${from} → ${to} is not allowed.`);
  return to;
}

export function evaluateResponse(item:ProgramItem,input:{result?:string;numberValue?:unknown;textValue?:unknown;dateValue?:unknown;note?:unknown}) {
  const result = String(input.result || "").toUpperCase() as ComplianceResult;
  if (!["PASS","FAIL","NOT_APPLICABLE"].includes(result)) throw new Error("Choose Pass, Fail, or Not applicable.");
  const note=String(input.note||"").trim().slice(0,1500);
  if(result==="NOT_APPLICABLE"&&!note)throw new Error("Not applicable requires a factual reason.");
  let normalizedValue:string|null=null,rangeFailure=false;
  if(item.responseType==="NUMBER"){
    const value=Number(input.numberValue);if(!Number.isFinite(value))throw new Error("A numeric measurement is required.");
    normalizedValue=String(value);rangeFailure=(item.minimum!=null&&value<item.minimum)||(item.maximum!=null&&value>item.maximum);
  } else if(item.responseType==="DATE") {
    const value=String(input.dateValue||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("A valid date is required.");normalizedValue=value;
  } else if(item.responseType==="TEXT") {
    const value=String(input.textValue||"").trim();if(!value)throw new Error("A factual response is required.");normalizedValue=value.slice(0,1500);
  }
  const effectiveResult:ComplianceResult=rangeFailure?"FAIL":result;
  if(effectiveResult==="FAIL"&&!note)throw new Error("A failed item requires a factual deficiency note.");
  return{result:effectiveResult,value:normalizedValue,note,rangeFailure,criticalFailure:effectiveResult==="FAIL"&&item.critical};
}

export function nextDueAt(frequency:string,from=new Date()) {
  const next=new Date(from);
  if(frequency==="DAILY")next.setUTCDate(next.getUTCDate()+1);
  else if(frequency==="MONTHLY")next.setUTCMonth(next.getUTCMonth()+1);
  else if(frequency==="QUARTERLY")next.setUTCMonth(next.getUTCMonth()+3);
  else if(frequency==="ANNUAL")next.setUTCFullYear(next.getUTCFullYear()+1);
  else throw new Error("Unsupported compliance frequency.");
  return next.toISOString();
}

export function targetMatcher(targetKind:string) {
  const clauses:Record<string,string>={ROOM:"asset_type='ROOM'",POOL:"upper(name) LIKE '%POOL%'",HVAC:"asset_type='EQUIPMENT' AND (upper(name) LIKE '%HVAC%' OR upper(name) LIKE '%PTAC%' OR upper(name) LIKE '%THERMOSTAT%')",FIRE_EXTINGUISHER:"asset_type='EQUIPMENT' AND upper(name) LIKE '%EXTINGUISHER%'",EMERGENCY_LIGHT:"asset_type='EQUIPMENT' AND (upper(name) LIKE '%EMERGENCY LIGHT%' OR upper(name) LIKE '%EXIT SIGN%')",BACKFLOW:"asset_type='EQUIPMENT' AND upper(name) LIKE '%BACKFLOW%'",BOILER:"asset_type='EQUIPMENT' AND (upper(name) LIKE '%BOILER%' OR upper(name) LIKE '%WATER HEATER%')"};
  return clauses[targetKind] || null;
}
