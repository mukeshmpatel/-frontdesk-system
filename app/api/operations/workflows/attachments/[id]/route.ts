import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { attachmentForUser } from "../../../../../../db/property-workflows";
import { cookies } from "next/headers";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getChatGPTUser(); if(!user)return new Response("Unauthorized",{status:401});
  const propertyId=(await cookies()).get("aaiq_active_property")?.value;
  const {id}=await params, item=await attachmentForUser(user.email,id,propertyId);
  if(!item||!env.MEDIA)return new Response("Not found",{status:404});
  const object=await env.MEDIA.get(item.object_key); if(!object)return new Response("Not found",{status:404});
  return new Response(object.body,{headers:{"content-type":item.content_type,"content-disposition":`inline; filename="${String(item.file_name).replace(/"/g,"")}"`,"cache-control":"private, max-age=60"}});
}
