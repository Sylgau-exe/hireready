// api/admin/stats.js - Admin dashboard statistics
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
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    let resumeCount = { rows: [{ count: 0 }] };
    let analysisCount = { rows: [{ count: 0 }] };
    let interviewCount = { rows: [{ count: 0 }] };
    let avgAts = { rows: [{ avg: 0 }] };
    let newUsers7d = { rows: [{ count: 0 }] };
    let planDist = { rows: [] };

    try { resumeCount = await sql`SELECT COUNT(*) as count FROM resumes`; } catch(e) {}
    try { analysisCount = await sql`SELECT COUNT(*) as count FROM ats_analyses`; } catch(e) {}
    try { interviewCount = await sql`SELECT COUNT(*) as count FROM interview_sessions`; } catch(e) {}
    try { avgAts = await sql`SELECT ROUND(AVG(ats_score)::numeric, 1) as avg FROM ats_analyses`; } catch(e) {}
    try { newUsers7d = await sql`SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '7 days'`; } catch(e) {}
    try { planDist = await sql`SELECT plan, COUNT(*) as count FROM users GROUP BY plan ORDER BY count DESC`; } catch(e) {}

    return res.status(200).json({
      overview: {
        totalUsers: parseInt(userCount.rows[0].count) || 0,
        totalResumes: parseInt(resumeCount.rows[0].count) || 0,
        totalAnalyses: parseInt(analysisCount.rows[0].count) || 0,
        totalInterviews: parseInt(interviewCount.rows[0].count) || 0,
        avgAtsScore: parseFloat(avgAts.rows[0]?.avg) || 0
      },
      last7Days: { newUsers: parseInt(newUsers7d.rows[0].count) || 0 },
      planDistribution: planDist.rows
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
