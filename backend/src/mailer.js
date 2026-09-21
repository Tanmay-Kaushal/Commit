// Sends email via Brevo's HTTP API (Railway blocks SMTP below Pro plan).
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function mailerConfigured() {
  return !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
}

async function sendEmail({ to, subject, html }) {
  if (!mailerConfigured()) {
    throw new Error('Email is not configured on this server (missing BREVO_API_KEY or MAIL_FROM)');
  }

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: 'Commit' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

function verificationEmailHtml(code) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1c1917;">Verify your email</h2>
      <p style="color: #57534e;">Enter this code to finish setting up your Commit account. It expires in 10 minutes.</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1c1917; margin: 24px 0;">${code}</p>
      <p style="color: #a8a29e; font-size: 13px;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;
}

async function sendVerificationEmail(to, code) {
  await sendEmail({ to, subject: `${code} is your Commit verification code`, html: verificationEmailHtml(code) });
}

function inviteEmailHtml(inviterName, inviteUrl) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1c1917;">${inviterName} has invited you on Commit</h2>
      <p style="color: #57534e;">Commit is a habit-accountability app — you and a partner each commit to a habit with a stake attached.</p>
      <p style="margin: 24px 0;">
        <a href="${inviteUrl}" style="background: #1c1917; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Join Commit
        </a>
      </p>
      <p style="color: #a8a29e; font-size: 13px;">${inviteUrl}</p>
    </div>
  `;
}

async function sendInviteEmail(to, inviterName, inviteUrl) {
  await sendEmail({
    to,
    subject: `${inviterName} has invited you on Commit`,
    html: inviteEmailHtml(inviterName, inviteUrl),
  });
}

module.exports = { mailerConfigured, sendEmail, sendVerificationEmail, sendInviteEmail };
