import { parseLira } from './cashSale.js';

const CODE = /^\d{3}(?:\.\d{1,6}){0,6}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function requireText(value, field, max = 5000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new RangeError(`Invalid ${field}`);
  }
  return value.trim();
}

function localized(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError(`Invalid ${field}`);
  return { tr: requireText(value.tr, `${field}.tr`), en: requireText(value.en, `${field}.en`) };
}

function lineKey(line) {
  if (!line || typeof line !== 'object' || typeof line.accountCode !== 'string' ||
      !CODE.test(line.accountCode) || !['debit', 'credit'].includes(line.side)) {
    throw new RangeError('Invalid journal line');
  }
  const amount = parseLira(line.amount);
  if (amount === null) throw new RangeError('Invalid journal amount');
  return `${line.accountCode}:${line.side}:${amount}`;
}

export function validateExamDefinition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Invalid exam');
  const title = localized(input.title, 'title');
  const description = localized(input.description, 'description');
  if (!['easy', 'medium', 'hard'].includes(input.difficulty)) throw new RangeError('Invalid difficulty');
  if (!Number.isInteger(input.difficultyRating) || input.difficultyRating < 0 || input.difficultyRating > 4000) {
    throw new RangeError('Invalid difficulty rating');
  }
  if (!Number.isInteger(input.timeLimitSeconds) || input.timeLimitSeconds < 60 || input.timeLimitSeconds > 86400) {
    throw new RangeError('Invalid time limit');
  }
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 100) {
    throw new RangeError('Invalid questions');
  }
  const seen = new Set();
  let totalWeight = 0;
  const questions = input.questions.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID.test(raw.id) || seen.has(raw.id)) {
      throw new RangeError('Invalid or duplicate question ID');
    }
    seen.add(raw.id);
    if (!Number.isInteger(raw.points) || raw.points < 1 || raw.points > 100) throw new RangeError('Invalid question points');
    totalWeight += raw.points;
    const question = { id: raw.id, type: raw.type, points: raw.points, prompt: localized(raw.prompt, 'prompt') };
    if (raw.type === 'choice') {
      if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 10) throw new RangeError('Invalid options');
      const optionIds = new Set();
      question.options = raw.options.map(option => {
        if (!option || typeof option.id !== 'string' || !ID.test(option.id) || optionIds.has(option.id)) throw new RangeError('Invalid option ID');
        optionIds.add(option.id);
        return { id: option.id, text: localized(option.text, 'option') };
      });
      if (!optionIds.has(raw.answer)) throw new RangeError('Invalid choice answer');
      question.answer = raw.answer;
    } else if (raw.type === 'journal') {
      if (!Array.isArray(raw.answer) || raw.answer.length < 2 || raw.answer.length > 20) throw new RangeError('Invalid journal answer');
      const keys = raw.answer.map(lineKey);
      if (new Set(keys).size !== keys.length) throw new RangeError('Duplicate journal line');
      let debit = 0n;
      let credit = 0n;
      for (const line of raw.answer) {
        const amount = BigInt(parseLira(line.amount));
        if (line.side === 'debit') debit += amount;
        else credit += amount;
      }
      if (debit !== credit) throw new RangeError('Unbalanced journal answer');
      question.answer = raw.answer.map(line => ({
        accountCode: line.accountCode, side: line.side, amount: line.amount.trim(),
      }));
      question.lineCount = raw.answer.length;
    } else {
      throw new RangeError('Unsupported question type');
    }
    return question;
  });
  if (totalWeight !== 100) throw new RangeError('Question points must total 100');
  return { title, description, difficulty: input.difficulty, difficultyRating: input.difficultyRating, timeLimitSeconds: input.timeLimitSeconds, questions };
}

export function publicExam(exam) {
  return {
    ...exam,
    questions: exam.questions.map(({ answer, ...question }) => question),
  };
}

export function gradeExam(exam, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new RangeError('Invalid answers');
  const questionIds = new Set(exam.questions.map(question => question.id));
  if (Object.keys(answers).some(id => !questionIds.has(id))) throw new RangeError('Unknown question');
  let score = 0;
  const details = exam.questions.map(question => {
    const answer = answers[question.id];
    let correct = false;
    if (answer !== undefined && answer !== null) {
      if (question.type === 'choice') {
        if (typeof answer !== 'string' || !question.options.some(option => option.id === answer)) throw new RangeError('Invalid choice submission');
        correct = answer === question.answer;
      } else {
        if (!Array.isArray(answer) || answer.length !== question.lineCount) throw new RangeError('Invalid journal submission');
        const actual = answer.map(lineKey).sort();
        const expected = question.answer.map(lineKey).sort();
        correct = actual.every((line, index) => line === expected[index]);
      }
    }
    if (correct) score += question.points;
    return { questionId: question.id, correct, points: correct ? question.points : 0 };
  });
  return { score, details };
}

export function calculateRating(current, difficultyRating, score) {
  if (!Number.isInteger(current) || current < 0 || current > 100000 ||
      !Number.isInteger(difficultyRating) || difficultyRating < 0 || difficultyRating > 4000 ||
      !Number.isInteger(score) || score < 0 || score > 100) throw new RangeError('Invalid rating input');
  const expected = 1 / (1 + 10 ** ((difficultyRating - current) / 400));
  return Math.max(0, Math.round(current + 32 * (score / 100 - expected)));
}
