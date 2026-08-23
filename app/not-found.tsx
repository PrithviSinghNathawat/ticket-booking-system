import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        title="Page not found"
        body="Whatever you were looking for isn't here. It may have been cancelled, or the link might be wrong."
        action={<LinkButton href="/">Back to home</LinkButton>}
      />
    </main>
  );
}
