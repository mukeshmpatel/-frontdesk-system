import{getChatGPTUser}from"../../../../chatgpt-auth";
import{taskDrilldownSnapshot}from"../../../../../db/reporting-layer";
import{reportingAccessError}from"../../../../../lib/reporting-route-access";

export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
 const denied=await reportingAccessError(user,"READ");if(denied)return denied;const url=new URL(request.url),priority=url.searchParams.get("priority")||undefined;
 if(priority&&!['CRITICAL','HIGH','MEDIUM','LOW'].includes(priority.toUpperCase()))return Response.json({error:"Unsupported task priority."},{status:400});
 const result=await taskDrilldownSnapshot(user.email,{priority,propertyId:url.searchParams.get("property"),logWidget:false});
 return result?Response.json(result,{headers:{"cache-control":"private, no-store"}}):Response.json({error:"Task reporting access is required."},{status:403});
}

export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
 const denied=await reportingAccessError(user,"READ");if(denied)return denied;const body=await request.json() as{priority?:string;property?:string};
 const priority=body.priority?.toUpperCase();if(priority&&!['CRITICAL','HIGH','MEDIUM','LOW'].includes(priority))return Response.json({error:"Unsupported task priority."},{status:400});
 const result=await taskDrilldownSnapshot(user.email,{priority,propertyId:body.property,logWidget:true});
 return result?Response.json(result):Response.json({error:"Task reporting access is required."},{status:403});
}
