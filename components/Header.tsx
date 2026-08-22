"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/auth";

export function Header({ session }: { session: Session | null }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
      <Link href="/" className="text-lg font-bold tracking-tight">
        Ticket Booking
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/events" className="hover:underline">
          Browse
        </Link>
        {session ? (
          <>
            <span className="text-[var(--page-fg)]/70">
              {session.email} <span className="font-semibold">({session.role})</span>
            </span>
            <button
              onClick={handleLogout}
              className="rounded border border-[var(--border-subtle)] px-3 py-1 hover:bg-[var(--border-subtle)]"
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="hover:underline">
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded bg-[var(--accent)] px-3 py-1 font-semibold text-[var(--accent-fg)]"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
