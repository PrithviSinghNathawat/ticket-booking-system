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

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{booking.show.event.title}</h1>
          <p className="text-sm text-[var(--page-fg)]/70">
            {booking.show.venue.name} ·{" "}
            {new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(
              booking.show.startsAt
            )}
          </p>
          <p className="mt-1 text-sm">
            Status:{" "}
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                booking.status === "CONFIRMED" ? "bg-[var(--mine)] text-white" : "bg-[var(--booked)] text-white"
              }`}
            >
              {booking.status}
            </span>
          </p>
          {booking.status === "CONFIRMED" && (
            <div className="mt-2">
              <CancelBookingButton reference={booking.reference} />
            </div>
          )}
        </div>
        <img src={qrDataUrl} alt="Ticket QR code" width={160} height={160} className="rounded-lg border border-[var(--border-subtle)]" />
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] p-4">
        <h2 className="mb-2 font-semibold">Seats</h2>
        <ul className="text-sm">
          {booking.seats.map((s) => (
            <li key={s.id}>
              {s.seat.rowLabel}
              {s.seat.seatNumber} · {s.categoryName} · {s.price.toString()}
            </li>
          ))}
        </ul>
        <p className="mt-2 font-semibold">Total: {booking.totalAmount.toString()}</p>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] p-4 text-sm">
        <h2 className="mb-2 font-semibold">Contact</h2>
        <p>{booking.contactName}</p>
        <p>{booking.contactEmail}</p>
        <p>{booking.contactPhone}</p>
      </div>

      <p className="text-xs text-[var(--page-fg)]/60">Reference: {booking.reference}</p>
    </main>
  );
}
