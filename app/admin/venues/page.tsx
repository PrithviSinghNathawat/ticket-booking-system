import Link from "next/link";
import { getSession } from "@/lib/auth";
import { AdminVenuesClient } from "./AdminVenuesClient";

export default async function AdminVenuesPage() {
  const session = await getSession();

  if (!session || session.role !== "ADMIN") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Admins only</h1>
        <Link href="/login" className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]">
          Log in
        </Link>
      </main>
    );
  }

  return <AdminVenuesClient />;
}
