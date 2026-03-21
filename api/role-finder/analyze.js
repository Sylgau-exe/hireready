// api/role-finder/analyze.js — AI Role Finder with tier-gated depth
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { background, language } = req.body;
  if (!background || background.trim().length < 30) {
    return res.status(400).json({ error: 'Please provide at least a few sentences about your background.' });
  }

  // Fetch user plan from DB
  let userPlan = 'none';
  try {
    const result = await sql`SELECT plan FROM users WHERE id = ${decoded.userId}`;
    if (result.rows.length) userPlan = result.rows[0].plan || 'none';
  } catch (e) {
    console.error('Failed to fetch user plan:', e);
  }

  const tier = (userPlan === 'premium' || userPlan === 'pro') ? userPlan : 'free';
  const lang = language === 'fr' ? 'fr' : 'en';

  // Build tier-specific prompt
  const langInstruction = lang === 'fr'
    ? '\n\nIMPORTANT: Generate ALL output text in FRENCH (Canadian French). Keys stay in English, only values in French.'
    : '';

  let tierInstruction;
  if (tier === 'free') {
    tierInstruction = `TIER: FREE
Return exactly 1 matching role with a match percentage (0-100).
Do NOT provide explanations, missing skills, or career advice.
Also return 3 additional role NAMES only (no details) as "locked_roles" to tease the upgrade.

JSON format:
{
  "roles": [
    { "title": "...", "match_pct": 85 }
  ],
  "locked_roles": ["Role Name 2", "Role Name 3", "Role Name 4"],
  "tier": "free"
}`;
  } else if (tier === 'pro') {
    tierInstruction = `TIER: PRO
Return 3-5 matching roles, each with:
- title: the job title
- match_pct: match percentage (0-100)
- explanation: 2-3 sentences explaining WHY this role fits (reference specific skills and experience)
- matching_skills: array of 3-5 skills from their background that match this role
- missing_skills: array of 1-3 skills or gaps that would strengthen the match

JSON format:
{
  "roles": [
    {
      "title": "...",
      "match_pct": 85,
      "explanation": "...",
      "matching_skills": ["...", "..."],
      "missing_skills": ["...", "..."]
    }
  ],
  "summary": "A 2-sentence summary of the person's overall career profile.",
  "tier": "pro"
}`;
  } else {
    tierInstruction = `TIER: PREMIUM
Return 3-5 matching roles, each with:
- title: the job title
- match_pct: match percentage (0-100)
- explanation: 2-3 sentences explaining WHY this role fits (reference specific skills and experience)
- matching_skills: array of 3-5 skills from their background that match this role
- missing_skills: array of 1-3 skills or gaps that would strengthen the match

ALSO provide:
- career_growth: An array of 2-3 actionable recommendations. Each has:
  - action: what to do (e.g. "Get PMP certification", "Learn Python for data analysis")
  - impact: what it unlocks (e.g. "Qualifies you for Senior PM roles at 90%+ match")
  - priority: "high", "medium", or "low"
- higher_roles: 1-2 aspirational roles the user could reach with improvements, each with title and requirements_gap

JSON format:
{
  "roles": [
    {
      "title": "...",
      "match_pct": 85,
      "explanation": "...",
      "matching_skills": ["...", "..."],
      "missing_skills": ["...", "..."]
    }
  ],
  "summary": "A 2-sentence summary of the person's overall career profile.",
  "career_growth": [
    { "action": "...", "impact": "...", "priority": "high" }
  ],
  "higher_roles": [
    { "title": "...", "requirements_gap": "..." }
  ],
  "tier": "premium"
}`;
  }

  const systemPrompt = `You are a career analyst AI for HireReady, a job preparation platform. Your job is to analyze a person's professional background and identify the best-matching job roles for them.

Be specific and practical. Reference real job titles used in hiring. Match percentages should be honest and calibrated:
- 90-100%: Near-perfect fit, could apply immediately
- 75-89%: Strong fit with minor gaps
- 60-74%: Good fit but needs some skill development
- Below 60%: Stretch role, significant gaps

${tierInstruction}${langInstruction}

Respond with ONLY valid JSON. No markdown backticks, no preamble, no explanation outside the JSON.`;

  try {
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
        messages: [{
          role: 'user',
          content: `Analyze this person's professional background and find matching roles:\n\n${background.substring(0, 4000)}`
        }],
        system: systemPrompt
      })
    });

    if (!aiResponse.ok) {
      console.error('Anthropic API error:', aiResponse.status);
      return res.status(502).json({ error: 'AI analysis failed. Please try again.' });
    }

    const aiData = await aiResponse.json();
    const raw = aiData.content?.[0]?.text?.trim();
    if (!raw) return res.status(502).json({ error: 'Empty AI response' });

    // Parse JSON (strip backticks if present)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, '\nRaw:', raw.substring(0, 500));
      return res.status(502).json({ error: 'AI returned invalid format. Please try again.' });
    }

    // Force tier in response
    result.tier = tier;

    // Log usage
    try {
      await sql`INSERT INTO usage_log (user_id, action, details) VALUES (${decoded.userId}, 'role_finder', ${JSON.stringify({ tier, roles_count: result.roles?.length || 0 })})`;
    } catch (e) {
      console.error('Usage log error:', e);
    }

    return res.json({ success: true, result });

  } catch (error) {
    console.error('Role finder error:', error);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}
