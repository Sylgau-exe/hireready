// api/documents/list.js - List all user's saved documents
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  try {
    // Get all resumes
    const resumes = await sql`
      SELECT id, title, full_name, summary, target_country, is_generated,
             experience, education, skills, certifications, languages,
             email, phone, location, linkedin_url, version, created_at
      FROM resumes WHERE user_id = ${decoded.userId}
      ORDER BY created_at DESC
    `;

    // Get all ATS analyses with cover letters
    const analyses = await sql`
      SELECT id, job_title, company_name, job_description, ats_score,
             missing_keywords, missing_skills, recommendations,
             optimized_resume, cover_letter, created_at
      FROM ats_analyses WHERE user_id = ${decoded.userId}
      ORDER BY created_at DESC
    `;

    return res.json({
      resumes: resumes.rows.map(r => ({
        ...r,
        type: 'resume',
        experience: r.experience || [],
        education: r.education || [],
        skills: r.skills || [],
        certifications: r.certifications || [],
        languages: r.languages || []
      })),
      analyses: analyses.rows.map(a => ({
        ...a,
        type: 'analysis',
        missing_keywords: a.missing_keywords || [],
        missing_skills: a.missing_skills || [],
        recommendations: a.recommendations || [],
        optimized_resume: a.optimized_resume || null
      })),
      total: resumes.rows.length + analyses.rows.length
    });
  } catch (error) {
    console.error('Documents list error:', error);
    return res.status(500).json({ error: 'Failed to list documents' });
  }
}
