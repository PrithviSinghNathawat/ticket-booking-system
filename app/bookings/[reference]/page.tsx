import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildQrPayload } from "@/lib/qr";
import { renderQrDataUrl } from "@/lib/mail";
import { CancelBookingButton } from "./CancelBookingButton";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const session = await getSession();

  if (!session || session.role !== "CUSTOMER") {
    notFound();
  }

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: {
      show: { include: { event: true, venue: true } },
      seats: { include: { seat: true } },
    },
  });

  if (!booking || booking.userId !== session.userId) {
    notFound();
  }

  const qrDataUrl = await renderQrDataUrl(buildQrPayload(booking.reference));
  const cancelled = booking.status === "CANCELLED";

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <div
        className={`flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-dark)] text-[var(--panel-dark-fg)] shadow-lg sm:flex-row ${cancelled ? "opacity-60 grayscale" : ""}`}
      >
        <div className="flex flex-1 flex-col gap-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--panel-dark-fg)]/50">
              {booking.show.event.type === "MOVIE" ? "Movie ticket" : "Concert ticket"}
            </p>
            <h1 className="text-2xl font-bold">{booking.show.event.title}</h1>
            <p className="mt-1 text-sm text-[var(--panel-dark-fg)]/70">
              {booking.show.venue.name} ·{" "}
              {new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(
                booking.show.startsAt
              )}
            </p>
          </div>

          <span
            className={`w-fit rounded px-2 py-0.5 text-xs font-semibold ${
              booking.status === "CONFIRMED" ? "bg-[var(--mine)] text-white" : "bg-[var(--held)] text-white"
            }`}
          >
            {booking.status}
          </span>

          <div className="border-t border-white/10 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--panel-dark-fg)]/70">Seats</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {booking.seats.map((s) => (
                <li key={s.id} className="flex justify-between gap-4">
                  <span>
                    {s.seat.rowLabel}
                    {s.seat.seatNumber} · {s.categoryName}
                  </span>
                  <span className="font-mono">{s.price.toString()}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-white/10 pt-2 font-semibold">
              <span>Total</span>
              <span className="font-mono">{booking.totalAmount.toString()}</span>
            </p>
          </div>

          <div className="border-t border-white/10 pt-4 text-sm text-[var(--panel-dark-fg)]/70">
            <p>{booking.contactName}</p>
            <p>{booking.contactEmail}</p>
            <p>{booking.contactPhone}</p>
          </div>

          {booking.status === "CONFIRMED" && (
            <div className="mt-auto pt-2">
              <CancelBookingButton reference={booking.reference} />
            </div>
          )}
        </div>

        <div className="ticket-stub-divider flex shrink-0 flex-col items-center justify-center gap-3 p-6 sm:w-48">
          <img
            src={qrDataUrl}
            alt="Ticket QR code"
            width={144}
            height={144}
            className="rounded-lg bg-white p-2"
          />
          <p className="text-center font-mono text-xs tracking-wide text-[var(--panel-dark-fg)]/70">
            {booking.reference}
          </p>
          <p className="text-center text-[10px] uppercase tracking-widest text-[var(--panel-dark-fg)]/40">
            Admit {booking.seats.length}
          </p>
        </div>
      </div>
    </main>
  );
}
