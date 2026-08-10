import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { updateAutomationRule } from "../../../../../../db/ai-briefing";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
  const {id}=await params;const result=await updateAutomationRule(user.email,id,await request.json() as Record<string,unknown>);
  return result?Response.json(result):Response.json({error:"Manager access is required."},{status:403});
}
