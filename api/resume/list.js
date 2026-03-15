// api/resume/list.js - List user's resumes
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  try {
    const result = await sql`
      SELECT id, title, full_name, target_country, is_generated, version, created_at, updated_at
      FROM resumes WHERE user_id = ${decoded.userId}
      ORDER BY updated_at DESC
    `;
    return res.json({ resumes: result.rows });
  } catch (error) {
    console.error('List resumes error:', error);
    return res.status(500).json({ error: 'Failed to list resumes' });
  }
}
