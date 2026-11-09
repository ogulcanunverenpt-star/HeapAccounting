const headers = ['question_id', 'line', 'choice', 'account_code', 'side', 'amount'];
const maxSize = 1024 * 1024;
const maxRows = 2001;

export function templateRows(exam) {
  const rows = [headers];
  for (const question of exam.questions) {
    const count = question.type === 'journal' ? question.lineCount : 1;
    for (let line = 1; line <= count; line++) rows.push([question.id, String(line), '', '', '', '']);
  }
  return rows;
}

export function answersFromRows(exam, rows) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > maxRows ||
      rows[0].length !== headers.length || headers.some((header, i) => rows[0][i] !== header)) {
    throw new Error('Invalid answer file header or row count');
  }
  const questions = new Map(exam.questions.map(question => [question.id, question]));
  const entries = new Map();
  for (const row of rows.slice(1)) {
    if (row.length !== headers.length || row.some(cell => typeof cell !== 'string')) throw new Error('Invalid answer row');
    const [id, line, choice, accountCode, side, amount] = row.map(cell => cell.trim());
    const question = questions.get(id);
    if (!question || !/^[1-9]\d*$/.test(line)) throw new Error('Unknown question or invalid line');
    const index = Number(line);
    const count = question.type === 'journal' ? question.lineCount : 1;
    if (index > count || entries.has(`${id}:${index}`)) throw new Error('Duplicate or invalid line');
    if (question.type === 'choice' && (accountCode || side || amount)) throw new Error('Unexpected journal fields');
    if (question.type === 'journal' && choice) throw new Error('Unexpected choice field');
    entries.set(`${id}:${index}`, { choice, accountCode, side, amount });
  }
  const answers = {};
  for (const question of exam.questions) {
    const count = question.type === 'journal' ? question.lineCount : 1;
    const lines = Array.from({ length: count }, (_, i) => entries.get(`${question.id}:${i + 1}`));
    if (lines.some(line => !line)) throw new Error('A template row is missing');
    if (question.type === 'choice') {
      const { choice } = lines[0];
      if (choice && !question.options.some(option => option.id === choice)) throw new Error('Invalid choice');
      if (choice) answers[question.id] = choice;
    } else if (lines.some(line => line.accountCode || line.side || line.amount)) {
      if (lines.some(line => !line.accountCode || !['debit', 'credit'].includes(line.side) || !line.amount)) {
        throw new Error('Incomplete journal answer');
      }
      answers[question.id] = lines.map(({ accountCode, side, amount }) => ({ accountCode, side, amount }));
    }
  }
  return answers;
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const separator = firstLine === headers.join(';') ? ';' : ',';
  const rows = [], row = [];
  let cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else cell += ch;
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === separator || ch === '\n' || ch === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (ch !== separator) {
        rows.push(row.splice(0));
        if (rows.length > maxRows) throw new Error('Too many answer rows');
        if (ch === '\r' && text[i + 1] === '\n') i++;
      }
    } else {
      if (closed || ch === '"') throw new Error('Invalid CSV quoting');
      cell += ch;
    }
  }
  if (quoted) throw new Error('Unclosed CSV field');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}

async function workbook() {
  const module = await import('exceljs/dist/exceljs.min.js');
  const Excel = module.default;
  return new Excel.Workbook();
}

export async function makeTemplate(exam, format, lang = 'en') {
  const rows = templateRows(exam);
  if (format === 'csv') {
    const separator = lang === 'tr' ? ';' : ',';
    return new Blob(['\ufeff', rows.map(row => row.join(separator)).join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' });
  }
  if (format !== 'xlsx') throw new Error('Unsupported file format');
  const book = await workbook();
  const sheet = book.addWorksheet('Answers');
  sheet.addRows(rows);
  for (const column of sheet.columns) column.width = 20;
  const data = await book.xlsx.writeBuffer();
  return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function readAnswers(exam, file) {
  if (!file || file.size > maxSize || !file.size) throw new Error('Answer file must be between 1 byte and 1 MiB');
  let rows;
  if (file.name.toLowerCase().endsWith('.csv')) {
    rows = parseCsv((await file.text()).replace(/^\ufeff/, ''));
  } else if (file.name.toLowerCase().endsWith('.xlsx')) {
    const book = await workbook();
    await book.xlsx.load(await file.arrayBuffer());
    if (book.worksheets.length !== 1 || book.worksheets[0].rowCount > maxRows) throw new Error('Invalid workbook');
    rows = [];
    book.worksheets[0].eachRow({ includeEmpty: true }, row => {
      if (row.cellCount > headers.length) throw new Error('Too many columns');
      rows.push(headers.map((_, i) => {
        const value = row.getCell(i + 1).value;
        if (value === null) return '';
        if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Only plain text and numbers are allowed');
        return String(value);
      }));
    });
  } else throw new Error('Only CSV and XLSX are supported');
  return answersFromRows(exam, rows);
}
