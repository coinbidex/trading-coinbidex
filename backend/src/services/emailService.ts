import { logger } from '../utils/logger';

// Lazy-load nodemailer to avoid crash if not installed
let nodemailer: any = null;
async function getMailer() {
  if (!nodemailer) {
    try { nodemailer = await import('nodemailer'); } catch { return null; }
  }
  return nodemailer;
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const nm = require('nodemailer');
  return nm.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

const FROM = () => process.env.SMTP_FROM || `Coinbidex <noreply@coinbidex.com>`;

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const transport = getTransport();
    if (!transport) {
      logger.warn(`Email not sent to ${to}: SMTP not configured (${subject})`);
      // In dev: log the email content
      if (process.env.NODE_ENV === 'development') {
        logger.info(`[DEV EMAIL] To: ${to} | Subject: ${subject}`);
      }
      return false;
    }
    await transport.sendMail({ from: FROM(), to, subject, html });
    logger.info(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (err: any) {
    logger.error(`Email failed to ${to}: ${err.message}`);
    return false;
  }
}

export function emailVerification(username: string, token: string, baseUrl: string) {
  const url = `${baseUrl}/verify-email?token=${token}`;
  return {
    subject: 'Verify your Coinbidex account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#060d1a;color:#fff;border-radius:12px">
        <div style="margin-bottom:24px">
          <span style="font-size:22px;font-weight:800;color:#1a56ff;letter-spacing:-0.5px">COINBIDEX</span>
        </div>
        <h2 style="margin:0 0 12px;font-size:20px">Verify your email</h2>
        <p style="color:#94a3b8;margin:0 0 24px">Hi ${username}, click below to verify your email and activate your account.</p>
        <a href="${url}" style="display:inline-block;background:#1a56ff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a>
        <p style="color:#475569;font-size:12px;margin-top:24px">Link expires in 24 hours. If you didn't register, ignore this email.</p>
      </div>
    `
  };
}

export function emailPasswordReset(username: string, token: string, baseUrl: string) {
  const url = `${baseUrl}/reset-password?token=${token}`;
  return {
    subject: 'Reset your Coinbidex password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#060d1a;color:#fff;border-radius:12px">
        <div style="margin-bottom:24px">
          <span style="font-size:22px;font-weight:800;color:#1a56ff;letter-spacing:-0.5px">COINBIDEX</span>
        </div>
        <h2 style="margin:0 0 12px;font-size:20px">Reset your password</h2>
        <p style="color:#94a3b8;margin:0 0 24px">Hi ${username}, click below to reset your password.</p>
        <a href="${url}" style="display:inline-block;background:#1a56ff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a>
        <p style="color:#475569;font-size:12px;margin-top:24px">Link expires in 1 hour.</p>
      </div>
    `
  };
}

export function emailLoginAlert(username: string, ip: string, time: string) {
  return {
    subject: 'New login to your Coinbidex account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#060d1a;color:#fff;border-radius:12px">
        <div style="margin-bottom:24px">
          <span style="font-size:22px;font-weight:800;color:#1a56ff">COINBIDEX</span>
        </div>
        <h2 style="margin:0 0 12px;font-size:20px">New sign-in detected</h2>
        <p style="color:#94a3b8;margin:0 0 16px">Hi ${username}, we detected a new login to your account.</p>
        <div style="background:#1e293b;padding:16px;border-radius:8px;margin-bottom:16px">
          <p style="margin:0;color:#64748b;font-size:13px">IP address</p>
          <p style="margin:4px 0 0;font-family:monospace">${ip}</p>
          <p style="margin:12px 0 0;color:#64748b;font-size:13px">Time</p>
          <p style="margin:4px 0 0">${time}</p>
        </div>
        <p style="color:#475569;font-size:12px">If this wasn't you, change your password immediately.</p>
      </div>
    `
  };
}
