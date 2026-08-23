import { LinkButton } from "@/components/ui/Button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Ticket Booking</h1>
      <p className="text-[var(--page-fg)]/70">Movies and concerts, seat by seat.</p>
      <LinkButton href="/events">Browse events</LinkButton>
    </main>
  );
}
