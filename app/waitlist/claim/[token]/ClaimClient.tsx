"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ClaimState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "expired"; message: string }
  | { kind: "error"; message: string };

export function ClaimClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<ClaimState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/waitlist/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;

        if (res.status === 404) {
          setState({ kind: "not-found" });
        } else if (res.status === 410) {
          setState({ kind: "expired", message: body.error });
        } else if (res.ok) {
          router.push(`/checkout/${body.showId}`);
        } else {
          setState({ kind: "error", message: body.error ?? "Something went wrong" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", message: "Could not reach the server" });
      });

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (state.kind === "loading") {
    return <main className="flex-1 p-8">Checking your offer...</main>;
  }

  if (state.kind === "not-found") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Offer not found</h1>
        <p className="max-w-sm text-[var(--page-fg)]/70">
          This claim link doesn&apos;t belong to your account, or it doesn&apos;t exist.
        </p>
        <Link href="/events" className="rounded border border-[var(--border-subtle)] px-4 py-2 text-sm">
          Browse events
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">
        {state.kind === "expired" ? "This offer has expired" : "Something went wrong"}
      </h1>
      <p className="max-w-sm text-[var(--page-fg)]/70">{state.message}</p>
      <Link href="/waitlist" className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]">
        View your waitlist entries
      </Link>
    </main>
  );
}
