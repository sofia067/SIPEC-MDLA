import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreObjectiveAnswers } from '../src/services/candidate-exam.js';

test('scores objective answers against the server answer key only', () => {
  const bank = {
    preguntas: [
      { tipo: 'opcion', respuesta: 2 },
      { tipo: 'escrita' },
      { tipo: 'opcion', respuesta: 0 },
      { tipo: 'opcion', respuesta: 1 },
    ],
  };

  assert.deepEqual(scoreObjectiveAnswers(bank, [2, 'respuesta abierta', 1, 1]), {
    correctAnswers: 2,
    totalQuestions: 3,
    objectiveScore: 67,
  });
});

test('counts unanswered objective questions as incorrect', () => {
  const bank = {
    preguntas: [
      { tipo: 'opcion', respuesta: 1 },
      { tipo: 'opcion', respuesta: 0 },
    ],
  };

  assert.deepEqual(scoreObjectiveAnswers(bank, [null]), {
    correctAnswers: 0,
    totalQuestions: 2,
    objectiveScore: 0,
  });
});

test('returns a finite zero score when a bank has no objective questions', () => {
  assert.deepEqual(scoreObjectiveAnswers({ preguntas: [{ tipo: 'escrita' }] }, ['respuesta']), {
    correctAnswers: 0,
    totalQuestions: 0,
    objectiveScore: 0,
  });
});
