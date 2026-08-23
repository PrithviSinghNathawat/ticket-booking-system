import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CheckoutClient } from "./CheckoutClient";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  const session = await getSession();

  if (!session) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          title="Sign in required"
          action={
            <LinkButton href={`/login?returnUrl=${encodeURIComponent(`/checkout/${showId}`)}`}>
              Log in
            </LinkButton>
          }
        />
      </main>
    );
  }

  if (session.role !== "CUSTOMER") {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          title="Customers only"
          body="Only customer accounts can hold and book seats."
          action={<LinkButton href={`/shows/${showId}`} variant="secondary">Back to seat map</LinkButton>}
        />
      </main>
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });

  return (
    <CheckoutClient
      showId={showId}
      defaultContactName={user?.name ?? ""}
      defaultContactEmail={user?.email ?? ""}
    />
  );
}
