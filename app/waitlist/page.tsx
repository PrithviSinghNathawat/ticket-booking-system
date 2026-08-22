import Link from "next/link";
import { getSession } from "@/lib/auth";
import { WaitlistClient } from "./WaitlistClient";

export default async function WaitlistPage() {
  const session = await getSession();

  if (!session || session.role !== "CUSTOMER") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Sign in as a customer to see your waitlist entries</h1>
        <Link href="/login" className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]">
          Log in
        </Link>
      </main>
    );
  }

  return <WaitlistClient />;
}
