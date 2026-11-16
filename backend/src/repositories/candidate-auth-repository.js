import { pool } from '../db/pool.js';
import { AppError } from '../errors/app-error.js';
import { getRequestIpAddress } from '../middleware/request-context.js';

async function recordAudit(client, actorId, eventType, candidateId, metadata = {}) {
  await client.query(
    `INSERT INTO audit_events (actor_id, event_type, resource_type, resource_id, metadata, ip_address)
     VALUES ($1, $2, 'blind_candidate', $3, $4, $5)`,
    [actorId, eventType, candidateId, JSON.stringify(metadata), getRequestIpAddress()],
  );
}

export const candidateAuthRepository = {
  async issueExamCredentials(candidateId, passwordHash, actorId, phone, areaName = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT c.id, c.application_code, c.process_stage, c.phone, p.title AS position_title,
                e.id AS exam_id
         FROM blind_candidates c
         JOIN coverage_requests r ON r.id = c.request_id
         JOIN departments d ON d.id = r.department_id
         JOIN position_profiles p ON p.id = r.position_id
         LEFT JOIN blind_candidate_exams e ON e.candidate_id = c.id
         WHERE c.id = $1 AND ($2::text IS NULL OR lower(d.name) = lower($2))
         FOR UPDATE OF c`,
        [candidateId, areaName],
      );
      if (!current.rowCount) {
        throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'No se encontró al postulante.');
      }
      const candidate = current.rows[0];
      if (candidate.process_stage !== 'exam' || candidate.exam_id) {
        throw new AppError(409, 'CANDIDATE_NOT_READY_FOR_EXAM', 'El postulante debe estar en la etapa de examen y no haberlo presentado.');
      }
      const destinationPhone = phone || candidate.phone;
      if (!destinationPhone || destinationPhone.replace(/\D/g, '').length < 9) {
        throw new AppError(409, 'CANDIDATE_PHONE_MISSING', 'Registra un número de teléfono válido para enviar las credenciales.');
      }

      await client.query(
        `UPDATE blind_candidates
         SET exam_password_hash = $2, exam_password_issued_at = now(), phone = $3
         WHERE id = $1`,
        [candidateId, passwordHash, destinationPhone],
      );
      await client.query('DELETE FROM blind_candidate_sessions WHERE candidate_id = $1', [candidateId]);
      await recordAudit(client, actorId, 'blind_candidate.exam_credentials_issued', candidateId, {
        applicationCode: candidate.application_code,
      });
      await client.query('COMMIT');
      return {
        applicationCode: candidate.application_code,
        positionTitle: candidate.position_title,
        phone: destinationPhone,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async findCandidateForLogin(applicationCode) {
    const result = await pool.query(
      `SELECT c.id, c.application_code, c.full_name, c.email, c.phone,
              c.exam_password_hash, c.process_stage,
              p.title AS position_title
       FROM blind_candidates c
       JOIN coverage_requests r ON r.id = c.request_id
       JOIN position_profiles p ON p.id = r.position_id
       WHERE upper(c.application_code) = upper($1)`,
      [applicationCode],
    );
    return result.rows[0] ?? null;
  },

  async createSession(tokenHash, candidateId, expiresAt) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM blind_candidate_sessions WHERE expires_at <= now()');
      await client.query(
        'INSERT INTO blind_candidate_sessions (token_hash, candidate_id, expires_at) VALUES ($1, $2, $3)',
        [tokenHash, candidateId, expiresAt],
      );
      await recordAudit(client, null, 'candidate_auth.login', candidateId);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async findCandidateBySession(tokenHash) {
    const result = await pool.query(
      `SELECT c.id, c.application_code, c.full_name, c.email, c.phone,
              c.process_stage, p.title AS position_title
       FROM blind_candidate_sessions s
       JOIN blind_candidates c ON c.id = s.candidate_id
       JOIN coverage_requests r ON r.id = c.request_id
       JOIN position_profiles p ON p.id = r.position_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  },

  async deleteSession(tokenHash) {
    await pool.query('DELETE FROM blind_candidate_sessions WHERE token_hash = $1', [tokenHash]);
  },

  async getExamContext(candidateId) {
    const result = await pool.query(
      `SELECT c.id, c.application_code, c.process_stage, c.exam_started_at,
              c.exam_answer_draft, p.title AS position_title,
              e.id AS exam_id, e.objective_score, e.written_review_status, e.submitted_at
       FROM blind_candidates c
       JOIN coverage_requests r ON r.id = c.request_id
       JOIN position_profiles p ON p.id = r.position_id
       LEFT JOIN blind_candidate_exams e ON e.candidate_id = c.id
       WHERE c.id = $1`,
      [candidateId],
    );
    return result.rows[0] ?? null;
  },

  async startExam(candidateId, emptyDraft) {
    const result = await pool.query(
      `UPDATE blind_candidates c
       SET exam_started_at = COALESCE(c.exam_started_at, now()),
           exam_answer_draft = CASE
             WHEN jsonb_array_length(c.exam_answer_draft) = 20 THEN c.exam_answer_draft
             ELSE $2::jsonb
           END
       WHERE c.id = $1 AND c.process_stage = 'exam'
         AND NOT EXISTS (
           SELECT 1 FROM blind_candidate_exams e WHERE e.candidate_id = c.id
         )
       RETURNING exam_started_at, exam_answer_draft`,
      [candidateId, JSON.stringify(emptyDraft)],
    );
    if (!result.rowCount) {
      const context = await this.getExamContext(candidateId);
      if (context?.exam_id) {
        throw new AppError(409, 'EXAM_ALREADY_SUBMITTED', 'Este examen ya fue presentado.');
      }
      throw new AppError(409, 'EXAM_NOT_AVAILABLE', 'El examen todavía no está habilitado para este postulante.');
    }
    return result.rows[0];
  },

  async saveExamDraft(candidateId, answers) {
    const result = await pool.query(
      `UPDATE blind_candidates c
       SET exam_answer_draft = $2::jsonb
       WHERE c.id = $1 AND c.process_stage = 'exam'
         AND c.exam_started_at IS NOT NULL
         AND c.exam_started_at + interval '30 minutes' > now()
         AND NOT EXISTS (
           SELECT 1 FROM blind_candidate_exams e WHERE e.candidate_id = c.id
         )
       RETURNING exam_started_at`,
      [candidateId, JSON.stringify(answers)],
    );
    if (!result.rowCount) {
      const context = await this.getExamContext(candidateId);
      if (context?.exam_id) {
        throw new AppError(409, 'EXAM_ALREADY_SUBMITTED', 'Este examen ya fue presentado.');
      }
      if (context?.exam_started_at && Date.now() >= new Date(context.exam_started_at).getTime() + 30 * 60 * 1000) {
        throw new AppError(409, 'EXAM_TIME_EXPIRED', 'El tiempo para modificar respuestas terminó.');
      }
      throw new AppError(409, 'EXAM_NOT_AVAILABLE', 'El examen no está disponible para guardar respuestas.');
    }
    return result.rows[0];
  },
};
