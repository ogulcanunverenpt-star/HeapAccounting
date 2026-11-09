import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRating, gradeExam, publicExam, validateExamDefinition } from '../src/game/examRules.js';

const localized = text => ({ tr: text, en: text });
const raw = {
  title: localized('Exam'), description: localized('Description'), difficulty: 'easy', difficultyRating: 100,
  timeLimitSeconds: 300, questions: [
    { id: 'q1', type: 'choice', points: 40, prompt: localized('Choose'),
      options: [{ id: 'a', text: localized('A') }, { id: 'b', text: localized('B') }], answer: 'a' },
    { id: 'q2', type: 'journal', points: 60, prompt: localized('Journal'), answer: [
      { accountCode: '100', side: 'debit', amount: '1200,00' },
      { accountCode: '600', side: 'credit', amount: '1000' },
      { accountCode: '391', side: 'credit', amount: '200' },
    ] },
  ],
};

test('validates bilingual exam schema and hides all answer keys', () => {
  const exam = validateExamDefinition(raw);
  const visible = publicExam(exam);
  assert.equal(visible.questions[1].lineCount, 3);
  assert.equal(JSON.stringify(visible).includes('"answer"'), false);
  assert.throws(() => validateExamDefinition({ ...raw, difficultyRating: -1 }), /difficulty rating/);
  assert.throws(() => validateExamDefinition({ ...raw, questions: [raw.questions[0]] }), /total 100/);
  assert.throws(() => validateExamDefinition({ ...raw, questions: [{ ...raw.questions[0], points: 100, answer: 'c' }] }), /choice answer/);
  assert.throws(() => validateExamDefinition({ ...raw, questions: [{ ...raw.questions[1], points: 100, answer: raw.questions[1].answer.slice(0, 2) }] }), /Unbalanced/);
});

test('grades exact journal lines independently of order and awards question points', () => {
  const exam = validateExamDefinition(raw);
  assert.equal(gradeExam(exam, { q1: 'a', q2: [...raw.questions[1].answer].reverse() }).score, 100);
  assert.equal(gradeExam(exam, { q1: 'b', q2: raw.questions[1].answer }).score, 60);
  assert.equal(gradeExam(exam, {}).score, 0);
  assert.throws(() => gradeExam(exam, { other: 'a' }), /Unknown question/);
  assert.throws(() => gradeExam(exam, { q1: 'c' }), /Invalid choice/);
  assert.throws(() => gradeExam(exam, { q2: [] }), /Invalid journal/);
});

test('applies Elo with K=32, fractional score and zero lower bound', () => {
  assert.equal(calculateRating(100, 100, 100), 116);
  assert.equal(calculateRating(100, 100, 0), 84);
  assert.equal(calculateRating(100, 100, 50), 100);
  assert.equal(calculateRating(0, 0, 0), 0);
  assert.throws(() => calculateRating(100, 100, 101), /Invalid rating input/);
});
