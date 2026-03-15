// api/resume/analyze.js - Analyze resume against job description using Claude AI
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { resumeText, jobDescription, targetCountry } = req.body;
  if (!resumeText || !jobDescription) {
    return res.status(400).json({ error: 'Resume text and job description are required' });
  }

  try {
    const prompt = `You are an expert ATS (Applicant Tracking System) analyst and career coach. Analyze the following resume against the job description.

TARGET COUNTRY: ${targetCountry || 'Canada'}

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

Provide your analysis in this exact JSON format (no markdown, no backticks, just pure JSON):
{
  "atsScore": <number 0-100>,
  "summary": "<brief overall assessment in 2-3 sentences>",
  "missingKeywords": ["keyword1", "keyword2"],
  "missingSkills": ["skill1", "skill2"],
  "strongPoints": ["point1", "point2"],
  "recommendations": [
    {"category": "Keywords", "suggestion": "..."},
    {"category": "Experience", "suggestion": "..."},
    {"category": "Format", "suggestion": "..."},
    {"category": "Skills", "suggestion": "..."}
  ],
  "countryTips": ["tip about resume standards in ${targetCountry || 'Canada'}"]
}

Be specific and actionable. Score based on: keyword match (40%), skills alignment (25%), experience relevance (20%), formatting/structure (15%).`;

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
      const err = await aiResponse.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI analysis failed' });
    }

    const aiData = await aiResponse.json();
    const text = aiData.content[0].text;
    
    let analysis;
    try {
      analysis = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, text);
      return res.status(502).json({ error: 'Failed to parse AI response' });
    }

    // Save to DB
    try {
      await sql`
        INSERT INTO ats_analyses (user_id, job_description, ats_score, missing_keywords, missing_skills, recommendations)
        VALUES (${decoded.userId}, ${jobDescription.substring(0, 5000)}, ${analysis.atsScore}, 
                ${JSON.stringify(analysis.missingKeywords)}, ${JSON.stringify(analysis.missingSkills)},
                ${JSON.stringify(analysis.recommendations)})
      `;
    } catch (dbErr) {
      console.error('DB save error (non-fatal):', dbErr);
    }

    // Log usage
    try {
      await sql`INSERT INTO usage_log (user_id, action, details) VALUES (${decoded.userId}, 'ats_analysis', ${JSON.stringify({ score: analysis.atsScore })})`;
    } catch(e) {}

    return res.json({ success: true, analysis });
  } catch (error) {
    console.error('Analyze error:', error);
    return res.status(500).json({ error: 'Analysis failed' });
  }
}
