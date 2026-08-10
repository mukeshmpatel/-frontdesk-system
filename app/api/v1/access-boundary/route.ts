import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { hasModuleAccess } from "../../../../db/access-management";
import { accessBoundaryAdmin, COOKIE_NAME, createAccessBoundarySession, MAX_AGE_SECONDS, runSecurityContinuityDrill, saveAccessPolicy } from "../../../../db/access-boundary";
import { requestClientIp } from "../../../server/client-ip";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_SECURITY"))return Response.json({error:"Security administration access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  const data = await accessBoundaryAdmin(user.email);
  return data ? Response.json(data) : Response.json({ error: "Administrator access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_SECURITY"))return Response.json({error:"Security administration access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  const body = await request.json() as Record<string, unknown>;
  if(body.action==="RUN_CONTINUITY_DRILL"){
    try{const result=await runSecurityContinuityDrill(user.email,String(body.propertyId||""));return result?Response.json(result):Response.json({error:"Administrator access is required."},{status:403});}
    catch(error){return Response.json({error:error instanceof Error?error.message:"Continuity drill failed."},{status:400});}
  }
  if (body.action === "SAVE_POLICY") {
    try {
      const result = await saveAccessPolicy(user.email, body);
      return result ? Response.json(result) : Response.json({ error: "Administrator access is required." }, { status: 403 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Policy could not be saved." }, { status: 400 });
    }
  }
  const result = await createAccessBoundarySession(user.email, {
    ip: requestClientIp(request), latitude: Number(body.latitude), longitude: Number(body.longitude),
    path: String(body.path || "/"),
  });
  const response = Response.json(result, { status: result.allowed ? 200 : 403 });
  if (result.allowed && result.token) response.headers.append("set-cookie",
    `${COOKIE_NAME}=${result.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECONDS}`);
  return response;
}
