"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CheckoutError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        title="Checkout hit a problem"
        body="Nothing was charged. Try again, or head back to browse and pick your seats again."
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
