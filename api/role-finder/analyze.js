// api/role-finder/analyze.js — AI Role Finder with tier-gated depth
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Build readable text from a resume DB row
function buildResumeText(res) {
  let text = '';
  if (res.full_name) text += res.full_name + '\n';
  if (res.email) text += res.email + '\n';
  if (res.phone) text += res.phone + '\n';
  if (res.location) text += res.location + '\n';
  if (res.linkedin_url) text += res.linkedin_url + '\n';
  if (res.summary) text += '\nPROFESSIONAL SUMMARY\n' + res.summary + '\n';

  const exp = typeof res.experience === 'string' ? JSON.parse(res.experience) : (res.experience || []);
  if (exp.length) {
    text += '\nEXPERIENCE\n';
    exp.forEach(e => {
      if (typeof e === 'string') { text += e + '\n'; }
      else {
        text += `${e.title||''}, ${e.company||''}, ${e.location||''}, ${e.startDate||e.start_date||''} – ${e.endDate||e.end_date||'Present'}\n`;
        (e.bullets||[]).forEach(b => text += '- ' + b + '\n');
        text += '\n';
      }
    });
  }

  const edu = typeof res.education === 'string' ? JSON.parse(res.education) : (res.education || []);
  if (edu.length) {
    text += '\nEDUCATION\n';
    edu.forEach(e => {
      if (typeof e === 'string') { text += e + '\n'; }
      else { text += `${e.degree||''}, ${e.school||''}, ${e.year||''}\n`; }
    });
  }

  const skills = typeof res.skills === 'string' ? JSON.parse(res.skills) : (res.skills || []);
  if (skills.length) text += '\nSKILLS\n' + skills.join(', ') + '\n';

  const certs = typeof res.certifications === 'string' ? JSON.parse(res.certifications) : (res.certifications || []);
  if (certs.length) text += '\nCERTIFICATIONS\n' + certs.join(', ') + '\n';

  const langs = typeof res.languages === 'string' ? JSON.parse(res.languages) : (res.languages || []);
  if (langs.length) text += '\nLANGUAGES\n' + langs.join(', ') + '\n';

  return text.trim();
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { resume_id, background, language } = req.body;

  // Build background text: from resume_id (preferred) or manual text
  let backgroundText = '';

  if (resume_id) {
    try {
      const result = await sql`
        SELECT full_name, email, phone, location, linkedin_url, summary,
               experience, education, skills, certifications, languages
        FROM resumes WHERE id = ${resume_id} AND user_id = ${decoded.userId}
      `;
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Resume not found.' });
      }
      backgroundText = buildResumeText(result.rows[0]);
    } catch (e) {
      console.error('Failed to fetch resume:', e);
      return res.status(500).json({ error: 'Failed to load resume data.' });
    }
  } else if (background) {
    backgroundText = background.trim();
  }

  if (backgroundText.length < 30) {
    return res.status(400).json({ error: 'Please select a resume or provide at least a few sentences about your background.' });
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

JSON format:
{
  "roles": [
    { "title": "...", "match_pct": 85 }
  ],
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
    tierInstruction = `TIER: PREMIUM — DEEP ANALYSIS
Return 3-5 matching roles with an in-depth breakdown for each.

For EACH role, provide:
- title: the job title
- match_pct: match percentage (0-100)
- level: "junior", "mid", "senior", or "director"
- deep_analysis: a detailed paragraph (4-6 sentences) explaining:
  - WHY this specific role fits the user (not generic — reference their actual experience)
  - Which exact tasks or achievements from their background directly map to this role's responsibilities
  - How close the user is to meeting all the requirements (e.g. "You meet 8 of 10 core requirements")
- matching_skills: array of 3-5 skills from their background that match
- missing_skills: array of 1-3 skills or gaps
- readiness: "ready_now", "close", or "stretch" — how ready they are to apply today

ROLE DIFFERENCES — compare the top 2-3 roles against each other:
- role_comparisons: array of comparison objects, each with:
  - roles: [role A title, role B title]
  - responsibility_diff: how the day-to-day work differs (2 sentences)
  - level_diff: which role is more senior and why
  - requirements_diff: what additional skills/experience the higher role needs
  - transition_path: what the user would need to do to move from A to B

EXTENDED INSIGHTS:
- target_now: array of 1-2 role titles the user should apply to immediately (best fit right now)
- not_yet_attainable: array of 1-2 role titles that are currently out of reach, each with a brief reason why
- blocking_skills: array of 2-3 specific skills or experience gaps that are preventing growth to higher-level roles
- career_direction: a 3-4 sentence strategic recommendation on which direction to move in and why

CAREER GROWTH PLAN:
- career_growth: array of 2-3 actionable recommendations, each with:
  - action: what to do (specific, e.g. "Get PMP certification", "Lead a cross-functional project")
  - impact: what it unlocks (e.g. "Qualifies you for Senior PM roles at 90%+ match")
  - priority: "high", "medium", or "low"

ASPIRATIONAL ROLES:
- higher_roles: 1-2 roles the user could reach with targeted improvements, each with:
  - title: the role title
  - requirements_gap: what's missing to qualify

JSON format:
{
  "roles": [
    {
      "title": "...",
      "match_pct": 85,
      "level": "senior",
      "deep_analysis": "Detailed paragraph about fit...",
      "matching_skills": ["...", "..."],
      "missing_skills": ["..."],
      "readiness": "ready_now"
    }
  ],
  "summary": "A 2-sentence summary of the person's overall career profile.",
  "role_comparisons": [
    {
      "roles": ["Role A", "Role B"],
      "responsibility_diff": "...",
      "level_diff": "...",
      "requirements_diff": "...",
      "transition_path": "..."
    }
  ],
  "target_now": ["..."],
  "not_yet_attainable": [{ "title": "...", "reason": "..." }],
  "blocking_skills": ["..."],
  "career_direction": "Strategic recommendation...",
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
        max_tokens: tier === 'premium' ? 4000 : 2000,
        messages: [{
          role: 'user',
          content: `Analyze this person's professional background and find matching roles:\n\n${backgroundText.substring(0, 4000)}`
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
