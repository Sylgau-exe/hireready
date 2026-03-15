// api/documents/save-cover-letter.js - Save cover letter to an analysis
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { coverLetter, jobTitle, companyName, jobDescription } = req.body;
  if (!coverLetter) return res.status(400).json({ error: 'Cover letter text required' });

  try {
    // Save as a new analysis entry with just the cover letter
    const result = await sql`
      INSERT INTO ats_analyses (user_id, job_title, company_name, job_description, cover_letter, ats_score)
      VALUES (${decoded.userId}, ${jobTitle || ''}, ${companyName || ''}, ${(jobDescription || '').substring(0, 5000)}, ${coverLetter}, 0)
      RETURNING id
    `;
    return res.json({ success: true, id: result.rows[0]?.id });
  } catch (error) {
    console.error('Save cover letter error:', error);
    return res.status(500).json({ error: 'Failed to save' });
  }
}
