// lib/db.js - Database helper for PM Skills Assessment (adapted from BizSimHub)
import { sql } from '@vercel/postgres';

export const UserDB = {
  async create(email, passwordHash, name) {
    const result = await sql`
      INSERT INTO users (email, password_hash, name, auth_provider)
      VALUES (${email}, ${passwordHash}, ${name}, 'email')
      RETURNING *
    `;
    return result.rows[0];
  },

  async createGoogleUser(email, name, googleId) {
    const result = await sql`
      INSERT INTO users (email, name, google_id, auth_provider, email_verified)
      VALUES (${email}, ${name}, ${googleId}, 'google', true)
      RETURNING *
    `;
    return result.rows[0];
  },

  async linkGoogleAccount(userId, googleId) {
    const result = await sql`
      UPDATE users SET google_id = ${googleId}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
      RETURNING *
    `;
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await sql`SELECT * FROM users WHERE email = ${email}`;
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await sql`SELECT * FROM users WHERE id = ${id}`;
    return result.rows[0] || null;
  },

  async setResetToken(email, token, expiresAt) {
    const result = await sql`
      UPDATE users SET
        reset_token = ${token},
        reset_token_expires = ${expiresAt},
        updated_at = CURRENT_TIMESTAMP
      WHERE email = ${email}
      RETURNING *
    `;
    return result.rows[0];
  },

  async findByResetToken(token) {
    const result = await sql`
      SELECT * FROM users 
      WHERE reset_token = ${token} 
        AND reset_token_expires > CURRENT_TIMESTAMP
    `;
    return result.rows[0] || null;
  },

  async updatePassword(id, passwordHash) {
    const result = await sql`
      UPDATE users SET
        password_hash = ${passwordHash},
        reset_token = NULL,
        reset_token_expires = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;
    return result.rows[0];
  }
};
