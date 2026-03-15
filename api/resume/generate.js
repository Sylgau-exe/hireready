// api/resume/generate.js - Generate or optimize a resume using Claude AI
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { mode, jobDescription, targetCountry, personalInfo, existingResume, language, translateText, translateLang, translateTo } = req.body;
  // mode: 'generic', 'create', 'optimize', or 'translate'
  const langInstruction = language === 'fr' ? '\n\nIMPORTANT: Generate ALL content (summary, bullet points, tips) in FRENCH (Canadian French).' : '';

  // TRANSLATE MODE — quick translation, reuses this working endpoint
  if (mode === 'translate') {
    if (!translateText || !translateLang) return res.status(400).json({ error: 'Text and target language required' });
    const lang = translateLang === 'fr' ? 'Canadian French' : 'English';
    const input = translateText.substring(0, 3000);
    try {
      const tr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2500,
          messages: [{ role: 'user', content: `Translate to ${lang}. Keep proper nouns (names, companies, cities, schools) unchanged. Output ONLY the translated text, nothing else:\n\n${input}` }]
        })
      });
      if (!tr.ok) return res.status(502).json({ error: 'Translation API failed' });
      const td = await tr.json();
      const out = td.content?.[0]?.text?.trim();
      if (!out) return res.status(502).json({ error: 'Empty translation' });
      return res.json({ success: true, translated: out });
    } catch(e) {
      console.error('Translate error:', e);
      return res.status(500).json({ error: 'Translation failed' });
    }
  }

  if (mode !== 'generic' && !jobDescription) return res.status(400).json({ error: 'Job description is required' });

  try {
    let prompt;

    if (mode === 'generic' && translateTo) {
      console.log('TRANSLATION MODE: translating to', translateTo);
      const rawText = (personalInfo?.rawResume || JSON.stringify(personalInfo)).substring(0, 2500);
      
      if (translateTo === 'fr') {
        prompt = `Traduisez ce CV en français canadien. Gardez les noms propres (noms de personnes, entreprises, villes, écoles) inchangés. Traduisez tout le reste: résumé, titres de postes, descriptions, compétences.

CV À TRADUIRE:
${rawText}

Retournez le CV traduit en format JSON (pas de markdown):
{"fullName":"garder original","email":"garder","phone":"garder","location":"garder","linkedinUrl":"garder","summary":"LE RÉSUMÉ TRADUIT EN FRANÇAIS ICI","experience":[{"title":"TITRE DU POSTE EN FRANÇAIS","company":"garder nom original","location":"garder","startDate":"garder","endDate":"garder ou Présent","bullets":["CHAQUE POINT TRADUIT EN FRANÇAIS"]}],"education":[{"degree":"NOM DU DIPLÔME EN FRANÇAIS","school":"garder nom original","year":"garder","details":""}],"skills":["COMPÉTENCE EN FRANÇAIS"],"certifications":[],"languages":[],"tips":[]}`;
      } else {
        prompt = `Translate this resume into English. Keep proper nouns (person names, company names, cities, schools) unchanged. Translate everything else.

RESUME TO TRANSLATE:
${rawText}

Return as JSON (no markdown):
{"fullName":"keep original","email":"keep","phone":"keep","location":"keep","linkedinUrl":"keep","summary":"TRANSLATED SUMMARY IN ENGLISH","experience":[{"title":"JOB TITLE IN ENGLISH","company":"keep original","location":"keep","startDate":"keep","endDate":"keep or Present","bullets":["EACH BULLET TRANSLATED TO ENGLISH"]}],"education":[{"degree":"DEGREE NAME IN ENGLISH","school":"keep original","year":"keep","details":""}],"skills":["SKILL IN ENGLISH"],"certifications":[],"languages":[],"tips":[]}`;
      }
    } else if (mode === 'generic') {
      // FREE TIER: Generic resume, no job description needed
      const langTop = language === 'fr' 
        ? 'LANGUAGE: You MUST write ALL text content in FRENCH (Canadian French). Every summary, bullet point, job description, and tip must be in French. Only keep proper nouns (names, companies, cities) in their original form.\n\n' 
        : '';
      prompt = `${langTop}You are an expert resume writer. Create a polished, professional resume from the information provided.

TARGET COUNTRY: ${targetCountry || 'Canada'}

PERSONAL INFORMATION:
${JSON.stringify(personalInfo, null, 2)}

Return the resume in this exact JSON format (no markdown, no backticks):
{
  "fullName": "${personalInfo?.name || ''}",
  "email": "${personalInfo?.email || ''}",
  "phone": "${personalInfo?.phone || ''}",
  "location": "${personalInfo?.location || ''}",
  "linkedinUrl": "${personalInfo?.linkedin || ''}",
  "summary": "${language === 'fr' ? 'Résumé professionnel en FRANÇAIS (3-4 phrases)' : 'Strong professional summary (3-4 sentences)'}",
  "experience": [
    {
      "title": "${language === 'fr' ? 'Titre du poste EN FRANÇAIS' : 'Job Title'}",
      "company": "Company Name",
      "location": "City, Country",
      "startDate": "Mon YYYY",
      "endDate": "${language === 'fr' ? 'Mon YYYY ou Présent' : 'Mon YYYY or Present'}",
      "bullets": ["${language === 'fr' ? 'Réalisation en FRANÇAIS avec métriques' : 'Achievement-focused bullet with metrics'}", "bullet 2", "bullet 3"]
    }
  ],
  "education": [
    {
      "degree": "${language === 'fr' ? 'Nom du diplôme EN FRANÇAIS' : 'Degree Name'}",
      "school": "School Name",
      "year": "YYYY",
      "details": ""
    }
  ],
  "skills": ["skill1", "skill2"],
  "certifications": [],
  "languages": [],
  "tips": ["${language === 'fr' ? 'Conseil en français' : 'Tip to improve this resume further'}"]
}

Follow resume standards for ${targetCountry || 'Canada'}. Use strong action verbs and quantify achievements where possible.${langInstruction}`;
    } else if (mode === 'optimize' && existingResume) {
      const langTop = language === 'fr'
        ? 'LANGUAGE: You MUST write ALL text content in FRENCH (Canadian French). Summaries, bullet points, improvements — everything in French. Keep proper nouns unchanged.\n\n'
        : '';
      prompt = `${langTop}You are an expert resume writer and ATS optimization specialist.

TASK: Optimize the following resume to match the job description. Keep the person's real experience but reword, restructure, and add relevant keywords to maximize ATS compatibility.

TARGET COUNTRY: ${targetCountry || 'Canada'}

EXISTING RESUME:
${existingResume}

JOB DESCRIPTION:
${jobDescription}

Return the optimized resume in this exact JSON format (no markdown, no backticks):
{
  "fullName": "...",
  "email": "...",
  "phone": "...",
  "location": "...",
  "linkedinUrl": "...",
  "summary": "${language === 'fr' ? 'Résumé professionnel optimisé EN FRANÇAIS' : 'Professional summary optimized for this role (3-4 sentences)'}",
  "experience": [
    {
      "title": "${language === 'fr' ? 'Titre du poste EN FRANÇAIS' : 'Job Title'}",
      "company": "Company Name",
      "location": "City, Country",
      "startDate": "Mon YYYY",
      "endDate": "${language === 'fr' ? 'Mon YYYY ou Présent' : 'Mon YYYY or Present'}",
      "bullets": ["${language === 'fr' ? 'Réalisation en FRANÇAIS' : 'Achievement-focused bullet 1'}", "bullet 2", "bullet 3"]
    }
  ],
  "education": [
    {
      "degree": "${language === 'fr' ? 'Nom du diplôme' : 'Degree Name'}",
      "school": "School Name",
      "year": "YYYY",
      "details": ""
    }
  ],
  "skills": ["skill1", "skill2"],
  "certifications": ["cert1"],
  "languages": ["${language === 'fr' ? 'Anglais (Natif), Français (Courant)' : 'English (Native), French (Fluent)'}"],
  "improvements": ["${language === 'fr' ? 'Ce qui a été modifié et pourquoi' : 'What was changed and why'}", "bullet 2"]
}

Follow resume standards for ${targetCountry || 'Canada'}. Use strong action verbs. Quantify achievements where possible.${langInstruction}`;
    } else {
      // Create from scratch
      prompt = `You are an expert resume writer specializing in ATS-optimized resumes.

TASK: Create a professional resume from the information provided, tailored to the job description.

TARGET COUNTRY: ${targetCountry || 'Canada'}

PERSONAL INFORMATION:
${JSON.stringify(personalInfo, null, 2)}

JOB DESCRIPTION:
${jobDescription}

Return the resume in this exact JSON format (no markdown, no backticks):
{
  "fullName": "${personalInfo?.name || ''}",
  "email": "${personalInfo?.email || ''}",
  "phone": "${personalInfo?.phone || ''}",
  "location": "${personalInfo?.location || ''}",
  "linkedinUrl": "${personalInfo?.linkedin || ''}",
  "summary": "Professional summary tailored to this role (3-4 sentences)",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, Country",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "bullets": ["Achievement-focused bullet with metrics", "bullet 2", "bullet 3"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "school": "School Name",
      "year": "YYYY",
      "details": ""
    }
  ],
  "skills": ["skill1", "skill2"],
  "certifications": [],
  "languages": [],
  "tips": ["Helpful tip about this resume"]
}

Follow resume standards for ${targetCountry || 'Canada'}. Use relevant keywords naturally.${langInstruction}`;
    }

    const apiBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    };

    // Add system prompt for translation to force language output
    if (translateTo) {
      if (translateTo === 'fr') {
        apiBody.system = `Tu es un traducteur professionnel de CV. Tu DOIS écrire TOUT le contenu en français canadien. Chaque valeur dans le JSON — résumé, titres de postes, points, compétences, formation — doit être en français. Ne retourne JAMAIS du contenu en anglais.`;
      } else {
        apiBody.system = `You are a professional resume translator. You MUST write ALL content in English. Every value in the JSON must be in English. Never return French content.`;
      }
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(apiBody)
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI generation failed' });
    }

    const aiData = await aiResponse.json();
    const text = aiData.content[0].text;
    
    let resume;
    try {
      resume = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      return res.status(502).json({ error: 'Failed to parse AI response' });
    }

    // Save to DB
    try {
      const result = await sql`
        INSERT INTO resumes (user_id, title, full_name, email, phone, location, linkedin_url,
          summary, experience, education, skills, certifications, languages, target_country, is_generated)
        VALUES (${decoded.userId}, ${mode === 'optimize' ? 'Optimized Resume' : 'Generated Resume'},
          ${resume.fullName}, ${resume.email}, ${resume.phone}, ${resume.location}, ${resume.linkedinUrl || ''},
          ${resume.summary}, ${JSON.stringify(resume.experience)}, ${JSON.stringify(resume.education)},
          ${JSON.stringify(resume.skills)}, ${JSON.stringify(resume.certifications || [])},
          ${JSON.stringify(resume.languages || [])}, ${targetCountry || 'CA'}, true)
        RETURNING id
      `;
      resume.id = result.rows[0]?.id;
    } catch (dbErr) {
      console.error('DB save error (non-fatal):', dbErr);
    }

    try {
      await sql`INSERT INTO usage_log (user_id, action, details) VALUES (${decoded.userId}, 'resume_${mode}', '{}')`;
    } catch(e) {}

    return res.json({ success: true, resume });
  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Resume generation failed' });
  }
}
