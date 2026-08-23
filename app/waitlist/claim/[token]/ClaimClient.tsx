"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

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
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-72" />
      </main>
    );
  }

  if (state.kind === "not-found") {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          title="Offer not found"
          body="This claim link doesn't belong to your account, or it doesn't exist."
          action={<LinkButton href="/events" variant="secondary">Browse events</LinkButton>}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        title={state.kind === "expired" ? "This offer has expired" : "Something went wrong"}
        body={state.message}
        action={<LinkButton href="/waitlist">View your waitlist entries</LinkButton>}
      />
    </main>
  );
}
