import nodemailer from "nodemailer";
import { after } from "next/server";
import QRCode from "qrcode";
import { MAIL_DRY_RUN } from "@/lib/config";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export type BookingEmailSeat = {
  rowLabel: string;
  seatNumber: number;
  categoryName: string;
  price: number;
};

export type BookingEmailPayload = {
  reference: string;
  contactEmail: string;
  contactName: string;
  eventTitle: string;
  venueName: string;
  startsAt: Date;
  seats: BookingEmailSeat[];
  totalAmount: number;
  qrPayload: string;
};

async function buildEmail(payload: BookingEmailPayload) {
  const qrBuffer = await QRCode.toBuffer(payload.qrPayload, { margin: 1, width: 240 });
  const when = payload.startsAt.toUTCString();

  const seatText = payload.seats
    .map((s) => `${s.rowLabel}${s.seatNumber} (${s.categoryName}) - ${s.price}`)
    .join("\n");
  const seatRows = payload.seats
    .map(
      (s) =>
        `<tr><td style="padding:2px 8px 2px 0">${s.rowLabel}${s.seatNumber}</td><td style="padding:2px 8px">${s.categoryName}</td><td style="padding:2px 0">${s.price}</td></tr>`
    )
    .join("");

  const text = [
    `Booking confirmed - ${payload.reference}`,
    "",
    payload.eventTitle,
    payload.venueName,
    when,
    "",
    "Seats:",
    seatText,
    "",
    `Total: ${payload.totalAmount}`,
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:420px;color:#1f1b16">
  <h2 style="margin:0 0 4px">Booking confirmed</h2>
  <p style="margin:0 0 12px;color:#555">Ref: ${payload.reference}</p>
  <p style="margin:0 0 4px"><strong>${payload.eventTitle}</strong></p>
  <p style="margin:0 0 4px">${payload.venueName}</p>
  <p style="margin:0 0 12px">${when}</p>
  <table style="border-collapse:collapse;font-size:14px">${seatRows}</table>
  <p style="margin:12px 0 16px"><strong>Total: ${payload.totalAmount}</strong></p>
  <img src="cid:ticket-qr" alt="Ticket QR code" width="180" height="180" />
</div>`.trim();

  return {
    text,
    html,
    attachments: [{ filename: "ticket-qr.png", content: qrBuffer, cid: "ticket-qr" }],
  };
}

export function sendBookingConfirmationEmail(payload: BookingEmailPayload) {
  after(async () => {
    try {
      const { text, html, attachments } = await buildEmail(payload);
      const subject = `Your booking confirmation - ${payload.eventTitle}`;

      if (MAIL_DRY_RUN) {
        console.log("[MAIL_DRY_RUN] booking confirmation email", {
          reference: payload.reference,
          to: payload.contactEmail,
          subject,
          text,
        });
        return;
      }

      const info = await getTransporter().sendMail({
        from: process.env.GMAIL_USER,
        to: payload.contactEmail,
        subject,
        text,
        html,
        attachments,
      });
      console.log(`Sent booking confirmation email for ${payload.reference}:`, info.messageId);
    } catch (err) {
      console.error(`Failed to send booking confirmation email for ${payload.reference}:`, err);
    }
  });
}
