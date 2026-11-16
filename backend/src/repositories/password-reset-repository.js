import { pool } from '../db/pool.js';

export const passwordResetRepository = {
  async createForUsername(username) {
    await pool.query(
      `INSERT INTO password_reset_requests (user_id)
       SELECT id FROM users
       WHERE lower(username) = lower($1) AND is_active = true
       ON CONFLICT (user_id) WHERE resolved_at IS NULL DO NOTHING`,
      [username],
    );
  },

  async listOpen() {
    const result = await pool.query(
      `SELECT r.id, u.username, u.display_name, r.created_at
       FROM password_reset_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.resolved_at IS NULL
       ORDER BY r.created_at`,
    );
    return result.rows;
  },

  async resolve(id, adminId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const request = await client.query(
        `UPDATE password_reset_requests
         SET resolved_at = now(), resolved_by = $2
         WHERE id = $1 AND resolved_at IS NULL
         RETURNING user_id`,
        [id, adminId],
      );
      if (!request.rowCount) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `INSERT INTO audit_events (actor_id, event_type, resource_type, resource_id)
         VALUES ($1, 'auth.password_reset_request_reviewed', 'password_reset_request', $2)`,
        [adminId, id],
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
