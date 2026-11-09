import { createChart, validateVoucher } from '../accounting/ledger.js';

export const cashSaleQuestion = {
  id: 'cash-sale-v1',
  date: '2024-01-15',
  tr: {
    title: 'Peşin satış',
    story: 'Bir işletme, yurt içinde ticari malı 1.000,00 TL + %20 KDV ile peşin satıyor. Bedelin tamamı nakit tahsil ediliyor.',
    objective: 'Satış ve KDV için üç satırlı yevmiye kaydını oluştur. Satılan malın maliyet kaydını bu görevde hariç tut.',
  },
  en: {
    title: 'Cash sale',
    story: 'A business sells merchandise domestically for TRY 1,000.00 plus 20% VAT. The entire amount is collected in cash.',
    objective: 'Create a three-line journal entry for the sale and VAT. Exclude the separate cost-of-goods entry from this challenge.',
  },
};

export const accounts = [
  { code: '100', tr: 'Kasa', en: 'Cash' },
  { code: '102', tr: 'Bankalar', en: 'Banks' },
  { code: '120', tr: 'Alıcılar', en: 'Trade receivables' },
  { code: '153', tr: 'Ticari Mallar', en: 'Merchandise' },
  { code: '191', tr: 'İndirilecek KDV', en: 'Input VAT' },
  { code: '320', tr: 'Satıcılar', en: 'Trade payables' },
  { code: '391', tr: 'Hesaplanan KDV', en: 'Output VAT' },
  { code: '600', tr: 'Yurt İçi Satışlar', en: 'Domestic sales' },
  { code: '610', tr: 'Satıştan İadeler', en: 'Sales returns' },
];

const chart = createChart(accounts.map(({ code, tr }) => ({ code, name: tr })));
const expected = new Map([
  ['100:debit', '120000'],
  ['600:credit', '100000'],
  ['391:credit', '20000'],
]);

export function parseLira(value) {
  if (typeof value !== 'string') return null;
  const match = /^(0|[1-9]\d{0,15})(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
  return minor > 0n ? minor.toString() : null;
}

export function checkCashSale(rows) {
  if (!Array.isArray(rows) || rows.length !== 3) return 'invalid';
  const lines = [];
  let debit = 0n;
  let credit = 0n;
  for (const row of rows) {
    if (!row || !chart.has(row.accountCode) || !['debit', 'credit'].includes(row.side)) return 'invalid';
    const minor = parseLira(row.amount);
    if (minor === null) return 'invalid';
    if (row.side === 'debit') debit += BigInt(minor);
    else credit += BigInt(minor);
    lines.push({
      accountCode: row.accountCode,
      debitMinor: row.side === 'debit' ? minor : '0',
      creditMinor: row.side === 'credit' ? minor : '0',
    });
  }
  if (debit !== credit) return 'unbalanced';
  const voucher = validateVoucher({
    date: '2024-01-15', description: 'Cash sale', currency: 'TRY', lines,
  }, chart);
  const remaining = new Map(expected);
  for (const line of voucher.lines) {
    const side = line.debitMinor !== '0' ? 'debit' : 'credit';
    const key = `${line.accountCode}:${side}`;
    if (remaining.get(key) !== (side === 'debit' ? line.debitMinor : line.creditMinor)) return 'incorrect';
    remaining.delete(key);
  }
  return remaining.size === 0 ? 'correct' : 'incorrect';
}
