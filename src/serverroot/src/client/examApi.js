import { getActiveAccount } from '../store/state.js';

export class ExamApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ExamApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, file = false } = {}) {
  const account = getActiveAccount();
  if (!account?.accessToken || !account.baseUrl) throw new Error('Matrix session unavailable');
  const { userId, accessToken, baseUrl } = account;
  const sameAccount = () => {
    const active = getActiveAccount();
    return active?.userId === userId && active?.accessToken === accessToken && active?.baseUrl === baseUrl;
  };
  const configResponse = await fetch('/api/config', { cache: 'no-store' });
  if (!configResponse.ok) throw new Error('Exam service unavailable');
  const config = await configResponse.json();
  const normalize = value => new URL(value).toString().replace(/\/+$/, '');
  if (!config.matrixBaseUrl || normalize(config.matrixBaseUrl) !== normalize(baseUrl)) {
    throw new Error('The active Matrix account does not use this exam service’s homeserver');
  }
  if (!sameAccount()) throw new Error('Matrix account changed during the request');
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (!sameAccount()) throw new Error('Matrix account changed during the request');
  if (!response.ok) {
    let message = `Exam service error (${response.status})`;
    if (response.headers.get('content-type')?.includes('application/json')) {
      const data = await response.json();
      if (typeof data.error === 'string') message = data.error;
    }
    throw new ExamApiError(message, response.status);
  }
  const result = await (file ? response.blob() : response.json());
  if (!sameAccount()) throw new Error('Matrix account changed during the request');
  return result;
}

export const examApi = {
  aiStatus: async () => {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Exam service unavailable');
    const config = await response.json();
    return config.aiProvider || 'disabled';
  },
  assistant: (message, consent, history) => request('/api/assistant', { method: 'POST', body: { message, consent, history } }),
  me: () => request('/api/me'),
  qualify: rows => request('/api/practice', { method: 'POST', body: { rows } }),
  practices: () => request('/api/practices'),
  completePractice: (id, answers) => request(`/api/practices/${encodeURIComponent(id)}/complete`, { method: 'POST', body: { answers } }),
  publishPractice: definition => request('/api/admin/practices', { method: 'POST', body: { definition } }),
  setPracticeActive: (id, active) => request(`/api/admin/practices/${encodeURIComponent(id)}`, { method: 'POST', body: { active } }),
  cryptoSearch: query => request(`/api/crypto/search?q=${encodeURIComponent(query)}`),
  cryptoQuote: symbol => request(`/api/crypto/quote?symbol=${encodeURIComponent(symbol)}`),
  cryptoWatchlist: () => request('/api/crypto/watchlist'),
  updateCryptoWatchlist: (symbol, add) => request('/api/crypto/watchlist', { method: 'POST', body: { symbol, add } }),
  cryptoPortfolio: () => request('/api/crypto/portfolio'),
  cryptoValuations: () => request('/api/crypto/valuations'),
  cryptoHistory: page => request(`/api/crypto/history?page=${page}`),
  cryptoClosedPositions: page => request(`/api/crypto/closed?page=${page}`),
  cryptoPublicTrades: page => request(`/api/crypto/trades?page=${page}`),
  cryptoOpen: input => request('/api/crypto/open', { method: 'POST', body: input }),
  cryptoClose: input => request('/api/crypto/close', { method: 'POST', body: input }),
  exams: () => request('/api/exams'),
  start: id => request(`/api/exams/${encodeURIComponent(id)}/start`, { method: 'POST' }),
  attempt: id => request(`/api/attempts/${encodeURIComponent(id)}`),
  submit: (id, answers) => request(`/api/attempts/${encodeURIComponent(id)}/submit`, { method: 'POST', body: { answers } }),
  leaderboard: () => request('/api/leaderboard'),
  results: () => request('/api/results'),
  publish: (definition, files) => request('/api/admin/exams', { method: 'POST', body: { definition, files } }),
  file: (examId, fileId) => request(`/api/exams/${encodeURIComponent(examId)}/files/${encodeURIComponent(fileId)}`, { file: true }),
};
