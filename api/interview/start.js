// api/interview/start.js - Generate interview questions based on job description
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { jobDescription, jobTitle, questionCount, targetCountry, language } = req.body;
  const langInstruction = language === 'fr' ? '\nIMPORTANT: Generate ALL questions, hints, sample answers and tips in FRENCH.' : '';
  if (!jobDescription) return res.status(400).json({ error: 'Job description is required' });

  const count = Math.min(questionCount || 8, 15);

  try {
    const prompt = `You are an expert interviewer and career coach. Generate ${count} interview questions for this position.

JOB TITLE: ${jobTitle || 'the position'}
COUNTRY: ${targetCountry || 'Canada'}

JOB DESCRIPTION:
${jobDescription}

Generate a realistic mix of questions including:
- 2-3 behavioral questions (STAR method)
- 2-3 situational/scenario questions  
- 1-2 technical/skill-based questions
- 1-2 general/motivation questions
- 1 culture fit question

Return in this exact JSON format (no markdown, no backticks):
{
  "questions": [
    {
      "number": 1,
      "type": "behavioral|situational|technical|general|culture",
      "question": "The interview question",
      "hint": "Brief hint about what the interviewer is looking for",
      "sampleAnswer": "A strong example answer (2-3 sentences)"
    }
  ],
  ${langInstruction}

"tips": ["General interview tip for ${targetCountry || 'Canada'} job market"]
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
        max_tokens: 3000,
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

    // Save interview session
    let sessionId = null;
    try {
      const session = await sql`
        INSERT INTO interview_sessions (user_id, job_title, job_description, question_count, status)
        VALUES (${decoded.userId}, ${jobTitle || 'Unknown'}, ${jobDescription.substring(0, 5000)}, ${result.questions.length}, 'active')
        RETURNING id
      `;
      sessionId = session.rows[0]?.id;

      // Save questions
      for (const q of result.questions) {
        await sql`
          INSERT INTO interview_qa (session_id, question_number, question_type, question, suggested_answer)
          VALUES (${sessionId}, ${q.number}, ${q.type}, ${q.question}, ${q.sampleAnswer})
        `;
      }
    } catch (dbErr) {
      console.error('DB save error (non-fatal):', dbErr);
    }

    try {
      await sql`INSERT INTO usage_log (user_id, action, details) VALUES (${decoded.userId}, 'interview_start', ${JSON.stringify({ jobTitle, questionCount: count })})`;
    } catch(e) {}

    return res.json({ success: true, sessionId, ...result });
  } catch (error) {
    console.error('Interview start error:', error);
    return res.status(500).json({ error: 'Failed to generate questions' });
  }
}
