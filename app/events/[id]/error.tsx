"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function EventError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        title="Couldn't load this event"
        body="Something went wrong fetching this page. Try again, or head back to browse."
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={reset}>Try again</Button>
            <LinkButton href="/events">Browse events</LinkButton>
          </div>
        }
      />
    </main>
  );
}
