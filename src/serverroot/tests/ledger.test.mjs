import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, validateVoucher, calculateTrialBalance } from '../src/accounting/ledger.js';

const accounts = [{ code: '100', name: 'Kasa' }, { code: '102.01', name: 'Banka' }];
const voucher = {
  date: '2024-02-29',
  description: 'Örnek',
  documentRef: 'T-1',
  lines: [
    { accountCode: '100', debitMinor: '100000000000000001', creditMinor: '0' },
    { accountCode: '102.01', debitMinor: '0', creditMinor: '100000000000000001' },
  ],
};

test('validates chart and balanced voucher using exact integer amounts', () => {
  const chart = createChart(accounts);
  const result = validateVoucher(voucher, chart);
  assert.equal(result.currency, 'TRY');
  assert.equal(result.lines[0].debitMinor, '100000000000000001');
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.throws(() => validateVoucher({ ...voucher, currency: 'USD' }, chart), /currency/);
  assert.throws(() => createChart([...accounts, accounts[0]]), /Duplicate/);
  assert.throws(() => createChart([{ code: '10', name: 'Bad' }]), /Invalid account/);
});

test('rejects invalid dates, unknown accounts, invalid lines and unbalanced entries', () => {
  const chart = createChart(accounts);
  assert.throws(() => validateVoucher({ ...voucher, date: '2023-02-29' }, chart), /date/);
  assert.throws(() => validateVoucher({ ...voucher, date: '0000-01-01' }, chart), /date/);
  assert.throws(() => validateVoucher({ ...voucher, lines: [{ ...voucher.lines[0], accountCode: '999' }, voucher.lines[1]] }, chart), /unknown account/);
  for (const bad of ['1.00', '-1', '01', '', 1]) {
    assert.throws(() => validateVoucher({ ...voucher, lines: [{ ...voucher.lines[0], debitMinor: bad }, voucher.lines[1]] }, chart), /Debit/);
  }
  assert.throws(() => validateVoucher({ ...voucher, lines: [{ ...voucher.lines[0], creditMinor: '1' }, voucher.lines[1]] }, chart), /either a debit/);
  assert.throws(() => validateVoucher({ ...voucher, lines: [{ ...voucher.lines[0], debitMinor: '0' }, voucher.lines[1]] }, chart), /either a debit/);
  assert.throws(() => validateVoucher({ ...voucher, lines: [voucher.lines[0], { ...voucher.lines[1], creditMinor: '1' }] }, chart), /must balance/);
});

test('computes trial balance and balances without floating-point rounding', () => {
  const chart = createChart(accounts);
  const entry = validateVoucher(voucher, chart);
  const result = calculateTrialBalance(chart, [entry, entry]);
  assert.deepEqual(result, [
    { code: '100', name: 'Kasa', debitMinor: '200000000000000002', creditMinor: '0', debitBalanceMinor: '200000000000000002', creditBalanceMinor: '0' },
    { code: '102.01', name: 'Banka', debitMinor: '0', creditMinor: '200000000000000002', debitBalanceMinor: '0', creditBalanceMinor: '200000000000000002' },
  ]);
  assert.throws(() => calculateTrialBalance(chart, [{ ...entry, currency: 'USD' }]), /currency/);
});
