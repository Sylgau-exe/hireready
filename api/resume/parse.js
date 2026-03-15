// api/resume/parse.js - Parse raw resume text into structured fields using AI
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { rawText } = req.body;
  if (!rawText || rawText.length < 50) {
    return res.status(400).json({ error: 'Resume text is too short to parse' });
  }

  try {
    const prompt = `You are an expert resume parser. Extract structured information from this raw resume text. The text may be messy (extracted from a PDF or Word doc) — do your best to identify each section.

RAW RESUME TEXT:
${rawText.substring(0, 8000)}

Extract and return in this exact JSON format (no markdown, no backticks, just pure JSON):
{
  "fullName": "The person's full name",
  "email": "Their email address or empty string",
  "phone": "Their phone number or empty string",
  "location": "Their city/location or empty string",
  "linkedin": "Their LinkedIn URL or empty string",
  "summary": "Their professional summary/objective if present, or empty string",
  "experience": "CRITICAL: Separate each role clearly with TWO blank lines between jobs. Format each role as:\\nJob Title, Company Name, City/Country, StartDate – EndDate\\n- Achievement or responsibility 1\\n- Achievement or responsibility 2\\n- Achievement or responsibility 3\\n\\n(then next role). Preserve all original content but restructure into this clean format.",
  "education": "Each degree on its own line: Degree, School, Date",
  "skills": "Comma-separated list of all skills found",
  "certifications": "Any certifications found, comma-separated",
  "languages": "Any languages found with proficiency levels, comma-separated"
}

IMPORTANT for the experience field: Each job MUST be clearly separated. Never merge multiple roles into one paragraph. Use newlines (\\n) to separate lines within a role and double newlines (\\n\\n) between different roles. Be thorough — extract everything you can find. If a field is not present in the resume, use an empty string.`;

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
      return res.status(502).json({ error: 'AI parsing failed' });
    }

    const aiData = await aiResponse.json();
    const text = aiData.content[0].text;

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      return res.status(502).json({ error: 'Failed to parse AI response' });
    }

    return res.json({ success: true, parsed });
  } catch (error) {
    console.error('Parse error:', error);
    return res.status(500).json({ error: 'Resume parsing failed' });
  }
}
