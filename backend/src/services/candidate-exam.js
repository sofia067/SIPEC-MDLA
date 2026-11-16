export const CANDIDATE_EXAM_DURATION_MS = 30 * 60 * 1000;

export function scoreObjectiveAnswers(bank, answers) {
  const objectiveQuestions = bank.preguntas
    .map((question, index) => ({ question, answer: answers[index] }))
    .filter(({ question }) => question.tipo === 'opcion');
  const correctAnswers = objectiveQuestions.reduce((count, { question, answer }) => (
    count + (answer === question.respuesta ? 1 : 0)
  ), 0);

  return {
    correctAnswers,
    totalQuestions: objectiveQuestions.length,
    objectiveScore: objectiveQuestions.length
      ? Math.round((correctAnswers / objectiveQuestions.length) * 100)
      : 0,
  };
}
