import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { automationCenter,createAutomationRule,createBriefingPolicy,generateDailyBriefings,saveBriefingPreference } from "../../../../db/ai-briefing";

export async function GET(){
  const user=await getChatGPTUser(); if(!user)return Response.json({error:"Sign in is required."},{status:401});
  await ensureStaffWorkspace(user.email,user.displayName);
  const data=await automationCenter(user.email);
  return data?Response.json(data):Response.json({error:"Staff access is required."},{status:403});
}
export async function POST(request:Request){
  const user=await getChatGPTUser(); if(!user)return Response.json({error:"Sign in is required."},{status:401});
  await ensureStaffWorkspace(user.email,user.displayName);
  try{
    const body=await request.json() as Record<string,unknown>;
    const result=body.kind==="rule"?await createAutomationRule(user.email,body):
      body.kind==="policy"?await createBriefingPolicy(user.email,body):
      body.kind==="preference"?await saveBriefingPreference(user.email,body):
      body.kind==="generate"?await generateDailyBriefings(user.email):null;
    return result?Response.json(result,{status:body.kind==="generate"?200:201}):Response.json({error:"Manager access is required."},{status:403});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Request failed."},{status:400});}
}
