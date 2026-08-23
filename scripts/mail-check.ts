import nodemailer from "nodemailer";

async function main() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.log("SKIPPED: GMAIL_USER or GMAIL_APP_PASSWORD is not set. This script sends a real email via SMTP, so it's opt-in and does not fail the suite when credentials aren't configured.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  console.log(`Verifying SMTP connection for ${user}...`);
  await transporter.verify();
  console.log("Verify succeeded.");

  console.log(`Sending test email to ${user}...`);
  const info = await transporter.sendMail({
    from: user,
    to: user,
    subject: "Ticket Booking mail-check",
    text: `This is a test email from scripts/mail-check.ts, sent at ${new Date().toISOString()}.`,
  });
  console.log("Send succeeded. messageId:", info.messageId, "response:", info.response);
}

main().catch((err) => {
  console.error("mail-check failed:");
  console.error(err);
  process.exit(1);
});
