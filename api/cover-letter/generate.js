// api/cover-letter/generate.js - Generate a cover letter using Claude AI
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { resumeText, jobDescription, companyName, targetCountry, tone, language } = req.body;
  const langInstruction = language === 'fr' ? '\nIMPORTANT: Write the ENTIRE cover letter in FRENCH (Canadian French).' : '';
  if (!jobDescription) return res.status(400).json({ error: 'Job description is required' });

  try {
    const langTop = language === 'fr'
      ? 'LANGUAGE: Write the ENTIRE cover letter in FRENCH (Canadian French). The letter, highlights, and tips must ALL be in French.\n\n'
      : '';
    const prompt = `${langTop}You are an expert cover letter writer. Create a compelling, professional cover letter.

TARGET COUNTRY: ${targetCountry || 'Canada'}
COMPANY: ${companyName || 'the company'}
TONE: ${tone || 'Professional yet personable'}

${resumeText ? `CANDIDATE'S RESUME:\n${resumeText}` : ''}

JOB DESCRIPTION:
${jobDescription}

Write a cover letter that:
1. Starts with today's date on its own line
2. Then the recipient block: Hiring Manager (or specific name if known), Company name, city
3. Then "Subject: Application for [Job Title]" on its own line
4. Then "Dear Hiring Manager," (or appropriate salutation)
5. Body: Opens with a strong hook (not "I am writing to apply..."), connects experience to job requirements, includes 2-3 specific achievements, shows knowledge of the company
6. Closing: "Sincerely," followed by the candidate's full name, email, and phone on separate lines
7. Follows cover letter conventions for ${targetCountry || 'Canada'}
8. Is approximately 300-400 words for the body${langInstruction}

Return in this exact JSON format (no markdown, no backticks):
{
  "coverLetter": "Full formatted letter including date, recipient, subject, salutation, body paragraphs separated by \\n\\n, closing, and signature block",
  "highlights": ["Key selling point 1 used", "Key selling point 2 used"],
  "tips": ["Tip for the candidate about this letter"]
}`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiResponse.ok) {
      return res.status(502).json({ error: 'AI generation failed' });
    }

    const aiData = await aiResponse.json();
    const text = aiData.content[0].text;
    
    let result;
    try {
      result = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      return res.status(502).json({ error: 'Failed to parse AI response' });
    }

    // Save cover letter to DB
    try {
      await sql`
        INSERT INTO ats_analyses (user_id, job_title, company_name, job_description, cover_letter, ats_score)
        VALUES (${decoded.userId}, ${'Cover Letter'}, ${companyName || ''}, ${(jobDescription || '').substring(0, 5000)}, ${result.coverLetter}, 0)
      `;
    } catch(e) { console.error('Cover letter save error (non-fatal):', e); }

    try {
      await sql`INSERT INTO usage_log (user_id, action, details) VALUES (${decoded.userId}, 'cover_letter', ${JSON.stringify({ company: companyName })})`;
    } catch(e) {}

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Cover letter error:', error);
    return res.status(500).json({ error: 'Cover letter generation failed' });
  }
}
