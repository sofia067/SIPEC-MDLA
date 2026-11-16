import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { candidateAuthRepository } from '../repositories/candidate-auth-repository.js';
import { modulesRepository } from '../repositories/modules-repository.js';
import { CANDIDATE_EXAM_DURATION_MS } from '../services/candidate-exam.js';
import { candidateAuthService } from '../services/candidate-auth-service.js';

const candidateCookie = 'sipec_candidate_session';
const candidateLoginSchema = z.object({
  applicationCode: z.string().trim().min(1).max(24),
  password: z.string().min(1).max(256),
});
const answerValueSchema = z.union([
  z.number().int().min(0).max(10),
  z.string().max(2000),
  z.null(),
]);
const candidateAnswersSchema = z.object({
  answers: z.array(answerValueSchema).length(20),
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: { code: 'CANDIDATE_LOGIN_RATE_LIMIT', message: 'Demasiados intentos. Espera unos minutos e intenta nuevamente.' },
  },
});
const cookieOptions = (secure, maxAge) => ({
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/',
  ...(maxAge ? { maxAge } : {}),
});

async function authenticateCandidate(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    req.candidate = await candidateAuthService.getCandidateFromToken(req.cookies[candidateCookie]);
    if (!req.candidate) {
      return res.status(401).json({
        error: { code: 'CANDIDATE_UNAUTHENTICATED', message: 'Inicia sesión con las credenciales enviadas por RR. HH.' },
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

function publicExamResult(exam) {
  return {
    submitted: true,
    objectiveScore: Number(exam.objective_score),
    correctAnswers: exam.correct_answers ?? null,
    totalObjectiveQuestions: exam.total_objective_questions ?? null,
    submittedAt: exam.submitted_at,
  };
}

function validateAnswersAgainstBank(bank, answers) {
  for (const [index, question] of bank.preguntas.entries()) {
    const answer = answers[index];
    if (question.tipo === 'opcion') {
      if (answer === null || answer === '') continue;
      if (!Number.isInteger(answer) || answer < 0 || answer >= question.opciones.length) {
        throw new AppError(400, 'INVALID_ANSWERS', `La respuesta de la pregunta ${index + 1} no es válida.`);
      }
    } else if (answer !== null && answer !== '' && typeof answer !== 'string') {
      throw new AppError(400, 'INVALID_ANSWERS', `La respuesta de la pregunta ${index + 1} no es válida.`);
    }
  }
}

export function createCandidateAuthRouter({ secureCookies }) {
  const router = Router();

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const input = candidateLoginSchema.parse(req.body);
      const session = await candidateAuthService.login(input.applicationCode, input.password);
      res.cookie(
        candidateCookie,
        session.token,
        cookieOptions(secureCookies, session.expiresAt.getTime() - Date.now()),
      );
      return res.json({ candidate: session.candidate });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', authenticateCandidate, (req, res) => (
    res.json({ candidate: req.candidate })
  ));

  router.post('/logout', async (req, res, next) => {
    try {
      await candidateAuthService.logout(req.cookies[candidateCookie]);
      res.clearCookie(candidateCookie, cookieOptions(secureCookies));
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.get('/exam', authenticateCandidate, async (req, res, next) => {
    try {
      const context = await candidateAuthRepository.getExamContext(req.candidate.id);
      if (!context) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'No se encontró el postulante.');
      if (context.exam_id) {
        return res.json({ exam: publicExamResult(context) });
      }
      if (context.process_stage !== 'exam') {
        throw new AppError(403, 'CANDIDATE_EXAM_NOT_ENABLED', 'RR. HH. todavía no habilitó el examen.');
      }

      const bank = modulesRepository.getCandidateExamBank(context.position_title);
      const startedAt = context.exam_started_at ? new Date(context.exam_started_at) : null;
      const expiresAt = startedAt ? new Date(startedAt.getTime() + CANDIDATE_EXAM_DURATION_MS) : null;
      const draft = Array.isArray(context.exam_answer_draft) ? context.exam_answer_draft : [];
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        const submitted = await modulesRepository.submitBlindSelectionExam(
          req.candidate.id,
          draft.length === 20 ? draft : Array(20).fill(null),
          null,
          { allowUnanswered: true },
        );
        return res.json({ exam: publicExamResult(submitted) });
      }
      return res.json({
        exam: {
          submitted: false,
          positionTitle: bank.puesto,
          questions: bank.preguntas,
          startedAt: startedAt?.toISOString() ?? null,
          expiresAt: expiresAt?.toISOString() ?? null,
          draft: draft.length === 20 ? draft : Array(20).fill(null),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/exam/start', authenticateCandidate, async (req, res, next) => {
    try {
      const context = await candidateAuthRepository.getExamContext(req.candidate.id);
      if (!context) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'No se encontró el postulante.');
      if (context.exam_id) throw new AppError(409, 'EXAM_ALREADY_SUBMITTED', 'Este examen ya fue presentado.');
      modulesRepository.getCandidateExamBank(context.position_title);
      const attempt = await candidateAuthRepository.startExam(req.candidate.id, Array(20).fill(null));
      const startedAt = new Date(attempt.exam_started_at);
      return res.json({
        startedAt: startedAt.toISOString(),
        expiresAt: new Date(startedAt.getTime() + CANDIDATE_EXAM_DURATION_MS).toISOString(),
        draft: attempt.exam_answer_draft,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/exam/draft', authenticateCandidate, async (req, res, next) => {
    try {
      const { answers } = candidateAnswersSchema.parse(req.body);
      const context = await candidateAuthRepository.getExamContext(req.candidate.id);
      if (!context) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'No se encontró el postulante.');
      if (context.process_stage !== 'exam' || !context.exam_started_at) {
        throw new AppError(409, 'EXAM_NOT_STARTED', 'Inicia el examen antes de guardar respuestas.');
      }
      if (context.exam_id) throw new AppError(409, 'EXAM_ALREADY_SUBMITTED', 'Este examen ya fue presentado.');
      validateAnswersAgainstBank(
        modulesRepository.getCandidateExamBank(context.position_title),
        answers,
      );
      await candidateAuthRepository.saveExamDraft(req.candidate.id, answers);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.post('/exam/submit', authenticateCandidate, async (req, res, next) => {
    try {
      const { answers } = candidateAnswersSchema.parse(req.body);
      const context = await candidateAuthRepository.getExamContext(req.candidate.id);
      if (!context) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'No se encontró el postulante.');
      if (context.exam_id) {
        return res.json({ exam: publicExamResult(context) });
      }
      if (context.process_stage !== 'exam' || !context.exam_started_at) {
        throw new AppError(409, 'EXAM_NOT_STARTED', 'Inicia el examen antes de enviar respuestas.');
      }

      const expired = Date.now()
        >= new Date(context.exam_started_at).getTime() + CANDIDATE_EXAM_DURATION_MS;
      if (!expired) {
        validateAnswersAgainstBank(
          modulesRepository.getCandidateExamBank(context.position_title),
          answers,
        );
        try {
          await candidateAuthRepository.saveExamDraft(req.candidate.id, answers);
        } catch (error) {
          if (error.code !== 'EXAM_TIME_EXPIRED') throw error;
        }
      }

      const finalContext = await candidateAuthRepository.getExamContext(req.candidate.id);
      if (!finalContext) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'No se encontró el postulante.');
      const finalAnswers = Array.isArray(finalContext.exam_answer_draft)
        && finalContext.exam_answer_draft.length === 20
        ? finalContext.exam_answer_draft
        : Array(20).fill(null);
      const result = await modulesRepository.submitBlindSelectionExam(
        req.candidate.id,
        finalAnswers,
        null,
        { allowUnanswered: true },
      );
      return res.status(201).json({ exam: publicExamResult(result) });
    } catch (error) {
      if (error.code === 'EXAM_ALREADY_SUBMITTED') {
        try {
          const context = await candidateAuthRepository.getExamContext(req.candidate.id);
          if (context?.exam_id) return res.json({ exam: publicExamResult(context) });
        } catch (lookupError) {
          return next(lookupError);
        }
      }
      return next(error);
    }
  });

  return router;
}
