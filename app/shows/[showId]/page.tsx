import { getSession } from "@/lib/auth";
import { ShowSeatMapClient } from "./ShowSeatMapClient";

export default async function ShowPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  const session = await getSession();

  return (
    <ShowSeatMapClient
      showId={showId}
      isAuthenticated={!!session}
      canHold={session?.role === "CUSTOMER"}
    />
  );
}
