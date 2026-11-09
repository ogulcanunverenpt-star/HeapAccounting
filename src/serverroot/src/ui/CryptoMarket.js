import { examApi, ExamApiError } from '../client/examApi.js';
import { getActiveAccount } from '../store/state.js';

const copy = {
  tr: {
    title: 'PRIME / KRİPTO ARENA', locked: 'Kripto arenası 500 Elo ile açılır.',
    notice: 'Binance USDⓈ-M sürekli vadeli sözleşmeleri · USDT cinsinden mark fiyatı',
    unavailable: 'Sanal oyun: gerçek emir gönderilmez. İşlemler ve Matrix kullanıcı adın diğer oyunculara görünür. 100.000 USDT başlangıç · İzole teminat · En fazla 10x · Komisyon yok. Bakım teminatı %0,5; long ve short her 8 saatte pozisyon büyüklüğünün %0,01’i kadar fonlama öder. Tasfiye yalnızca sunucunun gördüğü fiyatlarda yapılır; kesintideki hareketler kaçırılabilir. Açılış, kapanış ve tasfiye için güncel USDT/TRY kuru gerekir. 1.000 TL net gerçekleşen kâr/zarar ±10 Elo.',
    search: 'Sözleşme ara', placeholder: 'Örn. BTC', searchButton: 'Ara', noResults: 'Sonuç bulunamadı.',
    watch: 'Takip listesi', empty: 'Takip listen boş.', add: 'Takibe ekle', remove: 'Takipten çıkar',
    mark: 'Mark fiyatı', updated: 'Veri zamanı', loading: 'Yükleniyor…',
    chart: 'TradingView grafiği ayrı bir kaynaktır; fiyatlar farklı görünebilir. Grafiği açmak sözleşme kodunu TradingView’e gönderir.',
    error: 'Kripto arenası:', select: 'Bir sözleşme seç.', wallet: 'Sanal bakiye', realized: 'Gerçekleşen net sonuç',
    tradeTitle: 'İŞLEM TERMİNALİ', tradeIntro: 'Pozisyonlarını, canlı fiyatları ve arena hareketlerini tek ekranda takip et.',
    live: 'CANLI', livePnl: 'Açık pozisyon K/Z', equity: 'Tahmini varlık', notAvailable: 'Fiyat kullanılamıyor',
    awaiting: 'Pozisyon bekleniyor', roi: 'Teminat getirisi', danger: 'Tasfiye eşiği görüldü; sunucu işlemi değerlendiriyor',
    timeout: 'İstek zaman aşımına uğradı.',
    outdatedService: 'Canlı değerleme API’si bulunamadı. Sınav servisini güncel sürümle yeniden başlatın.',
    closeConfirmTitle: 'Pozisyonu kapatmak istiyor musun?',
    closeConfirmMessage: 'Sanal pozisyon güncel sunucu fiyatıyla kapatılacak; gerçekleşen fiyat değişebilir.',
    confirmClose: 'Evet, pozisyonu kapat', cancel: 'Vazgeç',
    positions: 'Açık pozisyonlar', noPositions: 'Açık pozisyon yok.', closedPositions: 'Kapalı pozisyonlar', noClosed: 'Kapalı pozisyon yok.', margin: 'Teminat (USDT)', leverage: 'Kaldıraç',
    long: 'Sanal AL / LONG', short: 'Sanal SAT / SHORT', close: 'Pozisyonu kapat', entry: 'Giriş', pnl: 'Tahmini gerçekleşmemiş sonuç',
    history: 'İşlem geçmişim', publicHistory: 'Herkese açık işlemler', noHistory: 'Henüz işlem yok.', previous: 'Önceki', next: 'Sonraki',
    completed: 'Sanal işlem kaydedildi.', pending: 'Önceki işlemin sonucu belirsiz. Aynı işlemi tekrar deneyebilir veya geçmişini kontrol ettikten sonra bekleyen isteği temizleyebilirsin.',
    clear: 'Geçmişi kontrol ettim; bekleyen isteği temizle', open: 'Açılış', closed: 'Kapanış', liquidation: 'Tasfiye',
    funding: 'Fonlama', closedStatus: 'Kapalı', liquidatedStatus: 'Tasfiye edildi', openStatus: 'Açık',
  },
  en: {
    title: 'PRIME / CRYPTO ARENA', locked: 'The crypto arena unlocks at 500 Elo.',
    notice: 'Binance USDⓈ-M perpetual contracts · USDT mark price',
    unavailable: 'Simulation only: no real orders. Transactions and your Matrix user ID are visible to other players. 100,000 USDT initial balance · Isolated margin · Up to 10x · No commission. Maintenance margin is 0.5%; long and short both pay 0.01% of notional every 8 hours. Liquidation uses observed server prices only; moves during outages may be missed. Opening, closing and liquidation require a fresh USDT/TRY rate. Every TRY 1,000 net realized profit/loss changes Elo by ±10.',
    search: 'Search contracts', placeholder: 'E.g. BTC', searchButton: 'Search', noResults: 'No results found.',
    watch: 'Watchlist', empty: 'Your watchlist is empty.', add: 'Add to watchlist', remove: 'Remove from watchlist',
    mark: 'Mark price', updated: 'Data time', loading: 'Loading…',
    chart: 'The TradingView chart is a separate source; prices may differ. Opening it sends the contract symbol to TradingView.',
    error: 'Crypto arena:', select: 'Select a contract.', wallet: 'Virtual balance', realized: 'Net realized result',
    tradeTitle: 'TRADING TERMINAL', tradeIntro: 'Track your positions, live prices and arena activity in one screen.',
    live: 'LIVE', livePnl: 'Open position P/L', equity: 'Estimated equity', notAvailable: 'Price unavailable',
    awaiting: 'Waiting for positions', roi: 'Return on margin', danger: 'Liquidation threshold observed; server processing',
    timeout: 'Request timed out.',
    outdatedService: 'The live valuation API was not found. Restart the exam service with the current version.',
    closeConfirmTitle: 'Close this position?',
    closeConfirmMessage: 'The virtual position will close at the current server price; the execution price may change.',
    confirmClose: 'Yes, close position', cancel: 'Cancel',
    positions: 'Open positions', noPositions: 'No open positions.', closedPositions: 'Closed positions', noClosed: 'No closed positions.', margin: 'Margin (USDT)', leverage: 'Leverage',
    long: 'Virtual BUY / LONG', short: 'Virtual SELL / SHORT', close: 'Close position', entry: 'Entry', pnl: 'Estimated unrealized result',
    history: 'My transaction history', publicHistory: 'Public transactions', noHistory: 'No transactions yet.', previous: 'Previous', next: 'Next',
    completed: 'Virtual transaction recorded.', pending: 'The previous transaction has an uncertain outcome. Retry the same request or check your history before clearing it.',
    clear: 'I checked the history; clear pending request', open: 'Opened', closed: 'Closed', liquidation: 'Liquidated',
    funding: 'Funding', closedStatus: 'Closed', liquidatedStatus: 'Liquidated', openStatus: 'Open',
  },
};

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function renderCryptoMarket(lang, onTrade) {
  const t = copy[lang], root = el('section', undefined, 'game-card prime-market');
  const heading = el('h2', t.title);
  const status = el('p', '', 'game-hint');
  status.setAttribute('role', 'status');
  const content = el('div');
  const marketPanel = el('div', undefined, 'crypto-market-panel');
  const tradePanel = el('div', undefined, 'crypto-terminal');
  const publicPanel = el('div', undefined, 'crypto-public');
  const form = el('form', undefined, 'prime-search');
  const label = el('label', t.search, 'practice-label');
  const input = el('input');
  input.maxLength = 30; input.placeholder = t.placeholder; input.autocomplete = 'off';
  label.append(input);
  const submit = el('button', t.searchButton, 'game-button');
  submit.type = 'submit';
  form.append(label, submit);
  const results = el('div', undefined, 'prime-search-results');
  const list = el('div', undefined, 'prime-search-results');
  const selected = el('div');
  const chart = el('div', undefined, 'prime-chart');
  const stats = el('div', undefined, 'prime-stats');
  const positions = el('div');
  const portfolioError = el('p', '', 'crypto-error');
  portfolioError.setAttribute('role', 'status');
  const order = el('form', undefined, 'prime-trade');
  const marginLabel = el('label', t.margin, 'practice-label');
  const margin = el('input'); margin.type = 'number'; margin.min = '1'; margin.step = '0.01'; margin.value = '100'; margin.required = true;
  marginLabel.append(margin);
  const leverageLabel = el('label', t.leverage, 'practice-label');
  const leverage = el('select');
  for (let value = 1; value <= 10; value++) {
    const option = el('option', `${value}x`); option.value = String(value); leverage.append(option);
  }
  leverageLabel.append(leverage);
  const long = el('button', t.long, 'game-button'); long.type = 'submit'; long.value = 'long';
  const short = el('button', t.short, 'game-button'); short.type = 'submit'; short.value = 'short';
  long.classList.add('crypto-long'); short.classList.add('crypto-short');
  long.disabled = short.disabled = true;
  order.append(marginLabel, leverageLabel, long, short);
  const pendingNotice = el('p', '', 'game-hint');
  const clearPending = button(t.clear, () => {
    try { sessionStorage.removeItem(pendingKey()); pendingNotice.textContent = ''; clearPending.hidden = true; }
    catch (error) { status.textContent = `${t.error} ${error.message}`; }
  });
  clearPending.hidden = true;
  const history = el('div');
  const closedPositions = el('div');
  const publicHistory = el('div');
  const pages = el('div', undefined, 'arena-dialog-actions');
  const previous = button(t.previous, () => { if (page > 0) { page--; loadHistory(generation); } });
  const next = button(t.next, () => { page++; loadHistory(generation); });
  pages.append(previous, next);
  const closedPages = el('div', undefined, 'arena-dialog-actions');
  const closedPrevious = button(t.previous, () => { if (closedPage > 0) { closedPage--; loadClosedPositions(generation); } });
  const closedNext = button(t.next, () => { closedPage++; loadClosedPositions(generation); });
  closedPages.append(closedPrevious, closedNext);
  const publicPages = el('div', undefined, 'arena-dialog-actions');
  const publicPrevious = button(t.previous, () => { if (publicPage > 0) { publicPage--; loadPublicHistory(generation); } });
  const publicNext = button(t.next, () => { publicPage++; loadPublicHistory(generation); });
  publicPages.append(publicPrevious, publicNext);
  let visible = false, destroyed = false, generation = 0, searchGeneration = 0, quoteGeneration = 0;
  let view = 'crypto', hasQuote = false, refreshing = false, tickCount = 0, openDialog = null;
  const quoteInFlight = new Set();
  let selectedSymbol = '', timer, watchlist = [], page = 0, publicPage = 0, closedPage = 0;
  let portfolioGeneration = 0, historyGeneration = 0, publicGeneration = 0, closedGeneration = 0, submitting = false;

  function button(text, fn) {
    const node = el('button', text, 'game-chat');
    node.type = 'button'; node.addEventListener('click', fn);
    return node;
  }
  function pendingKey() {
    const account = getActiveAccount();
    if (!account?.userId || !account.baseUrl) throw new Error('Matrix session unavailable');
    return `heap-crypto-pending:${JSON.stringify([account.userId, account.baseUrl])}`;
  }
  const money = cents => new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((cents || 0) / 100);
  async function bounded(promise) {
    let timeout;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(t.timeout)), 10000);
      })]);
    } finally { clearTimeout(timeout); }
  }
  async function send(action, payload) {
    if (submitting) return;
    const version = generation;
    try {
      const key = pendingKey();
      const stored = sessionStorage.getItem(key);
      let pending = stored ? JSON.parse(stored) : null;
      if (pending && (pending.action !== action || JSON.stringify(pending.payload) !== JSON.stringify(payload))) {
        pendingNotice.textContent = t.pending; clearPending.hidden = false; return;
      }
      if (!pending) {
        pending = { action, payload, requestId: crypto.randomUUID() };
        sessionStorage.setItem(key, JSON.stringify(pending));
      }
      submitting = true; long.disabled = short.disabled = clearPending.disabled = true;
      const input = { ...payload, requestId: pending.requestId };
      if (action === 'open') await examApi.cryptoOpen(input); else await examApi.cryptoClose(input);
      sessionStorage.removeItem(key);
      if (destroyed || !visible || generation !== version) return;
      pendingNotice.textContent = ''; clearPending.hidden = true; status.textContent = t.completed;
      await Promise.all([loadPortfolio(version), loadHistory(version), loadClosedPositions(version), loadPublicHistory(version), onTrade()]);
    } catch (error) {
      if (!destroyed && visible && generation === version) {
        status.textContent = `${t.error} ${error.message}`; pendingNotice.textContent = t.pending; clearPending.hidden = false;
      }
    } finally { submitting = false; long.disabled = short.disabled = !hasQuote; clearPending.disabled = false; }
  }
  async function loadPortfolio(version) {
    const request = ++portfolioGeneration;
    let valuationError = '';
    try {
      let portfolio;
      try {
        portfolio = await bounded(examApi.cryptoValuations());
      } catch (error) {
        if (destroyed || !visible || generation !== version || request !== portfolioGeneration) return;
        valuationError = error instanceof ExamApiError && error.status === 404
          ? t.outdatedService : `${t.error} ${error.message}`;
        const fallback = await bounded(examApi.cryptoPortfolio());
        portfolio = { ...fallback, positions: fallback.positions.map(position => ({
          ...position, valuation: null, quoteError: t.notAvailable,
        })) };
      }
      if (destroyed || !visible || generation !== version || request !== portfolioGeneration) return;
      portfolioError.textContent = valuationError;
      stats.replaceChildren();
      const complete = portfolio.positions.every(position => position.valuation !== null);
      liveBadge.textContent = valuationError ? t.notAvailable : !portfolio.positions.length ? t.awaiting : complete ? `● ${t.live}` : t.notAvailable;
      liveBadge.classList.toggle('is-unavailable', !!valuationError || !portfolio.positions.length || !complete);
      const net = complete && !valuationError ? portfolio.positions.reduce((sum, position) => sum + position.valuation.unrealizedCents, 0) : null;
      const equity = net !== null ? portfolio.cashCents + portfolio.positions.reduce((sum, position) => sum + position.marginCents, 0) + net : null;
      for (const [labelText, value, suffix] of [
        [t.wallet, portfolio.cashCents, 'USDT'], [t.equity, equity, 'USDT'],
        [t.livePnl, net, 'USDT'], [t.realized, portfolio.realizedTryCents, 'TL'],
      ]) {
        const card = el('div', undefined, 'prime-stat');
        const number = el('strong', value === null ? '—' : `${value > 0 && labelText === t.livePnl ? '+' : ''}${money(value)} ${suffix}`);
        if (labelText === t.livePnl && value !== null) number.className = value > 0 ? 'crypto-profit' : value < 0 ? 'crypto-loss' : '';
        card.append(el('span', labelText), number); stats.append(card);
      }
      positions.replaceChildren();
      if (!portfolio.positions.length) positions.append(el('p', t.noPositions, 'game-hint'));
      for (const position of portfolio.positions) {
        const row = el('article', undefined, 'crypto-position');
        const top = el('div', undefined, 'crypto-position-top');
        top.append(el('strong', position.symbol), el('span', `${position.side.toUpperCase()} ${position.leverage}x`, `crypto-side crypto-side-${position.side}`));
        row.append(top);
        const metrics = el('div', undefined, 'crypto-metrics');
        function metric(labelText, value, className) {
          const item = el('div');
          item.append(el('span', labelText), el('strong', value, className));
          metrics.append(item);
        }
        metric(t.margin, `${money(position.marginCents)} USDT`);
        metric(t.entry, `${position.entryPrice} USDT`);
        if (!position.valuation) {
          metric(t.mark, t.notAvailable, 'crypto-unavailable');
          row.append(metrics, el('p', `${t.error} ${position.quoteError}`, 'crypto-error'));
        } else {
          const valuation = position.valuation, pnl = valuation.unrealizedCents;
          const color = pnl > 0 ? 'crypto-profit' : pnl < 0 ? 'crypto-loss' : '';
          const prefix = pnl > 0 ? '+' : '';
          metric(t.mark, `${valuation.markPrice} USDT`);
          metric(t.pnl, `${prefix}${money(pnl)} USDT`, color);
          metric(t.roi, `${prefix}${(pnl / position.marginCents * 100).toFixed(2)}%`, color);
          metric(t.funding, `${money(valuation.fundingCents)} USDT`);
          row.append(metrics, el('p', `${t.live} · ${t.updated}: ${new Date(valuation.quoteAt).toLocaleString(lang)}`, 'crypto-live'));
          if (valuation.liquidationTriggered) row.append(el('p', t.danger, 'crypto-error'));
        }
        const close = button(t.close, () => confirmClose(position));
        close.classList.add('crypto-close');
        row.append(close);
        positions.append(row);
      }
    } catch (error) {
      if (!destroyed && visible && generation === version && request === portfolioGeneration) {
        liveBadge.textContent = t.notAvailable; liveBadge.classList.add('is-unavailable');
        stats.replaceChildren(); positions.replaceChildren();
        portfolioError.textContent = `${valuationError ? `${valuationError} ` : ''}${t.error} ${error.message}`;
      }
    }
  }
  function confirmClose(position) {
    if (openDialog || submitting || !visible) return;
    const version = generation;
    const dialog = el('dialog', undefined, 'arena-dialog');
    dialog.setAttribute('aria-label', t.closeConfirmTitle);
    openDialog = dialog;
    const title = el('h3', t.closeConfirmTitle);
    const detail = el('p', `${position.symbol} · ${position.side.toUpperCase()} ${position.leverage}x`);
    const message = el('p', t.closeConfirmMessage);
    const actions = el('div', undefined, 'arena-dialog-actions');
    const cancel = button(t.cancel, () => dialog.close('cancel'));
    const accept = el('button', t.confirmClose, 'game-button');
    accept.type = 'button';
    accept.addEventListener('click', () => dialog.close('confirm'));
    actions.append(cancel, accept);
    dialog.append(title, detail, message, actions);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); dialog.close('cancel'); }
    });
    dialog.addEventListener('close', () => {
      const accepted = dialog.returnValue === 'confirm';
      if (openDialog === dialog) openDialog = null;
      dialog.remove();
      if (accepted && !destroyed && visible && generation === version) {
        send('close', { positionId: position.id });
      }
    }, { once: true });
    root.append(dialog);
    dialog.showModal();
    cancel.focus();
  }
  async function loadHistory(version) {
    const request = ++historyGeneration, currentPage = page;
    try {
      const items = await bounded(examApi.cryptoHistory(currentPage));
      if (destroyed || !visible || generation !== version || request !== historyGeneration) return;
      history.replaceChildren();
      if (!items.length) history.append(el('p', t.noHistory, 'game-hint'));
      for (const item of items) {
        const row = el('div', undefined, 'prime-trade-row');
        const action = item.action === 'open' ? t.open : item.action === 'liquidation' ? t.liquidation : t.closed;
        const state = item.status === 'open' ? t.openStatus : item.status === 'liquidated' ? t.liquidatedStatus : t.closedStatus;
        row.append(el('strong', `${item.symbol} · ${item.side.toUpperCase()} ${item.leverage}x · ${action}`));
        row.append(el('span', `${new Date(item.executedAt).toLocaleString(lang)} · ${state} · ${t.margin}: ${money(item.marginCents)} USDT · ${t.entry}: ${item.entryPrice}`));
        if (item.realizedCents !== null) row.append(el('span', `${t.closed}: ${item.closePrice} · ${t.realized}: ${money(item.realizedCents)} USDT · ${t.funding}: ${money(item.fundingCents)} USDT · ${item.ratingAfter} Elo`));
        history.append(row);
      }
      previous.disabled = page === 0; next.disabled = items.length < 50;
    } catch (error) {
      if (!destroyed && visible && generation === version && request === historyGeneration) status.textContent = `${t.error} ${error.message}`;
    }
  }
  async function loadPublicHistory(version) {
    const request = ++publicGeneration, currentPage = publicPage;
    try {
      const items = await bounded(examApi.cryptoPublicTrades(currentPage));
      if (destroyed || !visible || generation !== version || request !== publicGeneration) return;
      publicHistory.replaceChildren();
      if (!items.length) publicHistory.append(el('p', t.noHistory, 'game-hint'));
      for (const item of items) {
        const row = el('div', undefined, 'prime-trade-row');
        const action = item.action === 'open' ? t.open : item.action === 'liquidation' ? t.liquidation : t.closed;
        row.append(el('strong', `${item.symbol} · ${item.side.toUpperCase()} ${item.leverage}x · ${action}`));
        row.append(el('span', `${item.userId} · ${new Date(item.executedAt).toLocaleString(lang)} · ${t.margin}: ${money(item.marginCents)} USDT`));
        if (item.action !== 'open') row.append(el('span', `${t.realized}: ${money(item.realizedCents)} USDT · ${item.ratingAfter} Elo`));
        publicHistory.append(row);
      }
      publicPrevious.disabled = publicPage === 0; publicNext.disabled = items.length < 50;
    } catch (error) {
      if (!destroyed && visible && generation === version && request === publicGeneration) status.textContent = `${t.error} ${error.message}`;
    }
  }
  async function loadClosedPositions(version) {
    const request = ++closedGeneration, currentPage = closedPage;
    try {
      const items = await bounded(examApi.cryptoClosedPositions(currentPage));
      if (destroyed || !visible || generation !== version || request !== closedGeneration) return;
      closedPositions.replaceChildren();
      if (!items.length) closedPositions.append(el('p', t.noClosed, 'game-hint'));
      for (const item of items) {
        const row = el('div', undefined, 'prime-trade-row');
        row.append(el('strong', `${item.symbol} · ${item.side.toUpperCase()} ${item.leverage}x · ${item.status === 'liquidated' ? t.liquidatedStatus : t.closedStatus}`));
        row.append(el('span', `${t.entry}: ${item.entryPrice} · ${t.closed}: ${item.closePrice} · ${t.margin}: ${money(item.marginCents)} USDT`));
        row.append(el('span', `${t.realized}: ${money(item.realizedCents)} USDT · ${t.funding}: ${money(item.fundingCents)} USDT · ${item.ratingAfter} Elo · ${new Date(item.closedAt).toLocaleString(lang)}`));
        closedPositions.append(row);
      }
      closedPrevious.disabled = closedPage === 0; closedNext.disabled = items.length < 50;
    } catch (error) {
      if (!destroyed && visible && generation === version && request === closedGeneration) status.textContent = `${t.error} ${error.message}`;
    }
  }
  function renderWatchlist() {
    list.replaceChildren();
    if (!watchlist.length) list.append(el('p', t.empty, 'game-hint'));
    for (const symbol of watchlist) list.append(button(symbol, () => select(symbol)));
  }
  async function loadQuote(symbol, version) {
    if (quoteInFlight.has(symbol)) return;
    quoteInFlight.add(symbol);
    const request = ++quoteGeneration;
    try {
      const quote = await bounded(examApi.cryptoQuote(symbol));
      if (destroyed || !visible || generation !== version || request !== quoteGeneration || selectedSymbol !== symbol) return;
      const price = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 8 }).format(quote.price);
      hasQuote = true;
      if (!submitting) long.disabled = short.disabled = false;
      const favorite = watchlist.includes(symbol);
      const toggle = button(favorite ? t.remove : t.add, async () => {
        toggle.disabled = true;
        try {
          await examApi.updateCryptoWatchlist(symbol, !favorite);
          if (destroyed || !visible || generation !== version) return;
          watchlist = await examApi.cryptoWatchlist();
          if (destroyed || !visible || generation !== version) return;
          renderWatchlist();
          await loadQuote(symbol, version);
        } catch (error) {
          if (!destroyed && visible && generation === version) status.textContent = `${t.error} ${error.message}`;
        } finally {
          toggle.disabled = false;
        }
      });
      selected.replaceChildren(el('h3', symbol), el('strong', `${t.mark}: ${price} USDT`),
        el('p', `${t.updated}: ${new Date(quote.quoteAt).toLocaleString(lang)}`, 'game-hint'),
        toggle);
      status.textContent = '';
    } catch (error) {
      if (!destroyed && visible && generation === version && request === quoteGeneration) {
        hasQuote = false; long.disabled = short.disabled = true;
        selected.replaceChildren(el('strong', symbol), el('p', t.notAvailable, 'crypto-error'));
        status.textContent = `${t.error} ${error.message}`;
      }
    } finally { quoteInFlight.delete(symbol); }
  }
  function select(symbol) {
    selectedSymbol = symbol;
    hasQuote = false; long.disabled = short.disabled = true;
    searchGeneration++;
    const version = generation;
    selected.replaceChildren(el('p', t.loading, 'game-hint'));
    const frame = el('iframe');
    const params = new URLSearchParams({ symbol: `BINANCE:${symbol}.P`, interval: '60', theme: 'dark', style: '1', locale: lang, allow_symbol_change: '0' });
    frame.src = `https://s.tradingview.com/widgetembed/?${params}`;
    frame.title = `TradingView ${symbol}`; frame.loading = 'lazy'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
    chart.replaceChildren(frame);
    loadQuote(symbol, version);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const version = generation, request = ++searchGeneration;
    try {
      const found = await examApi.cryptoSearch(input.value.trim().toUpperCase());
      if (destroyed || !visible || generation !== version || request !== searchGeneration) return;
      results.replaceChildren();
      if (!found.length) results.append(el('p', t.noResults, 'game-hint'));
      for (const item of found) results.append(button(item.symbol, () => select(item.symbol)));
      status.textContent = '';
    } catch (error) {
      if (!destroyed && visible && generation === version && request === searchGeneration) status.textContent = `${t.error} ${error.message}`;
    }
  });
  order.addEventListener('submit', event => {
    event.preventDefault();
    if (!selectedSymbol) { status.textContent = t.select; return; }
    const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(margin.value);
    if (!match) { status.textContent = `${t.error} ${t.margin}`; return; }
    const marginCents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
    const side = event.submitter?.value;
    if (!['long', 'short'].includes(side)) return;
    send('open', { symbol: selectedSymbol, side, leverage: Number(leverage.value), marginCents });
  });
  const liveBadge = el('span', t.awaiting, 'crypto-live-badge is-unavailable');
  const intro = el('div', undefined, 'crypto-terminal-intro');
  intro.append(el('p', t.tradeIntro, 'game-hint'), liveBadge);
  marketPanel.append(el('p', t.notice, 'game-hint'), form, results, el('h3', t.watch), list, selected, chart,
    el('p', t.chart, 'game-hint'), order);
  tradePanel.append(intro, portfolioError, stats, el('h3', t.positions), positions,
    el('h3', t.closedPositions), closedPositions, closedPages, el('h3', t.history), history, pages);
  publicPanel.append(el('h3', t.publicHistory), publicHistory, publicPages);
  content.append(el('p', t.unavailable, 'game-hint'), marketPanel, tradePanel);
  root.append(heading, status, pendingNotice, clearPending, content, publicPanel);
  content.hidden = true;
  tradePanel.hidden = true;
  publicPanel.hidden = true;
  return {
    element: root,
    setView(value) {
      view = value === 'transactions' ? 'transactions' : 'crypto';
      heading.textContent = view === 'transactions' ? t.tradeTitle : t.title;
      marketPanel.hidden = view !== 'crypto'; tradePanel.hidden = view !== 'transactions';
      publicPanel.hidden = view !== 'transactions';
      hasQuote = false; long.disabled = short.disabled = true;
      if (selectedSymbol && view === 'crypto') selected.replaceChildren(el('strong', selectedSymbol), el('p', t.loading, 'game-hint'));
    },
    async refresh() {
      visible = true;
      if (openDialog) openDialog.close('cancel');
      clearInterval(timer); tickCount = 0;
      const version = ++generation;
      status.textContent = t.loading;
      try {
        const profile = await examApi.me();
        if (destroyed || !visible || generation !== version) return;
        if (!profile.primeUnlocked) {
          content.hidden = true; status.textContent = t.locked;
          await loadPublicHistory(version); return;
        }
        watchlist = await examApi.cryptoWatchlist();
        if (destroyed || !visible || generation !== version) return;
        renderWatchlist(); content.hidden = false; status.textContent = '';
        const stored = sessionStorage.getItem(pendingKey());
        pendingNotice.textContent = stored ? t.pending : ''; clearPending.hidden = !stored;
        await Promise.all([loadPortfolio(version), loadHistory(version), loadClosedPositions(version), loadPublicHistory(version)]);
        if (destroyed || !visible || generation !== version) return;
        if (selectedSymbol) loadQuote(selectedSymbol, version);
        clearInterval(timer);
        timer = setInterval(() => {
          if (!visible || refreshing) return;
          refreshing = true;
          const current = generation;
          const tasks = [];
          if (selectedSymbol && view === 'crypto') tasks.push(loadQuote(selectedSymbol, current));
          if (view === 'transactions') tasks.push(loadPortfolio(current));
          if (++tickCount % 5 === 0 && view === 'transactions') {
            tasks.push(loadHistory(current), loadClosedPositions(current), loadPublicHistory(current));
          }
          Promise.all(tasks).finally(() => { refreshing = false; });
        }, 2000);
      } catch (error) {
        if (!destroyed && visible && generation === version) status.textContent = `${t.error} ${error.message}`;
      }
    },
    hide() { visible = false; generation++; if (openDialog) openDialog.close('cancel'); clearInterval(timer); hasQuote = false; long.disabled = short.disabled = true; },
    reset() {
      visible = false; generation++; if (openDialog) openDialog.close('cancel'); clearInterval(timer); selectedSymbol = ''; watchlist = [];
      hasQuote = false; long.disabled = short.disabled = true; tickCount = 0;
      content.hidden = true; status.textContent = ''; results.replaceChildren(); list.replaceChildren();
      selected.replaceChildren(); chart.replaceChildren(); positions.replaceChildren(); closedPositions.replaceChildren(); history.replaceChildren(); publicHistory.replaceChildren(); stats.replaceChildren();
      portfolioError.textContent = ''; liveBadge.textContent = t.awaiting; liveBadge.classList.add('is-unavailable');
      pendingNotice.textContent = ''; clearPending.hidden = true; input.value = ''; page = 0; publicPage = 0; closedPage = 0;
    },
    destroy() { destroyed = true; visible = false; generation++; if (openDialog) openDialog.close('cancel'); clearInterval(timer); chart.replaceChildren(); },
  };
}
