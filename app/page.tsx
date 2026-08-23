import { LinkButton } from "@/components/ui/Button";
import { ENABLE_DEMO_ROUTES } from "@/lib/config";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Ticket Booking</h1>
      <p className="text-[var(--page-fg)]/70">Movies and concerts, seat by seat.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <LinkButton href="/events">Browse events</LinkButton>
        {ENABLE_DEMO_ROUTES && (
          <LinkButton href="/demo" variant="secondary">
            Concurrency demo
          </LinkButton>
        )}
      </div>
    </main>
  );
}
