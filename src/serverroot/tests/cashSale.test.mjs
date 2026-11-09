import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCashSale, parseLira } from '../src/game/cashSale.js';

const solution = [
  { accountCode: '100', side: 'debit', amount: '1200,00' },
  { accountCode: '600', side: 'credit', amount: '1000' },
  { accountCode: '391', side: 'credit', amount: '200.00' },
];

test('parses positive lira amounts exactly and rejects ambiguous or invalid formats', () => {
  assert.equal(parseLira('1200,5'), '120050');
  assert.equal(parseLira('9999999999999999,99'), '999999999999999999');
  for (const value of ['', '0', '-1', '01', '1.000,00', '1,234', '1e3', '10000000000000000', 10]) {
    assert.equal(parseLira(value), null);
  }
});

test('checks the exact cash sale entry independently of line order', () => {
  assert.equal(checkCashSale(solution), 'correct');
  assert.equal(checkCashSale([...solution].reverse()), 'correct');
  assert.equal(checkCashSale(solution.slice(0, 2)), 'invalid');
  assert.equal(checkCashSale([{ ...solution[0], amount: '1201' }, ...solution.slice(1)]), 'unbalanced');
  assert.equal(checkCashSale([solution[0], { ...solution[1], accountCode: '102' }, solution[2]]), 'incorrect');
  assert.equal(checkCashSale([solution[0], { ...solution[1], amount: '900' }, { ...solution[2], amount: '300' }]), 'incorrect');
  assert.equal(checkCashSale([solution[0], { ...solution[1], amount: '600' }, { ...solution[1], amount: '600' }]), 'incorrect');
  assert.equal(checkCashSale([{ ...solution[0], amount: '0' }, ...solution.slice(1)]), 'invalid');
});
