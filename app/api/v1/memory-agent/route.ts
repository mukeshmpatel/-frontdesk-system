import {getChatGPTUser} from "../../../chatgpt-auth";
import {ensureStaffWorkspace} from "../../../../db/staff";
import {recallAgentMemory,saveAgentMemory} from "../../../../db/memory-agent";
export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
  await ensureStaffWorkspace(user.email,user.displayName);const url=new URL(request.url);
  const result=await recallAgentMemory(user.email,url.searchParams.get("q")||"",url.searchParams.get("source")||"ALL",url.searchParams.get("from")||undefined,url.searchParams.get("to")||undefined);
  return result?Response.json(result):Response.json({error:"Staff access is required."},{status:403})}
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
  await ensureStaffWorkspace(user.email,user.displayName);try{const body=await request.json() as any;if(!body.title?.trim()||!body.content?.trim())throw new Error("Add a title and memory details.");
    const result=await saveAgentMemory(user.email,body);return result?Response.json(result,{status:201}):Response.json({error:"Staff access is required."},{status:403})
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Memory could not be saved."},{status:400})}}
