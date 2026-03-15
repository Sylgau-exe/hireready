// api/documents/delete.js - Delete a resume or analysis document
import { sql } from '@vercel/postgres';
import { getUserFromRequest, cors } from '../../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Authentication required' });

  const { docId, source } = req.body;
  if (!docId || !source) return res.status(400).json({ error: 'Document ID and source required' });

  try {
    if (source === 'resume') {
      await sql`DELETE FROM resumes WHERE id = ${docId} AND user_id = ${decoded.userId}`;
    } else if (source === 'analysis') {
      await sql`DELETE FROM ats_analyses WHERE id = ${docId} AND user_id = ${decoded.userId}`;
    } else {
      return res.status(400).json({ error: 'Invalid source' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
}
