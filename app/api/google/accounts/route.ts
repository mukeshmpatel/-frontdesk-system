import { getChatGPTUser } from "../../../chatgpt-auth";
import { listGoogleConnections } from "../../../../db/google";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

  const accounts = await listGoogleConnections(user.email);
  return Response.json({
    accounts: accounts.map((account) => ({
      id: account.id,
      email: account.account_email,
      name: account.display_name,
      connectedAt: account.created_at,
    })),
  });
}
