import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
import { candidateAuthRepository } from '../repositories/candidate-auth-repository.js';
import { hashPassword, verifyPassword } from '../security/password.js';

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const toPublicCandidate = (candidate) => ({
  id: candidate.id,
  applicationCode: candidate.application_code,
  fullName: candidate.full_name,
  email: candidate.email,
  phone: candidate.phone,
  positionTitle: candidate.position_title,
  processStage: candidate.process_stage,
});

export const candidateAuthService = {
  async issueExamCredentials(candidateId, actorId, phone, areaName) {
    const temporaryPassword = randomBytes(12).toString('base64url');
    const candidate = await candidateAuthRepository.issueExamCredentials(
      candidateId,
      await hashPassword(temporaryPassword),
      actorId,
      phone,
      areaName,
    );
    return { ...candidate, temporaryPassword };
  },

  async login(applicationCode, password) {
    const candidate = await candidateAuthRepository.findCandidateForLogin(applicationCode);
    const passwordMatches = await verifyPassword(password, candidate?.exam_password_hash);
    if (!candidate || !passwordMatches || !candidate.exam_password_hash) {
      throw new AppError(401, 'INVALID_CANDIDATE_CREDENTIALS', 'Código o contraseña incorrectos.');
    }
    if (!['exam', 'interview', 'practical', 'final_result'].includes(candidate.process_stage)) {
      throw new AppError(403, 'CANDIDATE_EXAM_NOT_ENABLED', 'RR. HH. aún no habilitó el acceso a tu examen.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await candidateAuthRepository.createSession(hashToken(token), candidate.id, expiresAt);
    return { token, expiresAt, candidate: toPublicCandidate(candidate) };
  },

  async getCandidateFromToken(token) {
    if (!token) return null;
    const candidate = await candidateAuthRepository.findCandidateBySession(hashToken(token));
    return candidate ? toPublicCandidate(candidate) : null;
  },

  async logout(token) {
    if (token) await candidateAuthRepository.deleteSession(hashToken(token));
  },
};
