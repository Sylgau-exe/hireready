// lib/email.js - Email service for HireReady
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'HireReady <noreply@hireready.app>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured');
    throw new Error('Email service not configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject, html, text,
      reply_to: replyTo,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('Resend API error:', data);
    throw new Error(data.message || 'Failed to send email');
  }
  return data;
}

export async function sendPasswordResetEmail({ name, email, resetToken, resetUrl }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  const fullResetUrl = resetUrl || `https://hireready.app?reset_token=${resetToken}`;
  const html = `
    <!DOCTYPE html><html><head><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f3f4f6; }
      .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
      .card { background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; padding: 40px 30px; text-align: center; }
      .header h1 { margin: 0; font-size: 24px; }
      .content { padding: 40px 30px; }
      .cta { text-align: center; margin: 32px 0; }
      .cta a { display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; }
      .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0; font-size: 14px; }
      .footer { text-align: center; padding: 24px; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
    </style></head><body>
      <div class="container"><div class="card">
        <div class="header"><h1>🔑 Reset Your Password</h1></div>
        <div class="content">
          <p>Hi ${firstName},</p>
          <p>We received a request to reset your HireReady password. Click below to create a new one:</p>
          <div class="cta"><a href="${fullResetUrl}">Reset Password</a></div>
          <div class="warning">⚠️ This link expires in 1 hour. If you didn't request this, ignore this email.</div>
          <p style="word-break:break-all;color:#0ea5e9;font-size:13px;">${fullResetUrl}</p>
        </div>
        <div class="footer"><p>© 2026 HireReady</p></div>
      </div></div>
    </body></html>`;
  return sendEmail({ to: email, subject: 'Reset your HireReady password', html, text: `Reset: ${fullResetUrl}` });
}

export async function sendWelcomeEmail({ name, email }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  const html = `
    <!DOCTYPE html><html><head><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f3f4f6; }
      .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
      .card { background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; padding: 40px 30px; text-align: center; }
      .header h1 { margin: 0 0 8px 0; font-size: 28px; }
      .content { padding: 40px 30px; }
      .features { background: #f0f9ff; border-radius: 12px; padding: 24px; margin: 24px 0; }
      .cta { text-align: center; margin: 32px 0; }
      .cta a { display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; }
      .footer { text-align: center; padding: 24px; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
    </style></head><body>
      <div class="container"><div class="card">
        <div class="header">
          <h1>🎯 Welcome to HireReady!</h1>
          <p>Your complete job preparation platform</p>
        </div>
        <div class="content">
          <p>Hi ${firstName},</p>
          <p>You're now ready to land your dream job. Here's what you can do:</p>
          <div class="features">
            <p>📄 <strong>Build & Optimize Resumes</strong> — Tailored to every job posting</p>
            <p>🎯 <strong>ATS Score Analysis</strong> — Beat automated screening systems</p>
            <p>✉️ <strong>Cover Letter Generator</strong> — Custom letters in seconds</p>
            <p>🎤 <strong>Interview Simulator</strong> — Practice with AI feedback</p>
          </div>
          <div class="cta"><a href="https://hireready.app/dashboard">Go to Dashboard →</a></div>
          <p>Good luck out there!<br><strong>The HireReady Team</strong></p>
        </div>
        <div class="footer"><p>© 2026 HireReady</p></div>
      </div></div>
    </body></html>`;
  return sendEmail({
    to: email,
    subject: `Welcome to HireReady, ${firstName}! 🎯`,
    html,
    text: `Welcome to HireReady! Go to your dashboard: https://hireready.app/dashboard`,
    replyTo: ADMIN_EMAIL,
  });
}
