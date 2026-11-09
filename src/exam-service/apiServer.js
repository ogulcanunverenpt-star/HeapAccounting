import http from 'node:http';
import { HttpError } from './examService.js';

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
  });
  response.end(JSON.stringify(value));
}

async function body(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new HttpError(415, 'Expected application/json');
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 15 * 1024 * 1024) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON'); }
}

async function authenticate(request, matrixBase) {
  const header = request.headers.authorization ?? '';
  if (!/^Bearer [^\s]{1,4096}$/.test(header)) throw new HttpError(401, 'Matrix access token required');
  let response;
  try {
    response = await fetch(`${matrixBase}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: header }, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error('Matrix identity verification failed:', error.message);
    throw new HttpError(503, 'Matrix authentication unavailable');
  }
  if (response.status === 401 || response.status === 403) throw new HttpError(401, 'Invalid Matrix session');
  if (!response.ok) throw new HttpError(503, 'Matrix authentication unavailable');
  let data;
  try { data = await response.json(); } catch { throw new HttpError(503, 'Invalid Matrix identity response'); }
  if (typeof data.user_id !== 'string' || !/^@[^:\s]+:[^\s]+$/.test(data.user_id) || data.user_id.length > 255) {
    throw new HttpError(503, 'Invalid Matrix identity response');
  }
  return data.user_id;
}

export function createExamHttpServer({ service, matrixBase, admins, assistant = { provider: 'disabled' }, cryptoMarket, cryptoService }) {
  return http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    if (request.method === 'GET' && path === '/api/config') return json(response, 200, { matrixBaseUrl: matrixBase, aiProvider: assistant.provider });
    if (!path.startsWith('/api/')) throw new HttpError(404, 'Not found');
    const user = await authenticate(request, matrixBase);
    const admin = admins.has(user);
    if (request.method === 'POST' && path === '/api/assistant') {
      if (assistant.provider === 'disabled') throw new HttpError(503, 'AI assistant is not configured');
      const input = await body(request);
      const lease = await service.acquireAssistant(user);
      let result;
      try { result = await assistant.respond(user, input); }
      finally { await service.releaseAssistant(user, lease); }
      return json(response, 200, result);
    }
    if (request.method === 'GET' && path === '/api/me') return json(response, 200, await service.profile(user, admin));
    if (request.method === 'POST' && path === '/api/practice') {
      const input = await body(request);
      return json(response, 200, await service.qualify(user, input?.rows));
    }
    if (request.method === 'GET' && path === '/api/practices') return json(response, 200, await service.practices(user, admin));
    if (request.method === 'POST' && path === '/api/admin/practices') {
      if (!admin) throw new HttpError(403, 'Administrator access required');
      const input = await body(request);
      return json(response, 201, await service.createPractice(user, input?.definition));
    }
    if (request.method === 'GET' && path === '/api/exams') return json(response, 200, await service.listExams(user));
    if (request.method === 'GET' && path === '/api/leaderboard') return json(response, 200, await service.leaderboard());
    if (request.method === 'GET' && path === '/api/results') return json(response, 200, await service.myResults(user));
    if (path.startsWith('/api/crypto/')) {
      if (!cryptoMarket) throw new HttpError(503, 'Binance market data unavailable');
      if (request.method === 'GET' && path === '/api/crypto/trades') {
        if (!cryptoService) throw new HttpError(503, 'Crypto trading unavailable');
        return json(response, 200, await cryptoService.publicHistory(Number(url.searchParams.get('page') ?? 0)));
      }
      if (!(await service.profile(user, admin)).primeUnlocked) throw new HttpError(403, 'Reach 500 Elo to unlock Prime');
      if (request.method === 'GET' && path === '/api/crypto/search') return json(response, 200, await cryptoMarket.search(url.searchParams.get('q') ?? ''));
      if (request.method === 'GET' && path === '/api/crypto/quote') return json(response, 200, await cryptoMarket.quote(url.searchParams.get('symbol')));
      if (request.method === 'GET' && path === '/api/crypto/watchlist') return json(response, 200, await service.cryptoWatchlist(user));
      if (request.method === 'GET' && path === '/api/crypto/portfolio') {
        if (!cryptoService) throw new HttpError(503, 'Crypto trading unavailable');
        return json(response, 200, await cryptoService.portfolio(user));
      }
      if (request.method === 'GET' && path === '/api/crypto/valuations') {
        if (!cryptoService) throw new HttpError(503, 'Crypto trading unavailable');
        return json(response, 200, await cryptoService.valuations(user));
      }
      if (request.method === 'GET' && path === '/api/crypto/history') {
        if (!cryptoService) throw new HttpError(503, 'Crypto trading unavailable');
        return json(response, 200, await cryptoService.history(user, Number(url.searchParams.get('page') ?? 0)));
      }
      if (request.method === 'GET' && path === '/api/crypto/closed') {
        if (!cryptoService) throw new HttpError(503, 'Crypto trading unavailable');
        return json(response, 200, await cryptoService.closedPositions(user, Number(url.searchParams.get('page') ?? 0)));
      }
      if (request.method === 'POST' && path === '/api/crypto/open') {
        if (!cryptoService) throw new HttpError(503, 'Crypto trading unavailable');
        return json(response, 200, await cryptoService.open(user, await body(request)));
      }
      if (request.method === 'POST' && path === '/api/crypto/close') {
        if (!cryptoService) throw new HttpError(503, 'Crypto trading unavailable');
        return json(response, 200, await cryptoService.close(user, await body(request)));
      }
      if (request.method === 'POST' && path === '/api/crypto/watchlist') {
        const input = await body(request);
        if (input?.add === true) {
          if (typeof input.symbol !== 'string' || !(await cryptoMarket.search(input.symbol)).some(item => item.symbol === input.symbol)) {
            throw new HttpError(400, 'Unknown Binance contract');
          }
        }
        return json(response, 200, await service.updateCryptoWatchlist(user, input?.symbol, input?.add));
      }
    }
    if (request.method === 'POST' && path === '/api/admin/exams') {
      if (!admin) throw new HttpError(403, 'Administrator access required');
      const input = await body(request);
      return json(response, 201, await service.createExam(user, input?.definition, input?.files ?? []));
    }
    let match = path.match(new RegExp(`^/api/admin/practices/(${uuid})$`));
    if (request.method === 'POST' && match) {
      if (!admin) throw new HttpError(403, 'Administrator access required');
      const input = await body(request);
      return json(response, 200, await service.setPracticeActive(match[1], input?.active));
    }
    match = path.match(new RegExp(`^/api/practices/(${uuid})/complete$`));
    if (request.method === 'POST' && match) {
      const input = await body(request);
      return json(response, 200, await service.completePractice(user, match[1], input?.answers));
    }
    match = path.match(new RegExp(`^/api/exams/(${uuid})/start$`));
    if (request.method === 'POST' && match) return json(response, 201, await service.start(user, match[1]));
    match = path.match(new RegExp(`^/api/attempts/(${uuid})$`));
    if (request.method === 'GET' && match) return json(response, 200, await service.attempt(user, match[1]));
    match = path.match(new RegExp(`^/api/attempts/(${uuid})/submit$`));
    if (request.method === 'POST' && match) {
      const input = await body(request);
      return json(response, 200, await service.submit(user, match[1], input?.answers));
    }
    match = path.match(new RegExp(`^/api/exams/(${uuid})/files/(${uuid})$`));
    if (request.method === 'GET' && match) {
      const file = await service.file(user, match[1], match[2]);
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Content-Length': file.content.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      });
      return response.end(file.content);
    }
    throw new HttpError(404, 'Not found');
  } catch (error) {
    if (error instanceof HttpError) return json(response, error.status, { error: error.message });
    console.error('Exam API error:', error);
    if (!response.headersSent) return json(response, 500, { error: 'Internal server error' });
    response.destroy();
  }
  });
}
