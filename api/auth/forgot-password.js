// api/auth/forgot-password.js (from BizSimHub)
import { UserDB } from '../../lib/db.js';
import { sendPasswordResetEmail } from '../../lib/email.js';
import { cors } from '../../lib/auth.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await UserDB.findByEmail(email.toLowerCase());

    if (user) {
      if (user.auth_provider === 'google' && !user.password_hash) {
        console.log(`Password reset requested for Google user: ${email}`);
      } else {
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        await UserDB.setResetToken(email.toLowerCase(), resetToken, expiresAt);

        const frontendUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : process.env.FRONTEND_URL || 'http://localhost:3000';
        const resetUrl = `${frontendUrl}?reset_token=${resetToken}`;

        try {
          await sendPasswordResetEmail({ name: user.name, email: user.email, resetToken, resetUrl });
          console.log(`Password reset email sent to: ${email}`);
        } catch (emailError) {
          console.error('Failed to send reset email:', emailError);
        }
      }
    } else {
      console.log(`Password reset requested for non-existent email: ${email}`);
    }

    res.json({ 
      success: true, 
      message: 'If an account with this email exists, you will receive a password reset link shortly.' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
}
