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
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-6 sm:py-4">
      <Link href="/" className="text-lg font-bold tracking-tight">
        Ticket Booking
      </Link>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/events" className="hover:underline">
          Browse
        </Link>
        {session?.role === "CUSTOMER" && (
          <>
            <Link href="/bookings" className="hover:underline">
              My bookings
            </Link>
            <Link href="/waitlist" className="hover:underline">
              Waitlist
            </Link>
          </>
        )}
        {session?.role === "ORGANISER" && (
          <Link href="/organiser/events" className="hover:underline">
            My events
          </Link>
        )}
        {session?.role === "ADMIN" && (
          <Link href="/admin/venues" className="hover:underline">
            Venues
          </Link>
        )}
        {session ? (
          <>
            <span className="max-w-[40vw] truncate text-[var(--page-fg)]/70 sm:max-w-none" title={session.email}>
              {session.email} <span className="font-semibold">({session.role})</span>
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-1 transition-transform hover:bg-[var(--border-subtle)] active:translate-y-px"
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
              className="rounded-lg bg-[var(--accent)] px-3 py-1 font-semibold text-[var(--accent-fg)] shadow-[0_1px_0_rgba(0,0,0,0.15)] transition-transform active:translate-y-px"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
