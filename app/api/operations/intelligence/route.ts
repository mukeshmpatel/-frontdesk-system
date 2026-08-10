import { getChatGPTUser } from "../../../chatgpt-auth";
import { draftSupplyOrder, inventoryWorkflow, propertyIntelligence, recordCleaningCompletion, verifyAmenityAccess } from "../../../../db/property-intelligence";
import { cookies } from "next/headers";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const data = await propertyIntelligence(user.email,(await cookies()).get("aaiq_active_property")?.value);
  return data ? Response.json(data, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Staff access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const body = await request.json() as { action?:string; confirmation?:string; room?:string; facility?:string; sku?:string; housekeeper?:string; minutes?:number };
  try {
    const result = body.action === "verify_access"
      ? await verifyAmenityAccess(user.email, body.confirmation ?? "", body.room ?? "", body.facility ?? "")
      : body.action === "draft_order" ? await draftSupplyOrder(user.email, body.sku ?? "")
      : body.action === "record_cleaning" ? await recordCleaningCompletion(user.email, body.housekeeper ?? "", body.room ?? "", Number(body.minutes))
      : await inventoryWorkflow(user.email,{...body,propertyId:(await cookies()).get("aaiq_active_property")?.value} as Record<string,unknown>);
    return result ? Response.json(result) : Response.json({ error: "Action is not permitted." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Action failed." }, { status: 409 });
  }
}
