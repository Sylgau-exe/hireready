// api/auth/me.js - Get current user with HireReady stats
import { sql } from '@vercel/postgres';
import { requireAuth, cors } from '../../lib/auth.js';
import { UserDB } from '../../lib/db.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  try {
    const user = await UserDB.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let resumeCount = { rows: [{ count: 0 }] };
    let analysisCount = { rows: [{ count: 0 }] };
    let interviewCount = { rows: [{ count: 0 }] };
    try { resumeCount = await sql`SELECT COUNT(*) as count FROM resumes WHERE user_id = ${user.id}`; } catch(e) {}
    try { analysisCount = await sql`SELECT COUNT(*) as count FROM ats_analyses WHERE user_id = ${user.id}`; } catch(e) {}
    try { interviewCount = await sql`SELECT COUNT(*) as count FROM interview_sessions WHERE user_id = ${user.id}`; } catch(e) {}

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.is_admin,
        plan: user.plan || 'none',
        planExpires: user.plan_expires,
        targetCountry: user.target_country || 'CA',
        authProvider: user.auth_provider,
        createdAt: user.created_at,
        stats: {
          resumes: parseInt(resumeCount.rows[0].count),
          analyses: parseInt(analysisCount.rows[0].count),
          interviews: parseInt(interviewCount.rows[0].count)
        }
      }
    });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ error: 'Failed to fetch user data' });
  }
}
