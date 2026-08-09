import { requireChatGPTUser } from "../chatgpt-auth";
import GuestJourneyClient from "./guest-journey-client";

export const dynamic = "force-dynamic";

export default async function GuestJourneyPage() {
  const user = await requireChatGPTUser("/guest-journey");
  return <GuestJourneyClient userEmail={user.email} />;
}
