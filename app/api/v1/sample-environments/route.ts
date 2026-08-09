import { getChatGPTUser } from "../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../db/access-management";
import {
  activateCanonicalSampleWorkspace,
  cloneSampleEnvironment,
  listSampleEnvironments,
  rejectTemplateMutation,
} from "../../../../db/sample-environments";
import { recordUatAccessEvidence } from "../../../../db/phase10-uat";
import { authorizeUatRole } from "../../../../lib/uat-authorization.mjs";

async function uatGate(user:{email:string;uatRole?:string},action:string){const permission=authorizeUatRole(user.uatRole,"sample_lab",action);if(user.uatRole)await recordUatAccessEvidence({email:user.email,role:user.uatRole,capability:"sample_lab",action,allowed:permission.allowed,reason:permission.reason});return permission.allowed;}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_SAMPLE_LAB"))return Response.json({error:"Sample Environment access is required."},{status:403});
  if(!await uatGate(user,"READ"))return Response.json({error:"UAT role access denied."},{status:403});
  const result = await listSampleEnvironments(user.email);
  return result
    ? Response.json({ ...result, uatRole: user.uatRole ?? null })
    : Response.json({ error: "AAIQ workspace access required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_SAMPLE_LAB"))return Response.json({error:"Sample Environment access is required."},{status:403});
  if(!await uatGate(user,"CREATE"))return Response.json({error:"Administrator UAT role required."},{status:403});
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = body.action==="ACTIVATE_CANONICAL_SAMPLE"
      ? await activateCanonicalSampleWorkspace(user.email)
      : await cloneSampleEnvironment(user.email, body);
    return result
      ? Response.json(result, { status: 201 })
      : Response.json({ error: "Administrator access required." }, { status: 403 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "The sample environment could not be cloned.",
    }, { status: 400 });
  }
}

export async function PATCH() {
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in required."},{status:401});if(!await hasModuleAccess(user.email,"AAIQ_SAMPLE_LAB"))return Response.json({error:"Sample Environment access is required."},{status:403});
  try {
    await rejectTemplateMutation();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Protected template." }, { status: 423 });
  }
}

export async function DELETE() {
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in required."},{status:401});if(!await hasModuleAccess(user.email,"AAIQ_SAMPLE_LAB"))return Response.json({error:"Sample Environment access is required."},{status:403});
  try {
    await rejectTemplateMutation();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Protected template." }, { status: 423 });
  }
}
