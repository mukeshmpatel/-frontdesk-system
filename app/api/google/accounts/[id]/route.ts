import { getChatGPTUser } from "../../../../chatgpt-auth";
import {
  deleteGoogleConnection,
  getGoogleConnection,
} from "../../../../../db/google";
import { decryptSecret } from "../../../../server/secrets";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

  const { id } = await context.params;
  const connection = await getGoogleConnection(id, user.email);
  if (!connection) return Response.json({ error: "Account not found." }, { status: 404 });

  try {
    const token = await decryptSecret(connection.encrypted_refresh_token);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Removing the local connection remains possible if Google is unavailable.
  }
  await deleteGoogleConnection(id, user.email);
  return Response.json({ disconnected: true });
}
