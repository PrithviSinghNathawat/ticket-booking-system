"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        title="Something went wrong"
        body="That's on us, not you. Try again, or head back to the home page."
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
            <LinkButton href="/">Back to home</LinkButton>
          </div>
        }
      />
    </main>
  );
}
