// api/documents/translate.js - Translate resume or cover letter to another language
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { content, contentType, targetLang } = req.body;
  // contentType: 'resume_json' or 'cover_letter'
  // targetLang: 'en' or 'fr'

  if (!content || !targetLang) {
    return res.status(400).json({ error: 'Content and target language are required' });
  }

  const langName = targetLang === 'fr' ? 'French (Canadian French)' : 'English';

  try {
    let prompt;

    if (contentType === 'resume_json') {
      prompt = `You are an expert bilingual translator specializing in professional resumes.

Translate the following resume JSON into ${langName}. Translate ALL text fields: summary, job titles, bullet points, degree names, skill descriptions. Keep proper nouns (company names, school names, city names) unchanged. Keep the JSON structure exactly the same.

RESUME JSON:
${typeof content === 'string' ? content : JSON.stringify(content, null, 2)}

Return the translated resume in the EXACT same JSON format (no markdown, no backticks, just pure JSON). Every text field must be in ${langName}.`;
    } else {
      // Cover letter
      prompt = `You are an expert bilingual translator specializing in professional correspondence.

Translate the following cover letter into ${langName}. Maintain the professional tone, formatting, and paragraph structure. Keep proper nouns (company names, people names) unchanged.

COVER LETTER:
${content}

Return ONLY the translated cover letter text. No explanation, no markdown, just the translated letter.`;
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
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiResponse.ok) {
      return res.status(502).json({ error: 'Translation failed' });
    }

    const aiData = await aiResponse.json();
    const text = aiData.content[0].text;

    if (contentType === 'resume_json') {
      try {
        const translated = JSON.parse(text.replace(/```json|```/g, '').trim());
        return res.json({ success: true, translated, contentType });
      } catch (e) {
        return res.status(502).json({ error: 'Failed to parse translated resume' });
      }
    } else {
      return res.json({ success: true, translated: text.trim(), contentType });
    }
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({ error: 'Translation failed' });
  }
}
