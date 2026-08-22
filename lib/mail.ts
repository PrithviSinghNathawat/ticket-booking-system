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
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
    });
  }
  return transporter;
}

const QR_RENDER_OPTIONS = { width: 300, margin: 2, errorCorrectionLevel: "M" as const };

type MailJob = {
  logRef: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; cid: string }[];
};

async function sendOne(job: MailJob) {
  if (MAIL_DRY_RUN) {
    console.log(`[MAIL_DRY_RUN] ${job.logRef}`, { to: job.to, subject: job.subject, text: job.text });
    return;
  }

  const info = await getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to: job.to,
    subject: job.subject,
    text: job.text,
    html: job.html,
    attachments: job.attachments,
  });
  console.log(`Sent email for ${job.logRef}:`, info.messageId);
}

async function sendMailBatch(jobs: MailJob[]) {
  const results = await Promise.allSettled(jobs.map(sendOne));
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`Failed to send email for ${jobs[i].logRef}:`, result.reason);
    }
  });
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

async function buildBookingConfirmationJob(payload: BookingEmailPayload): Promise<MailJob> {
  const qrBuffer = await QRCode.toBuffer(payload.qrPayload, QR_RENDER_OPTIONS);
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
    logRef: payload.reference,
    to: payload.contactEmail,
    subject: `Your booking confirmation - ${payload.eventTitle}`,
    text,
    html,
    attachments: [{ filename: "ticket-qr.png", content: qrBuffer, cid: "ticket-qr" }],
  };
}

export function sendBookingConfirmationEmail(payload: BookingEmailPayload) {
  after(async () => {
    try {
      const job = await buildBookingConfirmationJob(payload);
      await sendMailBatch([job]);
    } catch (err) {
      console.error(`Failed to build booking confirmation email for ${payload.reference}:`, err);
    }
  });
}

export type WaitlistOfferEmailPayload = {
  offerReference: string;
  contactEmail: string;
  eventTitle: string;
  venueName: string;
  startsAt: Date;
  rowLabel: string;
  seatNumber: number;
  categoryName: string;
  expiresAt: Date;
  ttlSeconds: number;
  claimUrl: string;
};

function buildWaitlistOfferJob(payload: WaitlistOfferEmailPayload): MailJob {
  const when = payload.startsAt.toUTCString();
  const deadline = payload.expiresAt.toLocaleString();
  const minutes = Math.round(payload.ttlSeconds / 60);

  const text = [
    `A seat opened up - ${payload.eventTitle}`,
    "",
    payload.venueName,
    when,
    "",
    `Seat: ${payload.rowLabel}${payload.seatNumber} (${payload.categoryName})`,
    "",
    `Claim it by ${deadline} (${minutes} minutes from now) or it goes to the next person in line:`,
    payload.claimUrl,
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:420px;color:#1f1b16">
  <h2 style="margin:0 0 4px">A seat opened up</h2>
  <p style="margin:0 0 4px"><strong>${payload.eventTitle}</strong></p>
  <p style="margin:0 0 4px">${payload.venueName}</p>
  <p style="margin:0 0 12px">${when}</p>
  <p style="margin:0 0 12px">Seat: ${payload.rowLabel}${payload.seatNumber} (${payload.categoryName})</p>
  <p style="margin:0 0 12px">Claim by <strong>${deadline}</strong> (${minutes} minutes from now) or it passes to the next person in line.</p>
  <p style="margin:0 0 16px"><a href="${payload.claimUrl}" style="color:#e0a72e">Claim your seat</a></p>
</div>`.trim();

  return {
    logRef: payload.offerReference,
    to: payload.contactEmail,
    subject: `A seat opened up - ${payload.eventTitle}`,
    text,
    html,
  };
}

export function sendWaitlistOfferEmails(payloads: WaitlistOfferEmailPayload[]) {
  if (payloads.length === 0) return;
  after(async () => {
    const jobs = payloads.map(buildWaitlistOfferJob);
    await sendMailBatch(jobs);
  });
}

export async function renderQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, QR_RENDER_OPTIONS);
}
