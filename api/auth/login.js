// api/auth/login.js (adapted to use db.js like BizSimHub)
import { UserDB } from '../../lib/db.js';
import { generateToken, cors } from '../../lib/auth.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const user = await UserDB.findByEmail(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    if (user.auth_provider === 'google' && !user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google Sign-In. Please use the Google button.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = generateToken(user);
    return res.status(200).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
