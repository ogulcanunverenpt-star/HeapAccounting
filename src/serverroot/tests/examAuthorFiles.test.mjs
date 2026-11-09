import test from 'node:test';
import assert from 'node:assert/strict';
import { examDefinitionTemplate, questionDataTemplate, encodeExamFiles } from '../src/game/examAuthorFiles.js';
import { validateExamDefinition, gradeExam } from '../src/game/examRules.js';

function file(name, contents) {
  const blob = new Blob([contents]);
  return { name, size: blob.size, arrayBuffer: () => blob.arrayBuffer() };
}

test('downloaded exam template is editable, valid and grades both question types', async () => {
  const template = JSON.parse(await examDefinitionTemplate().text());
  template.title.tr = 'Benim sınavım';
  template.questions[0].prompt.tr = 'Kasa hangi hesaptır?';
  const exam = validateExamDefinition(template);
  assert.equal(exam.title.tr, 'Benim sınavım');
  assert.equal(gradeExam(exam, { soru1: 'a', soru2: template.questions[1].answer }).score, 100);
  const csv = await questionDataTemplate().text();
  assert.match(csv, /islem_no;aciklama;tutar_tl;kdv_orani/);
  const [encoded] = await encodeExamFiles([file('soru-verileri.csv', csv)]);
  assert.equal(encoded.contentType, 'text/csv');
  assert.equal(Buffer.from(encoded.base64, 'base64').toString('utf8'), csv);
});

test('attachment validation rejects unsupported names, formats, counts and sizes', async () => {
  await assert.rejects(encodeExamFiles([file('soru verileri.csv', 'x')]), /Invalid filename/);
  await assert.rejects(encodeExamFiles([file('question.xlsx', 'x')]), /Invalid filename/);
  await assert.rejects(encodeExamFiles([file('empty.csv', '')]), /Invalid file count or size/);
  await assert.rejects(encodeExamFiles(Array.from({ length: 6 }, () => file('data.csv', 'x'))), /Invalid file count or size/);
  await assert.rejects(encodeExamFiles([{ name: 'large.csv', size: 5 * 1024 * 1024 + 1 }]), /Invalid file count or size/);
});
