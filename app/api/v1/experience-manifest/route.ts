import { getChatGPTUser } from "../../../chatgpt-auth";
import { resolveExperienceManifest } from "../../../../db/experience-resolver";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const propertyId = new URL(request.url).searchParams.get("propertyId");
  const manifest = await resolveExperienceManifest(user.email, propertyId);
  return manifest
    ? Response.json(manifest, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Staff access required." }, { status: 403 });
}
