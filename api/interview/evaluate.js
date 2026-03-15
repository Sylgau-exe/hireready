// api/interview/evaluate.js - Evaluate user's interview answer
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { sessionId, questionNumber, question, questionType, userAnswer, jobTitle, voiceMetrics, language } = req.body;
  const langInstruction = language === 'fr' ? '
IMPORTANT: Write ALL feedback, suggestions and tips in FRENCH.' : '';
  if (!question || !userAnswer) return res.status(400).json({ error: 'Question and answer are required' });

  // voiceMetrics: { durationSec, wordCount, wordsPerMinute, fillerWords, fillerCount, wasSpoken }

  try {
    const voiceSection = voiceMetrics?.wasSpoken ? `

VOICE DELIVERY METRICS (the candidate answered verbally):
- Speaking duration: ${voiceMetrics.durationSec} seconds
- Word count: ${voiceMetrics.wordCount}
- Speaking pace: ${voiceMetrics.wordsPerMinute} words per minute (ideal is 130-160 WPM)
- Filler words detected: ${voiceMetrics.fillerCount} (${voiceMetrics.fillerWords || 'none'})

Also evaluate their verbal delivery:
- Pace: Was it too fast, too slow, or well-paced?
- Conciseness: Did they ramble or stay focused?
- Filler words: Too many "um", "like", "you know"?
- Length: Was the answer an appropriate length for an interview?` : '';

    const prompt = `You are an experienced interviewer and career coach. Evaluate this interview answer.

JOB TITLE: ${jobTitle || 'the position'}
QUESTION TYPE: ${questionType || 'general'}
QUESTION: ${question}
CANDIDATE'S ANSWER: ${userAnswer}${voiceSection}

Evaluate the answer and return in this exact JSON format (no markdown, no backticks):
{
  "score": <number 1-10>,
  "strengths": ["What was good about the answer"],
  "improvements": ["What could be improved"],
  "feedback": "Detailed constructive feedback (2-3 sentences)",
  "suggestedAnswer": "A stronger version of the answer that maintains the candidate's experience but improves structure and impact (3-5 sentences)",
  "tip": "One specific actionable tip"${voiceMetrics?.wasSpoken ? `,
  "deliveryFeedback": "Feedback on their verbal delivery — pace, filler words, confidence, conciseness (2-3 sentences)",
  "deliveryScore": <number 1-10>` : ''}
}

${langInstruction}

Be encouraging but honest. If using STAR method questions, check for Situation, Task, Action, Result structure.`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiResponse.ok) {
      return res.status(502).json({ error: 'AI evaluation failed' });
    }

    const aiData = await aiResponse.json();
    const text = aiData.content[0].text;
    
    let evaluation;
    try {
      evaluation = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      return res.status(502).json({ error: 'Failed to parse AI response' });
    }

    // Save answer + feedback to DB
    if (sessionId && questionNumber) {
      try {
        await sql`
          UPDATE interview_qa SET
            user_answer = ${userAnswer},
            ai_feedback = ${evaluation.feedback},
            score = ${evaluation.score},
            suggested_answer = ${evaluation.suggestedAnswer}
          WHERE session_id = ${sessionId} AND question_number = ${questionNumber}
        `;
      } catch (dbErr) {
        console.error('DB save error (non-fatal):', dbErr);
      }
    }

    return res.json({ success: true, evaluation });
  } catch (error) {
    console.error('Evaluate error:', error);
    return res.status(500).json({ error: 'Evaluation failed' });
  }
}
