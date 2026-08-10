import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { createMaintenanceIssue, decideEvidenceReview, generateComplianceAssignments, getPropertyWorkflows, importNightRoomReport, saveAttachment, toggleWorkStep, updateWorkOrder } from "../../../../db/property-workflows";
import { cookies } from "next/headers";

export async function GET(){
  const user=await getChatGPTUser(); if(!user)return Response.json({error:"Sign in is required."},{status:401});
  const propertyId=(await cookies()).get("aaiq_active_property")?.value;
  const data=await getPropertyWorkflows(user.email,propertyId); return data&&!((data as any).forbidden)?Response.json(data,{headers:{"cache-control":"private, no-store"}}):Response.json({error:"Staff or property access is required."},{status:403});
}
export async function POST(request:Request){
  const user=await getChatGPTUser(); if(!user)return Response.json({error:"Sign in is required."},{status:401});
  try{
    const propertyId=(await cookies()).get("aaiq_active_property")?.value;
    const type=request.headers.get("content-type")||"";
    if(type.includes("multipart/form-data")){
      if(!env.MEDIA)return Response.json({error:"Evidence storage is unavailable."},{status:503});
      const form=await request.formData(), file=form.get("file"), workOrderId=String(form.get("workOrderId")||""), action=String(form.get("action")||"evidence");
      if(!(file instanceof File))return Response.json({error:"A file is required."},{status:400});
      if(action==="night_room_report"){
        if(file.size>5*1024*1024)return Response.json({error:"Night room reports must be 5MB or smaller."},{status:413});
        if(!/\.(csv|txt)$/i.test(file.name))return Response.json({error:"Upload an exported CSV or text room report."},{status:415});
        const objectKey=`night-room-reports/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
        const text=await file.text();
        await env.MEDIA.put(objectKey,text,{httpMetadata:{contentType:file.type||"text/plain"}});
        try{
          const result=await importNightRoomReport(user.email,file.name,objectKey,text,propertyId);
          if(!result){await env.MEDIA.delete(objectKey);return Response.json({error:"Administrator access is required."},{status:403})}
          return Response.json(result,{status:202});
        }catch(error){await env.MEDIA.delete(objectKey);throw error}
      }
      if(!workOrderId)return Response.json({error:"A work order is required."},{status:400});
      if(file.size>15*1024*1024)return Response.json({error:"Evidence files must be 15MB or smaller."},{status:413});
      if(!(file.type.startsWith("image/")||file.type==="application/pdf"||file.type==="text/plain"))return Response.json({error:"Use an image, PDF, or text file."},{status:415});
      const objectKey=`work-evidence/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      await env.MEDIA.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type||"application/octet-stream"}});
      try{
        const result=await saveAttachment(user.email,workOrderId,file,objectKey,String(form.get("evidenceArea")||"FINAL_WIDE"),String(form.get("evidenceStage")||"AFTER"),propertyId);
        if(!result){await env.MEDIA.delete(objectKey);return Response.json({error:"Work order not found or access is not permitted."},{status:404})}
        return Response.json(result,{status:201});
      }catch(error){await env.MEDIA.delete(objectKey);throw error}
    }
    const body=await request.json() as Record<string,any>;
    const result=body.action==="progress"?await updateWorkOrder(user.email,String(body.id),Number(body.progress),body.status,propertyId)
      :body.action==="maintenance_issue"?await createMaintenanceIssue(user.email,{parentId:String(body.parentId||""),room:String(body.room||""),title:String(body.title||"Maintenance issue"),description:String(body.description||""),priority:String(body.priority||"HIGH")},propertyId)
      :body.action==="generate_compliance"?await generateComplianceAssignments(user.email,propertyId)
      :body.action==="toggle_step"?await toggleWorkStep(user.email,String(body.stepId),Boolean(body.completed),propertyId)
      :body.action==="review_evidence"?await decideEvidenceReview(user.email,String(body.reviewId),String(body.decision),String(body.note||""),propertyId):null;
    return result?Response.json(result):Response.json({error:"Action is not permitted."},{status:403});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Workflow action failed."},{status:409})}
}
