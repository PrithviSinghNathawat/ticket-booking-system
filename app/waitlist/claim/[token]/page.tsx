import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ClaimClient } from "./ClaimClient";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/waitlist/claim/${token}`)}`);
  }

  return <ClaimClient token={token} />;
}
