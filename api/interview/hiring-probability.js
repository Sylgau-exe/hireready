// api/interview/hiring-probability.js — Premium: estimate hiring likelihood
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  // Only Premium users
  let userPlan = 'none';
  try {
    const result = await sql`SELECT plan FROM users WHERE id = ${decoded.userId}`;
    if (result.rows.length) userPlan = result.rows[0].plan || 'none';
  } catch (e) {}

  if (userPlan !== 'premium') {
    return res.status(403).json({ error: 'Premium feature', upgrade: true });
  }

  const { jobTitle, jobDescription, scores, questionCount, avgScore, language } = req.body;
  if (!scores || !scores.length) return res.status(400).json({ error: 'No interview scores provided' });

  const langInstruction = language === 'fr'
    ? '\nIMPORTANT: Write ALL text in FRENCH (Canadian French). Keys stay in English.'
    : '';

  try {
    const prompt = `You are an expert hiring consultant. Based on this mock interview performance, estimate the candidate's probability of getting hired.

JOB TITLE: ${jobTitle || 'Unknown'}
JOB DESCRIPTION (summary): ${(jobDescription || '').substring(0, 1500)}

INTERVIEW PERFORMANCE:
- Questions answered: ${scores.length} out of ${questionCount}
- Individual scores (out of 10): ${scores.join(', ')}
- Average score: ${avgScore}/10

Analyze their performance and return in this exact JSON format (no markdown, no backticks):
{
  "probability": <number 0-100>,
  "verdict": "Strong candidate / Competitive / Needs improvement / Unlikely",
  "summary": "2-3 sentence assessment of their interview readiness",
  "strengths": ["What they demonstrated well"],
  "risks": ["What could cost them the job"],
  "nextSteps": ["1 specific action to increase their chances"]
}
${langInstruction}

Be realistic and calibrated:
- 80-100%: Exceptional performance, very likely to advance
- 60-79%: Competitive, good chance with some polish
- 40-59%: Average, needs significant improvement
- Below 40%: Unlikely without major preparation`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiResponse.ok) return res.status(502).json({ error: 'AI analysis failed' });

    const aiData = await aiResponse.json();
    const raw = aiData.content?.[0]?.text?.trim();
    if (!raw) return res.status(502).json({ error: 'Empty AI response' });

    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'AI returned invalid format' });
    }

    // Log usage
    try {
      await sql`INSERT INTO usage_log (user_id, action, details) VALUES (${decoded.userId}, 'hiring_probability', ${JSON.stringify({ jobTitle, probability: result.probability })})`;
    } catch (e) {}

    return res.json({ success: true, result });
  } catch (error) {
    console.error('Hiring probability error:', error);
    return res.status(500).json({ error: 'Analysis failed' });
  }
}
