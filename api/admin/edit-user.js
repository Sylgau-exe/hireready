// api/admin/edit-user.js - Edit user details
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${decoded.userId}`;
  if (!adminCheck.rows[0]?.is_admin) return res.status(403).json({ error: 'Admin access required' });

  const { userId, name, email, organization, jobTitle, isAdmin } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  // Prevent removing own admin
  if (userId === decoded.userId && isAdmin === false) {
    return res.status(400).json({ error: 'Cannot remove your own admin status' });
  }

  try {
    const result = await sql`
      UPDATE users SET
        name = COALESCE(${name || null}, name),
        email = COALESCE(${email || null}, email),
        organization = COALESCE(${organization || null}, organization),
        job_title = COALESCE(${jobTitle || null}, job_title),
        is_admin = COALESCE(${isAdmin}, is_admin),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
      RETURNING id, name, email, is_admin
    `;
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Edit user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
}
