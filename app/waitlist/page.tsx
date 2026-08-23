import { getSession } from "@/lib/auth";
import { WaitlistClient } from "./WaitlistClient";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function WaitlistPage() {
  const session = await getSession();

  if (!session || session.role !== "CUSTOMER") {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          title="Sign in as a customer to see your waitlist entries"
          action={<LinkButton href="/login">Log in</LinkButton>}
        />
      </main>
    );
  }

  return <WaitlistClient />;
}
