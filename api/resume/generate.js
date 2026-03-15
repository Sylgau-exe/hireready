// api/resume/generate.js - Generate or optimize a resume using Claude AI
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { mode, jobDescription, targetCountry, personalInfo, existingResume } = req.body;
  // mode: 'generic' (free, no JD), 'create' (from scratch with JD), or 'optimize' (existing resume with JD)

  if (mode !== 'generic' && !jobDescription) return res.status(400).json({ error: 'Job description is required' });

  try {
    let prompt;

    if (mode === 'generic') {
      // FREE TIER: Generic resume, no job description needed
      prompt = `You are an expert resume writer. Create a polished, professional resume from the information provided.

TARGET COUNTRY: ${targetCountry || 'Canada'}

PERSONAL INFORMATION:
${JSON.stringify(personalInfo, null, 2)}

Return the resume in this exact JSON format (no markdown, no backticks):
{
  "fullName": "${personalInfo?.name || ''}",
  "email": "${personalInfo?.email || ''}",
  "phone": "${personalInfo?.phone || ''}",
  "location": "${personalInfo?.location || ''}",
  "linkedinUrl": "${personalInfo?.linkedin || ''}",
  "summary": "Strong professional summary (3-4 sentences)",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, Country",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "bullets": ["Achievement-focused bullet with metrics", "bullet 2", "bullet 3"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "school": "School Name",
      "year": "YYYY",
      "details": ""
    }
  ],
  "skills": ["skill1", "skill2"],
  "certifications": [],
  "languages": [],
  "tips": ["Tip to improve this resume further"]
}

Follow resume standards for ${targetCountry || 'Canada'}. Use the person's real experience and present it in the best possible way. Use strong action verbs and quantify achievements where possible.`;
    } else if (mode === 'optimize' && existingResume) {
      prompt = `You are an expert resume writer and ATS optimization specialist.

TASK: Optimize the following resume to match the job description. Keep the person's real experience but reword, restructure, and add relevant keywords to maximize ATS compatibility.

TARGET COUNTRY: ${targetCountry || 'Canada'}

EXISTING RESUME:
${existingResume}

JOB DESCRIPTION:
${jobDescription}

Return the optimized resume in this exact JSON format (no markdown, no backticks):
{
  "fullName": "...",
  "email": "...",
  "phone": "...",
  "location": "...",
  "linkedinUrl": "...",
  "summary": "Professional summary optimized for this role (3-4 sentences)",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, Country",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "bullets": ["Achievement-focused bullet 1", "bullet 2", "bullet 3"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "school": "School Name",
      "year": "YYYY",
      "details": "Optional honors/GPA"
    }
  ],
  "skills": ["skill1", "skill2"],
  "certifications": ["cert1"],
  "languages": ["English (Native)", "French (Fluent)"],
  "improvements": ["What was changed and why - bullet 1", "bullet 2"]
}

Follow resume standards for ${targetCountry || 'Canada'}. Use strong action verbs. Quantify achievements where possible.`;
    } else {
      // Create from scratch
      prompt = `You are an expert resume writer specializing in ATS-optimized resumes.

TASK: Create a professional resume from the information provided, tailored to the job description.

TARGET COUNTRY: ${targetCountry || 'Canada'}

PERSONAL INFORMATION:
${JSON.stringify(personalInfo, null, 2)}

JOB DESCRIPTION:
${jobDescription}

Return the resume in this exact JSON format (no markdown, no backticks):
{
  "fullName": "${personalInfo?.name || ''}",
  "email": "${personalInfo?.email || ''}",
  "phone": "${personalInfo?.phone || ''}",
  "location": "${personalInfo?.location || ''}",
  "linkedinUrl": "${personalInfo?.linkedin || ''}",
  "summary": "Professional summary tailored to this role (3-4 sentences)",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, Country",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "bullets": ["Achievement-focused bullet with metrics", "bullet 2", "bullet 3"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "school": "School Name",
      "year": "YYYY",
      "details": ""
    }
  ],
  "skills": ["skill1", "skill2"],
  "certifications": [],
  "languages": [],
  "tips": ["Helpful tip about this resume"]
}

Follow resume standards for ${targetCountry || 'Canada'}. Use the person's real experience but present it optimally. Add relevant keywords from the job description naturally.`;
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI generation failed' });
    }

    const aiData = await aiResponse.json();
    const text = aiData.content[0].text;
    
    let resume;
    try {
      resume = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      return res.status(502).json({ error: 'Failed to parse AI response' });
    }

    // Save to DB
    try {
      const result = await sql`
        INSERT INTO resumes (user_id, title, full_name, email, phone, location, linkedin_url,
          summary, experience, education, skills, certifications, languages, target_country, is_generated)
        VALUES (${decoded.userId}, ${mode === 'optimize' ? 'Optimized Resume' : 'Generated Resume'},
          ${resume.fullName}, ${resume.email}, ${resume.phone}, ${resume.location}, ${resume.linkedinUrl || ''},
          ${resume.summary}, ${JSON.stringify(resume.experience)}, ${JSON.stringify(resume.education)},
          ${JSON.stringify(resume.skills)}, ${JSON.stringify(resume.certifications || [])},
          ${JSON.stringify(resume.languages || [])}, ${targetCountry || 'CA'}, true)
        RETURNING id
      `;
      resume.id = result.rows[0]?.id;
    } catch (dbErr) {
      console.error('DB save error (non-fatal):', dbErr);
    }

    try {
      await sql`INSERT INTO usage_log (user_id, action, details) VALUES (${decoded.userId}, 'resume_${mode}', '{}')`;
    } catch(e) {}

    return res.json({ success: true, resume });
  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Resume generation failed' });
  }
}
