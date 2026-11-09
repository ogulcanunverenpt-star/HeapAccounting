import { randomUUID } from 'node:crypto';
import { HttpError, transaction } from './examService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYMBOL = /^[A-Z0-9]{2,30}$/;
const SCALE = 100000000n;
const FUNDING_PERIOD_MS = 8 * 60 * 60 * 1000;
const LIMIT = 1000000000000;

function scaled(value) {
  if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,16})?$/.test(value)) throw new HttpError(503, 'Invalid market price');
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * SCALE + BigInt((fraction + '00000000').slice(0, 8));
  if (result <= 0n) throw new HttpError(503, 'Market price precision is unsupported');
  return result;
}

function fresh(quote, now) {
  if (!quote || !Number.isSafeInteger(quote.quoteAt) || quote.quoteAt < now - 15000 || quote.quoteAt > now + 1000) {
    throw new HttpError(503, 'Market price is stale or the system clock is incorrect');
  }
  return scaled(quote.priceText);
}

function amount(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || Math.abs(result) > LIMIT) throw new HttpError(409, 'Portfolio limit exceeded');
  return result;
}

function values(position, price, now) {
  const entry = scaled(position.entry_price);
  const notional = BigInt(position.margin_cents) * BigInt(position.leverage);
  const periods = BigInt(Math.max(0, Math.floor((now - Number(position.opened_ms)) / FUNDING_PERIOD_MS)));
  const funding = notional * periods / 10000n;
  const direction = position.side === 'long' ? 1n : -1n;
  const pnl = notional * (price - entry) * direction / entry;
  const equity = BigInt(position.margin_cents) + pnl - funding;
  const maintenance = (notional + 199n) / 200n;
  return { funding, pnl, equity, liquidate: equity <= maintenance };
}

function publicPosition(row) {
  return {
    id: row.id, symbol: row.symbol, side: row.side, leverage: row.leverage,
    marginCents: Number(row.margin_cents), entryPrice: row.entry_price,
    openedAt: Number(row.opened_ms), status: row.status, closePrice: row.close_price,
    closedAt: row.closed_ms === null ? null : Number(row.closed_ms),
    fundingCents: row.funding_cents === null ? null : Number(row.funding_cents),
    realizedCents: row.realized_cents === null ? null : Number(row.realized_cents),
    tryRate: row.try_rate, ratingAfter: row.rating_after,
  };
}

export function createCryptoService(pool, exam, market, { now = Date.now } = {}) {
  const sqlite = pool.dialect === 'sqlite';
  const lock = sqlite ? '' : ' FOR UPDATE';

  async function ensureWallet(userId) {
    if (!(await exam.profile(userId, false)).primeUnlocked) throw new HttpError(403, 'Reach 500 Elo to unlock Prime');
    await pool.query('INSERT INTO crypto_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  }
  async function locked(connection, userId) {
    const player = await connection.query(`SELECT rating FROM exam_players WHERE user_id = $1${lock}`, [userId]);
    const wallet = await connection.query(`SELECT * FROM crypto_wallets WHERE user_id = $1${lock}`, [userId]);
    if (!player.rows.length || !wallet.rows.length) throw new HttpError(403, 'Reach 500 Elo to unlock Prime');
    return { player: player.rows[0], wallet: wallet.rows[0] };
  }
  async function replay(connection, userId, requestId, fingerprint) {
    const result = await connection.query('SELECT position_id, fingerprint FROM crypto_transactions WHERE user_id = $1 AND request_id = $2', [userId, requestId]);
    if (!result.rows.length) return null;
    if (result.rows[0].fingerprint !== fingerprint) throw new HttpError(409, 'Request ID already used for a different operation');
    return { positionId: result.rows[0].position_id, replayed: true };
  }
  async function settle(connection, userId, player, wallet, position, quote, fx, requestId, fingerprint, automatic) {
    const time = now();
    const price = fresh(quote, time), rate = fresh(fx, time);
    const calculation = values(position, price, time);
    const liquidation = calculation.liquidate;
    if (automatic && !liquidation) return null;
    const margin = BigInt(position.margin_cents);
    const realized = calculation.equity < 0n ? -margin : calculation.equity - margin;
    const realizedCents = amount(realized);
    const tryCents = amount(realized * rate / SCALE);
    const cumulative = amount(BigInt(wallet.realized_try_cents) + BigInt(tryCents));
    const units = Math.trunc(cumulative / 100000);
    const rating = Math.min(100000, Math.max(0, player.rating + (units - Number(wallet.score_units)) * 10));
    const cash = amount(BigInt(wallet.cash_cents) + margin + realized);
    const state = liquidation ? 'liquidated' : 'closed';
    await connection.query(
      'UPDATE crypto_positions SET status = $1, close_price = $2, closed_ms = $3, funding_cents = $4, realized_cents = $5, try_rate = $6, rating_after = $7 WHERE id = $8',
      [state, quote.priceText, time, amount(calculation.funding), realizedCents, fx.priceText, rating, position.id],
    );
    await connection.query('UPDATE crypto_wallets SET cash_cents = $1, realized_try_cents = $2, score_units = $3 WHERE user_id = $4', [cash, cumulative, units, userId]);
    await connection.query('UPDATE exam_players SET rating = $1 WHERE user_id = $2', [rating, userId]);
    await connection.query('INSERT INTO crypto_transactions (id, request_id, user_id, position_id, action, fingerprint, executed_ms) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), requestId, userId, position.id, liquidation ? 'liquidation' : 'close', fingerprint, time]);
    return { positionId: position.id, status: state, realizedCents, ratingAfter: rating, replayed: false };
  }

  return {
    async portfolio(userId) {
      await ensureWallet(userId);
      const wallet = await pool.query('SELECT cash_cents, realized_try_cents FROM crypto_wallets WHERE user_id = $1', [userId]);
      const positions = await pool.query("SELECT * FROM crypto_positions WHERE user_id = $1 AND status = 'open' ORDER BY opened_ms DESC, id DESC", [userId]);
      return { cashCents: Number(wallet.rows[0].cash_cents), realizedTryCents: Number(wallet.rows[0].realized_try_cents), positions: positions.rows.map(publicPosition) };
    },
    async valuations(userId) {
      const portfolio = await this.portfolio(userId);
      const symbols = [...new Set(portfolio.positions.map(position => position.symbol))];
      const quotes = new Map(await Promise.all(symbols.map(async symbol => {
        try {
          return [symbol, { quote: await market.quote(symbol) }];
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          return [symbol, { error: error.message }];
        }
      })));
      const time = now();
      const positions = portfolio.positions.map(position => {
        const result = quotes.get(position.symbol);
        if (result.error) return { ...position, valuation: null, quoteError: result.error };
        let price;
        try { price = fresh(result.quote, time); }
        catch (error) {
          if (!(error instanceof HttpError)) throw error;
          return { ...position, valuation: null, quoteError: error.message };
        }
        const calculation = values({
          entry_price: position.entryPrice, margin_cents: position.marginCents,
          leverage: position.leverage, opened_ms: position.openedAt, side: position.side,
        }, price, time);
        const margin = BigInt(position.marginCents);
        const net = calculation.equity < 0n ? -margin : calculation.equity - margin;
        return { ...position, valuation: {
          markPrice: result.quote.priceText, quoteAt: result.quote.quoteAt,
          unrealizedCents: amount(net), fundingCents: amount(calculation.funding),
          liquidationTriggered: calculation.liquidate,
        }, quoteError: null };
      });
      return { ...portfolio, positions, snapshotAt: time };
    },
    async history(userId, page = 0) {
      if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) throw new HttpError(400, 'Invalid page');
      await ensureWallet(userId);
      const result = await pool.query('SELECT p.*, t.action, t.executed_ms FROM crypto_transactions t JOIN crypto_positions p ON p.id = t.position_id WHERE t.user_id = $1 ORDER BY t.executed_ms DESC, t.id DESC LIMIT 50 OFFSET $2', [userId, page * 50]);
      return result.rows.map(row => ({ ...publicPosition(row), action: row.action, executedAt: Number(row.executed_ms) }));
    },
    async closedPositions(userId, page = 0) {
      if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) throw new HttpError(400, 'Invalid page');
      await ensureWallet(userId);
      const result = await pool.query("SELECT * FROM crypto_positions WHERE user_id = $1 AND status <> 'open' ORDER BY closed_ms DESC, id DESC LIMIT 50 OFFSET $2", [userId, page * 50]);
      return result.rows.map(publicPosition);
    },
    async publicHistory(page = 0) {
      if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) throw new HttpError(400, 'Invalid page');
      const result = await pool.query('SELECT p.*, t.user_id AS trader_id, t.action, t.executed_ms FROM crypto_transactions t JOIN crypto_positions p ON p.id = t.position_id ORDER BY t.executed_ms DESC, t.id DESC LIMIT 50 OFFSET $1', [page * 50]);
      return result.rows.map(row => ({ ...publicPosition(row), userId: row.trader_id, action: row.action, executedAt: Number(row.executed_ms) }));
    },
    async open(userId, input) {
      if (!input || !UUID.test(input.requestId ?? '') || !SYMBOL.test(input.symbol ?? '') ||
          !['long', 'short'].includes(input.side) || !Number.isInteger(input.leverage) || input.leverage < 1 || input.leverage > 10 ||
          !Number.isSafeInteger(input.marginCents) || input.marginCents < 100 || input.marginCents > 10000000000) throw new HttpError(400, 'Invalid position');
      const requestId = input.requestId.toLowerCase();
      const fingerprint = JSON.stringify(['open', input.symbol, input.side, input.leverage, input.marginCents]);
      await ensureWallet(userId);
      const previous = await replay(pool, userId, requestId, fingerprint);
      if (previous) return previous;
      const [quote, fx] = await Promise.all([market.quote(input.symbol), market.tryRate()]);
      return transaction(pool, async connection => {
        const { wallet } = await locked(connection, userId);
        const duplicate = await replay(connection, userId, requestId, fingerprint);
        if (duplicate) return duplicate;
        fresh(quote, now());
        fresh(fx, now());
        if (Number(wallet.cash_cents) < input.marginCents) throw new HttpError(409, 'Insufficient virtual USDT');
        const count = await connection.query("SELECT COUNT(*) AS count FROM crypto_positions WHERE user_id = $1 AND status = 'open'", [userId]);
        if (Number(count.rows[0].count) >= 100) throw new HttpError(409, 'Open position limit reached');
        const id = randomUUID(), time = now();
        await connection.query('INSERT INTO crypto_positions (id, user_id, symbol, side, leverage, margin_cents, entry_price, opened_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [id, userId, input.symbol, input.side, input.leverage, input.marginCents, quote.priceText, time]);
        await connection.query('UPDATE crypto_wallets SET cash_cents = $1 WHERE user_id = $2', [Number(wallet.cash_cents) - input.marginCents, userId]);
        await connection.query('INSERT INTO crypto_transactions (id, request_id, user_id, position_id, action, fingerprint, executed_ms) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [randomUUID(), requestId, userId, id, 'open', fingerprint, time]);
        return { positionId: id, replayed: false };
      });
    },
    async close(userId, input) {
      if (!input || !UUID.test(input.requestId ?? '') || !UUID.test(input.positionId ?? '')) throw new HttpError(400, 'Invalid close request');
      const requestId = input.requestId.toLowerCase(), positionId = input.positionId.toLowerCase();
      const fingerprint = JSON.stringify(['close', positionId]);
      await ensureWallet(userId);
      const previous = await replay(pool, userId, requestId, fingerprint);
      if (previous) return previous;
      const found = await pool.query('SELECT symbol, status FROM crypto_positions WHERE id = $1 AND user_id = $2', [positionId, userId]);
      if (!found.rows.length) throw new HttpError(404, 'Position not found');
      if (found.rows[0].status !== 'open') throw new HttpError(409, 'Position is already closed');
      const [quote, fx] = await Promise.all([market.quote(found.rows[0].symbol), market.tryRate()]);
      return transaction(pool, async connection => {
        const { player, wallet } = await locked(connection, userId);
        const duplicate = await replay(connection, userId, requestId, fingerprint);
        if (duplicate) return duplicate;
        const result = await connection.query(`SELECT * FROM crypto_positions WHERE id = $1 AND user_id = $2${lock}`, [positionId, userId]);
        if (!result.rows.length) throw new HttpError(404, 'Position not found');
        if (result.rows[0].status !== 'open') throw new HttpError(409, 'Position is already closed');
        return settle(connection, userId, player, wallet, result.rows[0], quote, fx, requestId, fingerprint, false);
      });
    },
    async monitor() {
      const result = await pool.query("SELECT id, user_id, symbol FROM crypto_positions WHERE status = 'open' ORDER BY symbol, id");
      const failedSymbols = new Set();
      for (const position of result.rows) {
        if (failedSymbols.has(position.symbol)) continue;
        try {
          const quote = await market.quote(position.symbol);
          const current = await pool.query('SELECT * FROM crypto_positions WHERE id = $1', [position.id]);
          if (!current.rows.length || current.rows[0].status !== 'open') continue;
          if (!values(current.rows[0], fresh(quote, now()), now()).liquidate) continue;
          const fx = await market.tryRate();
          await transaction(pool, async connection => {
            const { player, wallet } = await locked(connection, position.user_id);
            const found = await connection.query(`SELECT * FROM crypto_positions WHERE id = $1${lock}`, [position.id]);
            if (!found.rows.length || found.rows[0].status !== 'open') return;
            await settle(connection, position.user_id, player, wallet, found.rows[0], quote, fx, randomUUID(), JSON.stringify(['liquidation', position.id]), true);
          });
        } catch (error) {
          console.error(`Crypto monitor failed for ${position.symbol} position ${position.id}:`, error.message);
          failedSymbols.add(position.symbol);
        }
      }
    },
  };
}
