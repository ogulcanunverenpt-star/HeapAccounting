import { HttpError } from './examService.js';

const FUTURES = 'https://fapi.binance.com';
const SPOT = 'https://data-api.binance.vision';
const SYMBOL = /^[A-Z0-9]{2,30}$/;

export function createBinanceMarket({ fetchImpl = fetch, now = Date.now, Socket = globalThis.WebSocket } = {}) {
  let instruments = null;
  let instrumentsUntil = 0;
  let instrumentsPending;
  const quotes = new Map();
  const pending = new Map();
  let rate;
  let ratePending;
  let socket;
  let reconnect;
  let watchdog;
  let lastStreamAt = 0;
  let stopped = true;
  let retryMs = 1000;

  function connect() {
    if (stopped) return;
    try {
      socket = new Socket('wss://fstream.binance.com/market/ws/!markPrice@arr@1s');
      lastStreamAt = now();
    } catch (error) {
      console.error('Binance WebSocket connection failed:', error.message);
      reconnect = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
      return;
    }
    socket.addEventListener('open', () => { retryMs = 1000; });
    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string') {
        console.error('Invalid Binance WebSocket message type');
        return;
      }
      let updates;
      try { updates = JSON.parse(event.data); }
      catch (error) { console.error('Invalid Binance WebSocket JSON:', error.message); return; }
      if (!Array.isArray(updates)) { console.error('Invalid Binance mark-price stream'); return; }
      const receivedAt = now();
      lastStreamAt = receivedAt;
      for (const update of updates) {
        const price = Number(update.p), quoteAt = Number(update.E);
        if (typeof update.s !== 'string' || !SYMBOL.test(update.s) || typeof update.p !== 'string' ||
            !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(quoteAt) ||
            quoteAt < receivedAt - 15000 || quoteAt > receivedAt + 1000) continue;
        const previous = quotes.get(update.s);
        if (!previous || quoteAt >= previous.quoteAt) quotes.set(update.s, {
          symbol: update.s, price, priceText: update.p, quoteAt, receivedAt,
        });
      }
    });
    socket.addEventListener('error', () => console.error('Binance WebSocket error; REST fallback remains available'));
    socket.addEventListener('close', () => {
      socket = undefined;
      if (stopped) return;
      console.error(`Binance WebSocket disconnected; retrying in ${retryMs}ms`);
      reconnect = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    });
  }

  async function get(path, base = FUTURES) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        signal: AbortSignal.timeout(10000), redirect: 'error',
      });
    } catch (error) {
      console.error('Binance market request failed:', error.message);
      throw new HttpError(503, 'Binance market data unavailable');
    }
    if (!response.ok) throw new HttpError(503, `Binance market data unavailable (HTTP ${response.status})`);
    try {
      return await response.json();
    } catch (error) {
      console.error('Invalid Binance response:', error.message);
      throw new HttpError(503, 'Invalid Binance market response');
    }
  }

  async function list() {
    if (instruments && now() < instrumentsUntil) return instruments;
    if (!instrumentsPending) {
      instrumentsPending = (async () => {
        const data = await get('/fapi/v1/exchangeInfo');
        if (!Array.isArray(data.symbols)) throw new HttpError(503, 'Invalid Binance instrument list');
        const items = data.symbols.filter(item =>
          typeof item.symbol === 'string' && SYMBOL.test(item.symbol) &&
          item.contractType === 'PERPETUAL' && item.quoteAsset === 'USDT' &&
          item.status === 'TRADING' && typeof item.baseAsset === 'string',
        ).map(item => ({ symbol: item.symbol, baseAsset: item.baseAsset, quoteAsset: item.quoteAsset }));
        if (!items.length) throw new HttpError(503, 'Binance instrument list is empty');
        instruments = items;
        instrumentsUntil = now() + 60 * 60 * 1000;
        return items;
      })().finally(() => { instrumentsPending = undefined; });
    }
    return instrumentsPending;
  }

  async function quote(symbol) {
    if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) throw new HttpError(400, 'Invalid Binance symbol');
    if (!(await list()).some(item => item.symbol === symbol)) throw new HttpError(404, 'Binance contract not found');
    const cached = quotes.get(symbol);
    if (cached && now() >= cached.receivedAt && now() - cached.receivedAt < 2000 &&
        cached.quoteAt >= now() - 15000 && cached.quoteAt <= now() + 1000) return cached;
    if (!pending.has(symbol)) {
      pending.set(symbol, (async () => {
        const data = await get(`/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`);
        const price = Number(data.markPrice);
        const quoteAt = Number(data.time);
        const receivedAt = now();
        if (data.symbol !== symbol || !Number.isFinite(price) || price <= 0 ||
            !Number.isSafeInteger(quoteAt) || quoteAt < receivedAt - 15000 || quoteAt > receivedAt + 1000) {
          throw new HttpError(503, 'Binance mark price is invalid or stale');
        }
        const result = { symbol, price, priceText: data.markPrice, quoteAt, receivedAt };
        quotes.set(symbol, result);
        return result;
      })().finally(() => pending.delete(symbol)));
    }
    return pending.get(symbol);
  }

  return {
    start() {
      if (!stopped) return;
      if (typeof Socket !== 'function') throw new Error('WebSocket support is unavailable');
      stopped = false;
      connect();
      watchdog = setInterval(() => {
        if (socket && now() - lastStreamAt > 15000) {
          console.error('Binance WebSocket is stalled; reconnecting');
          socket.close();
        }
      }, 5000);
      watchdog.unref();
    },
    stop() {
      stopped = true;
      clearTimeout(reconnect);
      clearInterval(watchdog);
      if (socket) socket.close();
    },
    async search(query) {
      if (typeof query !== 'string' || !/^[A-Z0-9]{0,30}$/.test(query)) throw new HttpError(400, 'Invalid Binance search');
      return (await list()).filter(item => item.symbol.includes(query)).slice(0, 30);
    },
    quote,
    async tryRate() {
      if (rate && now() >= rate.receivedAt && now() - rate.receivedAt < 2000 &&
          rate.quoteAt >= now() - 15000 && rate.quoteAt <= now() + 1000) return rate;
      if (!ratePending) {
        ratePending = (async () => {
          const data = await get('/api/v3/trades?symbol=USDTTRY&limit=1', SPOT);
          const trade = Array.isArray(data) && data.length === 1 ? data[0] : null;
          const price = Number(trade?.price), quoteAt = Number(trade?.time), receivedAt = now();
          if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(quoteAt) ||
              quoteAt < receivedAt - 15000 || quoteAt > receivedAt + 1000) {
            throw new HttpError(503, 'Binance USDT/TRY price is invalid or stale');
          }
          rate = { price, priceText: trade.price, quoteAt, receivedAt };
          return rate;
        })().finally(() => { ratePending = undefined; });
      }
      return ratePending;
    },
  };
}
