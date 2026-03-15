// api/admin/users.js - List all users with HireReady activity
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${decoded.userId}`;
  if (!adminCheck.rows[0]?.is_admin) return res.status(403).json({ error: 'Admin access required' });

  try {
    const result = await sql`
      SELECT 
        u.id, u.name, u.email, u.plan, u.plan_expires, u.target_country,
        u.auth_provider, u.is_admin, u.created_at,
        COALESCE(r.resume_count, 0) as resumes,
        COALESCE(a.analysis_count, 0) as analyses,
        COALESCE(i.interview_count, 0) as interviews
      FROM users u
      LEFT JOIN (SELECT user_id, COUNT(*) as resume_count FROM resumes GROUP BY user_id) r ON u.id = r.user_id
      LEFT JOIN (SELECT user_id, COUNT(*) as analysis_count FROM ats_analyses GROUP BY user_id) a ON u.id = a.user_id
      LEFT JOIN (SELECT user_id, COUNT(*) as interview_count FROM interview_sessions GROUP BY user_id) i ON u.id = i.user_id
      ORDER BY u.created_at DESC
    `;

    const users = result.rows.map(r => ({
      id: r.id, name: r.name, email: r.email,
      plan: r.plan || 'none',
      targetCountry: r.target_country || 'CA',
      authProvider: r.auth_provider || 'email',
      isAdmin: r.is_admin || false,
      resumes: parseInt(r.resumes),
      analyses: parseInt(r.analyses),
      interviews: parseInt(r.interviews),
      joined: new Date(r.created_at).toLocaleDateString()
    }));

    return res.json({ users, total: users.length });
  } catch (error) {
    console.error('Admin users error:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
}
