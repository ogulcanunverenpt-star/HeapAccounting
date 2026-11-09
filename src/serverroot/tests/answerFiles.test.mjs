import test from 'node:test';
import assert from 'node:assert/strict';
import { templateRows, answersFromRows, makeTemplate, readAnswers } from '../src/game/answerFiles.js';

const exam = { questions: [
  { id: 'choice', type: 'choice', options: [{ id: 'a' }, { id: 'b' }] },
  { id: 'journal', type: 'journal', lineCount: 2 },
] };
const filled = [
  ['question_id', 'line', 'choice', 'account_code', 'side', 'amount'],
  ['choice', '1', 'a', '', '', ''],
  ['journal', '1', '', '100', 'debit', '1200'],
  ['journal', '2', '', '600', 'credit', '1200'],
];

test('answer template validates rows and maps them to exam answers', () => {
  assert.equal(templateRows(exam).length, 4);
  const answers = answersFromRows(exam, filled);
  assert.equal(answers.choice, 'a');
  assert.deepEqual(answers.journal[0], { accountCode: '100', side: 'debit', amount: '1200' });
  assert.throws(() => answersFromRows(exam, [...filled, filled[1]]), /Duplicate/);
  assert.throws(() => answersFromRows(exam, filled.slice(0, -1)), /missing/);
  assert.throws(() => answersFromRows(exam, [filled[0], ['choice', '1', 'z', '', '', ''], ...filled.slice(2)]), /choice/);
});

test('CSV and Excel templates round-trip and reject invalid files', async () => {
  for (const format of ['csv', 'xlsx']) {
    const blob = await makeTemplate(exam, format);
    const file = new File([blob], `answers.${format}`);
    assert.deepEqual(await readAnswers(exam, file), {});
  }
  const file = new File([filled.map(row => row.join(',')).join('\r\n')], 'answers.csv');
  assert.equal((await readAnswers(exam, file)).choice, 'a');
  const turkish = filled.map(row => row.join(';')).join('\r\n').replace('1200', '1200,00');
  assert.equal((await readAnswers(exam, new File([turkish], 'answers.csv'))).journal[0].amount, '1200,00');
  await assert.rejects(readAnswers(exam, new File(['bad'], 'answers.csv')), /header/);
});
