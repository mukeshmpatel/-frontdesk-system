import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { createFrontDeskItem, updateFrontDeskItem } from "../../../../db/operations";
import {
  createOperationalRecord,
  createPropertyContext,
  enterpriseOperations,
  transitionOperationalRecord,
  switchPropertyContext,
} from "../../../../db/enterprise-operations";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const propertyId = new URL(request.url).searchParams.get("propertyId") || (await cookies()).get("aaiq_active_property")?.value;
    const result = await enterpriseOperations(user.email, propertyId);
    if (!result || "forbidden" in result) return Response.json({ error: "Property access is required." }, { status: 403 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Front desk operations could not be loaded." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const payload = (await request.json()) as {
      action?: string;
      propertyId?: string;
      itemType?: string;
      title?: string;
      details?: string;
      roomReference?: string;
      priority?: string;
      assignedToEmail?: string | null;
      dueAt?: string | null;
    };
    if (payload.action === "CREATE_OPERATIONAL_RECORD") {
      const result = await createOperationalRecord(user.email, payload);
      if (!result || "forbidden" in result) return Response.json({ error: "Property access is required." }, { status: 403 });
      return Response.json(result, { status: 201 });
    }
    if (payload.action === "CREATE_PROPERTY") {
      const result = await createPropertyContext(user.email, payload);
      if (!result) return Response.json({ error: "Administrator access is required." }, { status: 403 });
      return Response.json(result, { status: 201 });
    }
    if (payload.action === "SWITCH_PROPERTY") {
      const result = await switchPropertyContext(user.email, payload.propertyId ?? "");
      if (!result || "forbidden" in result) return Response.json({ error: "Property access is required." }, { status: 403 });
      (await cookies()).set("aaiq_active_property", result.property.id, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 180,
      });
      return Response.json(result);
    }
    const result = await createFrontDeskItem(user.email, { ...payload, title: payload.title ?? "" });
    if (!result) return Response.json({ error: "Staff access is required." }, { status: 403 });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Front desk item could not be created." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const payload = (await request.json()) as {
      action?: string;
      id?: string;
      status?: "open" | "in_progress" | "done";
      assignedToEmail?: string | null;
      priority?: "normal" | "high" | "urgent";
    };
    if (payload.action === "TRANSITION_OPERATIONAL_RECORD") {
      const result = await transitionOperationalRecord(user.email, payload);
      if (!result || "forbidden" in result) return Response.json({ error: "Property access is required." }, { status: 403 });
      return Response.json(result);
    }
    const result = await updateFrontDeskItem(user.email, payload.id ?? "", payload);
    if (!result) return Response.json({ error: "Staff access is required." }, { status: 403 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Front desk item could not be updated." }, { status: 400 });
  }
}
