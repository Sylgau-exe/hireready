// api/documents/translate.js - Fast translation for PDF export
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Auth required' });

  const { text, targetLang } = req.body;
  if (!text || !targetLang) return res.status(400).json({ error: 'Missing params' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'No API key' });

  const lang = targetLang === 'fr' ? 'Canadian French' : 'English';
  // Aggressive truncation for speed
  const input = text.substring(0, 3500);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [{ role: 'user', content: `Translate to ${lang}. Keep names/companies/cities unchanged. Output ONLY translated text:\n\n${input}` }]
      })
    });

    if (!r.ok) {
      console.error('Translate API status:', r.status);
      return res.status(502).json({ error: 'API error' });
    }

    const d = await r.json();
    const out = d.content?.[0]?.text?.trim();
    if (!out) return res.status(502).json({ error: 'Empty' });

    return res.json({ success: true, translated: out });
  } catch (e) {
    console.error('Translate err:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
