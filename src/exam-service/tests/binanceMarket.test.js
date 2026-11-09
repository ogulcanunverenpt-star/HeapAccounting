import test from 'node:test';
import assert from 'node:assert/strict';
import { createBinanceMarket } from '../binanceMarket.js';

test('Binance discovery filters contracts and shares requests; stale prices fail closed', async () => {
  let now = 1700000000000;
  const requests = [];
  let quoteTime = now;
  const fetchImpl = async url => {
    requests.push(url);
    if (url.endsWith('/exchangeInfo')) return {
      ok: true, json: async () => ({ symbols: [
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
        { symbol: 'OLDUSDT', baseAsset: 'OLD', quoteAsset: 'USDT', status: 'BREAK', contractType: 'PERPETUAL' },
        { symbol: 'BTCUSDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'TRADING', contractType: 'PERPETUAL' },
      ] }),
    };
    return { ok: true, json: async () => ({ symbol: 'BTCUSDT', markPrice: '77746.125', time: quoteTime }) };
  };
  const market = createBinanceMarket({ fetchImpl, now: () => now });
  const [one, two] = await Promise.all([market.search('BTC'), market.search('ETH')]);
  assert.deepEqual(one.map(item => item.symbol), ['BTCUSDT']);
  assert.deepEqual(two.map(item => item.symbol), ['ETHUSDT']);
  assert.equal(requests.length, 1);
  const prices = await Promise.all(Array.from({ length: 10 }, () => market.quote('BTCUSDT')));
  assert.equal(prices[0].price, 77746.125);
  assert.equal(requests.length, 2);
  await assert.rejects(market.quote('OLDUSDT'), /not found/);
  await assert.rejects(market.quote('BTCUSDT/../../'), /Invalid Binance symbol/);
  await assert.rejects(market.search('BTC&symbol=ETH'), /Invalid Binance search/);
  now += 16000;
  await assert.rejects(market.quote('BTCUSDT'), /stale/);
  quoteTime = now;
  assert.equal((await market.quote('BTCUSDT')).quoteAt, now);
});

test('Binance errors are explicit', async () => {
  const market = createBinanceMarket({ fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(market.search('BTC'), error => error.status === 503 && /429/.test(error.message));
});

test('WebSocket mark prices are shared and stale or future events are rejected', async () => {
  let time = 1700000000000, socket, requests = 0;
  class MockSocket {
    constructor(url) { this.url = url; this.listeners = {}; socket = this; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    emit(name, event = {}) { this.listeners[name]?.(event); }
    close() { this.emit('close'); }
  }
  const market = createBinanceMarket({
    now: () => time, Socket: MockSocket,
    fetchImpl: async url => {
      requests++;
      if (url.endsWith('exchangeInfo')) return { ok: true, json: async () => ({ symbols: [
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
      ] }) };
      return { ok: true, json: async () => ({ symbol: 'BTCUSDT', markPrice: '101.00', time }) };
    },
  });
  market.start();
  assert.equal(socket.url, 'wss://fstream.binance.com/market/ws/!markPrice@arr@1s');
  socket.emit('message', { data: JSON.stringify([{ s: 'BTCUSDT', p: '100.00', E: time }]) });
  assert.equal((await market.quote('BTCUSDT')).priceText, '100.00');
  assert.equal(requests, 1);
  socket.emit('message', { data: JSON.stringify([{ s: 'BTCUSDT', p: '999.00', E: time + 10000 }]) });
  assert.equal((await market.quote('BTCUSDT')).priceText, '100.00');
  time += 3000;
  assert.equal((await market.quote('BTCUSDT')).priceText, '101.00');
  assert.equal(requests, 2);
  market.stop();
});

test('USDT/TRY conversion uses a recent Binance trade and shares concurrent requests', async () => {
  let time = 1700000000000, tradeTime = time, calls = 0;
  const market = createBinanceMarket({
    now: () => time,
    fetchImpl: async url => {
      assert.match(url, /data-api\.binance\.vision/);
      calls++;
      return { ok: true, json: async () => [{ price: '50.25000000', time: tradeTime }] };
    },
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => market.tryRate()));
  assert.equal(results[0].priceText, '50.25000000');
  assert.equal(calls, 1);
  time += 16000;
  await assert.rejects(market.tryRate(), /stale/);
  tradeTime = time + 2000;
  await assert.rejects(market.tryRate(), /stale/);
});
