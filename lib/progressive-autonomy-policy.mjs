export const AUTONOMY_LEVELS = Object.freeze({NONE:"NONE",ASSISTED:"ASSISTED",CEILING_BOUND:"CEILING_BOUND",FULL:"FULL"});

export function resolveAutonomy(config, context={}) {
  const confidence=Number(context.confidence ?? 0);
  const amount=context.amount == null ? null : Number(context.amount);
  if(config.permanentExclusion || config.permanent_exclusion){
    return {execute:false,level:AUTONOMY_LEVELS.NONE,reason:"PERMANENT_EXCLUSION"};
  }
  const level=String(config.autonomyLevel ?? config.autonomy_level ?? "ASSISTED").toUpperCase();
  if(level===AUTONOMY_LEVELS.ASSISTED){
    return {execute:false,level,reason:"POLICY_REQUIRED"};
  }
  if(level===AUTONOMY_LEVELS.CEILING_BOUND){
    const ceiling=config.authorityCeiling ?? config.authority_ceiling;
    if(ceiling == null || amount == null || !Number.isFinite(amount) || amount>Number(ceiling)){
      return {execute:false,level,reason:"CEILING_EXCEEDED",ceiling:Number(ceiling)};
    }
    return {execute:true,level,reason:"WITHIN_CEILING",ceiling:Number(ceiling)};
  }
  const threshold=Number(config.confidenceThreshold ?? config.confidence_threshold ?? 90);
  return confidence>=threshold
    ? {execute:true,level:AUTONOMY_LEVELS.FULL,reason:"CONFIDENCE_VERIFIED"}
    : {execute:false,level:AUTONOMY_LEVELS.FULL,reason:"LOW_CONFIDENCE"};
}

export function calculateTrustScore(samples){
  if(!samples.length)return 0;
  const weighted=samples.reduce((sum,item)=>sum+Number(item.score)*(item.critical?2:1),0);
  const weights=samples.reduce((sum,item)=>sum+(item.critical?2:1),0);
  return Math.max(0,Math.min(100,Math.round(weighted/weights*100)/100));
}

export function promotionEligibility({level,samples,windowDays,trustScore,criticalFailures}){
  if(criticalFailures>0)return {eligible:false,reason:"CRITICAL_FAILURE"};
  if(samples<50)return {eligible:false,reason:"INSUFFICIENT_SAMPLES"};
  if(windowDays<30)return {eligible:false,reason:"INSUFFICIENT_WINDOW"};
  if(trustScore<95)return {eligible:false,reason:"TRUST_BELOW_THRESHOLD"};
  const next=level==="ASSISTED"?"CEILING_BOUND":level==="CEILING_BOUND"?"FULL":null;
  return next?{eligible:true,proposedLevel:next}:{eligible:false,reason:"ALREADY_FULL"};
}

export function demotedLevel(level){
  return level==="FULL"?"CEILING_BOUND":level==="CEILING_BOUND"?"ASSISTED":"ASSISTED";
}
