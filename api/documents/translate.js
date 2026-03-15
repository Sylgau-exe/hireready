// api/documents/translate.js - Translate resume or cover letter text
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { text, targetLang, docType } = req.body;

  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Text and target language required' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const langName = targetLang === 'fr' ? 'French (Canadian French)' : 'English';
  const truncated = text.substring(0, 6000);

  try {
    const prompt = docType === 'resume'
      ? `Translate this resume into ${langName}. Keep the exact same structure and formatting. Keep proper nouns (company names, school names, cities) unchanged. Translate job titles, bullet points, summary, skills, and section headers.\n\nRESUME:\n${truncated}\n\nReturn ONLY the translated resume text, preserving all line breaks and formatting. No explanation.`
      : `Translate this cover letter into ${langName}. Maintain the professional tone and paragraph structure. Keep proper nouns unchanged.\n\nCOVER LETTER:\n${truncated}\n\nReturn ONLY the translated text. No explanation.`;

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
      const errText = await aiResponse.text();
      console.error('Anthropic translate error:', errText);
      return res.status(502).json({ error: 'Translation API failed' });
    }

    const aiData = await aiResponse.json();
    const translated = aiData.content[0]?.text?.trim();

    if (!translated) {
      return res.status(502).json({ error: 'Empty translation' });
    }

    return res.json({ success: true, translated });
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({ error: 'Translation failed' });
  }
}
