"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function OrganiserEventError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        title="Couldn't load this summary"
        body="Try again, or head back to your events."
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={reset}>Try again</Button>
            <LinkButton href="/organiser/events">Your events</LinkButton>
          </div>
        }
      />
    </main>
  );
}
