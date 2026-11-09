import test from 'node:test';
import assert from 'node:assert/strict';
import { examApi, ExamApiError } from '../src/client/examApi.js';
import { setState } from '../src/store/state.js';
import { renderCryptoMarket } from '../src/ui/CryptoMarket.js';

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.classList = { add() {}, toggle() {} };
  }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  focus() {}
  showModal() { this.open = true; }
  close(value) { this.returnValue = value; this.open = false; this.listeners.close(); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
}

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const match = find(child, predicate);
    if (match) return match;
  }
}

test('unavailable valuations retain positions and closing requires confirmation', async t => {
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.sessionStorage;
  const originalApi = { ...examApi };
  const data = new Map();
  globalThis.document = { createElement: tag => new Element(tag) };
  globalThis.sessionStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
  setState({ accounts: [{ userId: '@test:example.org', baseUrl: 'https://example.org', accessToken: 'test' }], activeAccountIndex: 0 });
  let closes = 0;
  const position = { id: 'position-1', symbol: 'BTCUSDT', side: 'long', leverage: 2, marginCents: 10000, entryPrice: '100' };
  Object.assign(examApi, {
    me: async () => ({ primeUnlocked: true }),
    cryptoWatchlist: async () => [],
    cryptoValuations: async () => { throw new ExamApiError('Not found', 404); },
    cryptoPortfolio: async () => ({ cashCents: 990000, realizedTryCents: 0, positions: [position] }),
    cryptoHistory: async () => [],
    cryptoClosedPositions: async () => [],
    cryptoPublicTrades: async () => [],
    cryptoClose: async input => { closes++; assert.equal(input.positionId, position.id); },
  });
  const market = renderCryptoMarket('tr', async () => {});
  t.after(() => {
    market.destroy();
    Object.assign(examApi, originalApi);
    globalThis.document = originalDocument;
    globalThis.sessionStorage = originalStorage;
    setState({ accounts: [], activeAccountIndex: 0 });
  });
  market.setView('transactions');
  await market.refresh();
  assert.ok(find(market.element, node => node.textContent?.includes('Sınav servisini güncel sürümle yeniden başlatın')));
  assert.ok(find(market.element, node => node.textContent === 'BTCUSDT'));
  const closeButton = () => find(market.element, node => node.textContent === 'Pozisyonu kapat');
  closeButton().listeners.click();
  let dialog = find(market.element, node => node.tag === 'dialog');
  assert.ok(dialog.open);
  assert.equal(closes, 0);
  find(dialog, node => node.textContent === 'Vazgeç').listeners.click();
  assert.equal(closes, 0);
  closeButton().listeners.click();
  dialog = find(market.element, node => node.tag === 'dialog');
  let prevented = false;
  dialog.listeners.keydown({ key: 'Escape', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(closes, 0);
  closeButton().listeners.click();
  dialog = find(market.element, node => node.tag === 'dialog');
  find(dialog, node => node.textContent === 'Evet, pozisyonu kapat').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closes, 1);
  closeButton().listeners.click();
  assert.ok(find(market.element, node => node.tag === 'dialog').open);
  market.hide();
  assert.equal(find(market.element, node => node.tag === 'dialog'), undefined);
  assert.equal(closes, 1);
});
