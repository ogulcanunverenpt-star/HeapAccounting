const ACCOUNT_CODE = /^\d{3}(?:\.\d{1,6}){0,6}$/;
const MINOR_UNITS = /^(0|[1-9]\d{0,17})$/;

function text(value, field, maxLength, required = true) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const result = value.trim();
  if ((required && !result) || result.length > maxLength) {
    throw new RangeError(`${field} has an invalid length`);
  }
  return result;
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function amount(value, field) {
  if (typeof value !== 'string' || !MINOR_UNITS.test(value)) {
    throw new RangeError(`${field} must be a non-negative integer string in kuruş`);
  }
  return BigInt(value);
}

export function createChart(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new RangeError('At least one account is required');
  }
  const chart = new Map();
  for (const account of accounts) {
    if (!account || typeof account.code !== 'string' || !ACCOUNT_CODE.test(account.code)) {
      throw new RangeError('Invalid account code');
    }
    if (chart.has(account.code)) throw new RangeError(`Duplicate account: ${account.code}`);
    chart.set(account.code, { code: account.code, name: text(account.name, 'Account name', 200) });
  }
  return chart;
}

export function validateVoucher(voucher, chart) {
  if (!voucher || typeof voucher !== 'object' || !(chart instanceof Map)) {
    throw new TypeError('Voucher and account chart are required');
  }
  if (typeof voucher.date !== 'string' || !validDate(voucher.date)) {
    throw new RangeError('Voucher date must be a valid YYYY-MM-DD date');
  }
  if (voucher.currency !== undefined && voucher.currency !== 'TRY') {
    throw new RangeError('Voucher currency must be TRY');
  }
  const description = text(voucher.description, 'Description', 500);
  const documentRef = text(voucher.documentRef ?? '', 'Document reference', 120, false);
  if (!Array.isArray(voucher.lines) || voucher.lines.length < 2 || voucher.lines.length > 1000) {
    throw new RangeError('Voucher must have between 2 and 1000 lines');
  }
  let totalDebit = 0n;
  let totalCredit = 0n;
  const lines = voucher.lines.map(line => {
    if (!line || typeof line.accountCode !== 'string' || !chart.has(line.accountCode)) {
      throw new RangeError('Voucher references an unknown account');
    }
    const debit = amount(line.debitMinor, 'Debit');
    const credit = amount(line.creditMinor, 'Credit');
    if ((debit === 0n) === (credit === 0n)) {
      throw new RangeError('Each line must have either a debit or a credit');
    }
    totalDebit += debit;
    totalCredit += credit;
    return { accountCode: line.accountCode, debitMinor: debit.toString(), creditMinor: credit.toString() };
  });
  if (totalDebit !== totalCredit) throw new RangeError('Voucher debits and credits must balance');
  return { date: voucher.date, description, documentRef, currency: 'TRY', lines };
}

export function calculateTrialBalance(chart, vouchers) {
  if (!(chart instanceof Map) || !Array.isArray(vouchers)) {
    throw new TypeError('Account chart and vouchers are required');
  }
  const totals = new Map([...chart.keys()].map(code => [code, { debit: 0n, credit: 0n }]));
  for (const raw of vouchers) {
    const voucher = validateVoucher(raw, chart);
    if (raw.currency !== 'TRY') throw new RangeError('Voucher currency must be TRY');
    for (const line of voucher.lines) {
      const total = totals.get(line.accountCode);
      total.debit += BigInt(line.debitMinor);
      total.credit += BigInt(line.creditMinor);
    }
  }
  return [...chart.values()].sort((a, b) => a.code.localeCompare(b.code)).map(account => {
    const total = totals.get(account.code);
    const net = total.debit - total.credit;
    return {
      ...account,
      debitMinor: total.debit.toString(),
      creditMinor: total.credit.toString(),
      debitBalanceMinor: (net > 0n ? net : 0n).toString(),
      creditBalanceMinor: (net < 0n ? -net : 0n).toString(),
    };
  });
}
