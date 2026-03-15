// api/job/fetch.js - Extract job description from a URL
import { getUserFromRequest, cors } from '../../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(400).json({ error: 'Could not fetch the page. Try pasting the job description instead.' });
    }

    const html = await response.text();

    // Extract text content - remove scripts, styles, and HTML tags
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#[0-9]+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Try to find the job description section (common patterns)
    const jobPatterns = [
      /(?:job description|about the role|what you'll do|responsibilities|about this job|the opportunity)([\s\S]{200,5000}?)(?:requirements|qualifications|what we're looking for|about you|benefits|how to apply|about us)/i,
      /(?:description|overview)([\s\S]{200,5000}?)(?:requirements|qualifications)/i,
    ];

    let extracted = text;
    for (const pattern of jobPatterns) {
      const match = text.match(pattern);
      if (match) {
        extracted = match[0];
        break;
      }
    }

    // Truncate to reasonable length
    if (extracted.length > 8000) {
      extracted = extracted.substring(0, 8000);
    }

    // Get page title for job title hint
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

    return res.json({
      success: true,
      jobDescription: extracted,
      pageTitle,
      sourceUrl: url,
      note: 'Review the extracted text and edit if needed. Some job sites block automated extraction — if the text looks wrong, paste the description manually.'
    });
  } catch (error) {
    console.error('Job fetch error:', error);
    return res.status(400).json({
      error: 'Could not fetch this URL. The site may block automated access. Try pasting the job description directly instead.'
    });
  }
}
