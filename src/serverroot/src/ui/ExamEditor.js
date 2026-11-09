import { validateExamDefinition } from '../game/examRules.js';
import { examApi } from '../client/examApi.js';
import { getActiveAccount } from '../store/state.js';
import { createFilePicker } from './FilePicker.js';
import { encodeExamFiles } from '../game/examAuthorFiles.js';

const words = {
  tr: { title: 'Görev tasarımcısı', intro: 'Başlık, açıklama ve her soru için Türkçe ve İngilizce metin gir. Soru puanları toplamı 100 olmalı.', nameTr: 'Başlık (TR)', nameEn: 'Başlık (EN)', descriptionTr: 'Açıklama (TR)', descriptionEn: 'Açıklama (EN)', difficulty: 'Zorluk', easy: 'Kolay', medium: 'Orta', hard: 'Zor', rating: 'Zorluk Elo', seconds: 'Süre (saniye)', questions: 'Sorular', choice: '+ Çoktan seçmeli soru', journal: '+ Yevmiye sorusu', promptTr: 'Soru (TR)', promptEn: 'Soru (EN)', points: 'Puan', remove: 'Kaldır', option: 'Seçenek', correct: 'Doğru', account: 'Hesap kodu', side: 'Yön', debit: 'Borç', credit: 'Alacak', amount: 'Tutar', addOption: '+ Seçenek', addLine: '+ Satır', exam: 'Sınavı yayımla', practice: 'Zorunlu alıştırma yayımla', success: 'Görev yayımlandı.', error: 'Kaydedilemedi:', active: 'Yayında', inactive: 'Pasif', deactivate: 'Pasifleştir', activate: 'Yayıma al', managed: 'Alıştırmaları yönet' },
  en: { title: 'Quest designer', intro: 'Enter Turkish and English titles, descriptions and questions. Question points must add up to 100.', nameTr: 'Title (TR)', nameEn: 'Title (EN)', descriptionTr: 'Description (TR)', descriptionEn: 'Description (EN)', difficulty: 'Difficulty', easy: 'Easy', medium: 'Medium', hard: 'Hard', rating: 'Difficulty Elo', seconds: 'Time (seconds)', questions: 'Questions', choice: '+ Multiple-choice question', journal: '+ Journal question', promptTr: 'Question (TR)', promptEn: 'Question (EN)', points: 'Points', remove: 'Remove', option: 'Option', correct: 'Correct', account: 'Account code', side: 'Side', debit: 'Debit', credit: 'Credit', amount: 'Amount', addOption: '+ Option', addLine: '+ Line', exam: 'Publish exam', practice: 'Publish required practice', success: 'Quest published.', error: 'Could not save:', active: 'Active', inactive: 'Inactive', deactivate: 'Deactivate', activate: 'Activate', managed: 'Manage practices' },
};

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function button(text, fn) {
  const node = el('button', text, 'game-chat');
  node.type = 'button'; node.addEventListener('click', fn); return node;
}
function field(label, key, type = 'text', value = '') {
  const wrapper = el('label', label, 'practice-label');
  const input = el('input'); input.type = type; input.dataset.key = key; input.value = value; input.required = true;
  wrapper.append(input); return wrapper;
}

export function renderExamEditor(lang, onPublished) {
  const t = words[lang];
  const fileText = lang === 'tr' ? {
    label: 'Sınav için soru veri dosyaları (PDF veya CSV)', choose: 'Dosya seç', empty: 'Henüz dosya seçilmedi',
    hint: 'İsteğe bağlı ekler öğrencilere gösterilir, otomatik puanlanmaz. En fazla 5 dosya; dosya başına 5 MiB, toplam 10 MiB. Dosya adında Türkçe karakter ve boşluk kullanmayın. Alıştırmalara dosya eklenemez.',
    practiceError: 'Alıştırmalar dosya eki desteklemiyor; devam etmek için seçili dosyaları kaldırın.',
    accountError: 'Dosyalar hazırlanırken Matrix hesabı değişti.',
  } : {
    label: 'Question data attachments for exams (PDF or CSV)', choose: 'Choose file', empty: 'No file selected',
    hint: 'Optional attachments are shown to students and are not graded automatically. Up to 5 files, 5 MiB each and 10 MiB total. Use ASCII filenames without spaces. Practice exercises do not support attachments.',
    practiceError: 'Practice exercises do not support attachments; remove the selected files to continue.',
    accountError: 'The Matrix account changed while preparing files.',
  };
  const root = el('section', undefined, 'exam-designer');
  const intro = el('p', t.intro, 'game-hint');
  const form = el('form', undefined, 'exam-form');
  const info = el('p', '', 'game-hint'); info.setAttribute('role', 'status');
  const base = el('div', undefined, 'editor-grid');
  base.append(field(t.nameTr, 'titleTr'), field(t.nameEn, 'titleEn'), field(t.descriptionTr, 'descriptionTr'), field(t.descriptionEn, 'descriptionEn'));
  const difficultyLabel = el('label', t.difficulty, 'practice-label');
  const difficulty = el('select'); difficulty.dataset.key = 'difficulty';
  for (const value of ['easy', 'medium', 'hard']) difficulty.add(new Option(t[value], value));
  difficultyLabel.append(difficulty);
  base.append(difficultyLabel, field(t.rating, 'rating', 'number', '100'), field(t.seconds, 'seconds', 'number', '300'));
  const questions = el('div', undefined, 'editor-questions');
  const controls = el('div', undefined, 'arena-dialog-actions');
  let nextId = 0;
  function addQuestion(type) {
    const id = `q${++nextId}`;
    const block = el('fieldset', undefined, 'exam-question');
    block.dataset.type = type; block.dataset.id = id;
    block.append(el('legend', `${id} · ${type === 'choice' ? t.choice.slice(2) : t.journal.slice(2)}`),
      field(t.promptTr, 'promptTr'), field(t.promptEn, 'promptEn'), field(t.points, 'points', 'number', '100'));
    const entries = el('div', undefined, 'editor-entries');
    let entryId = 0;
    function addEntry() {
      const entry = el('div', undefined, 'editor-entry');
      if (type === 'choice') {
        entry.dataset.id = `o${++entryId}`;
        const label = el('label', `${t.correct} (${entry.dataset.id})`, 'practice-label');
        const radio = el('input'); radio.type = 'radio'; radio.name = `${id}-correct`; radio.value = entry.dataset.id; radio.required = true;
        label.append(radio);
        entry.append(label, field(`${t.option} (TR)`, 'tr'), field(`${t.option} (EN)`, 'en'));
      } else {
        const sideLabel = el('label', t.side, 'practice-label');
        const side = el('select'); side.dataset.key = 'side';
        side.add(new Option(t.debit, 'debit')); side.add(new Option(t.credit, 'credit')); sideLabel.append(side);
        entry.append(field(t.account, 'account'), sideLabel, field(t.amount, 'amount'));
      }
      entry.append(button(t.remove, () => entry.remove())); entries.append(entry);
    }
    block.append(entries, button(type === 'choice' ? t.addOption : t.addLine, addEntry), button(t.remove, () => block.remove()));
    questions.append(block);
    for (let i = 0; i < (type === 'choice' ? 2 : 3); i++) addEntry();
  }
  controls.append(button(t.choice, () => addQuestion('choice')), button(t.journal, () => addQuestion('journal')));
  const actions = el('div', undefined, 'arena-dialog-actions');
  const exam = el('button', t.exam, 'game-button'); exam.type = 'submit'; exam.value = 'exam';
  const practice = el('button', t.practice, 'game-button'); practice.type = 'submit'; practice.value = 'practice';
  const attachments = el('input'); attachments.type = 'file'; attachments.accept = '.pdf,.csv,application/pdf,text/csv'; attachments.multiple = true;
  const attachmentPicker = createFilePicker(fileText.label, attachments, fileText);
  actions.append(exam, practice);
  form.append(base, el('h4', t.questions), questions, controls, attachmentPicker.element, el('p', fileText.hint, 'game-hint'), actions);
  addQuestion('choice');
  const managed = el('div');
  root.append(el('h3', t.title), intro, form, info, el('h4', t.managed), managed);
  function read(container, key) { return container.querySelector(`[data-key="${key}"]`).value.trim(); }
  async function refreshPractices() {
    const practices = await examApi.practices();
    managed.replaceChildren();
    for (const item of practices) {
      const row = el('div', undefined, 'exam-list-item');
      row.append(el('strong', item.exam.title[lang]), el('span', item.active ? t.active : t.inactive, 'game-badge'));
      row.append(button(item.active ? t.deactivate : t.activate, async () => {
        try { await examApi.setPracticeActive(item.id, !item.active); await refreshPractices(); await onPublished('practice'); }
        catch (error) { info.textContent = `${t.error} ${error.message}`; }
      }));
      managed.append(row);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const account = getActiveAccount();
    const submitter = event.submitter;
    exam.disabled = practice.disabled = true;
    try {
      const definition = validateExamDefinition({
        title: { tr: read(base, 'titleTr'), en: read(base, 'titleEn') },
        description: { tr: read(base, 'descriptionTr'), en: read(base, 'descriptionEn') },
        difficulty: read(base, 'difficulty'), difficultyRating: Number(read(base, 'rating')), timeLimitSeconds: Number(read(base, 'seconds')),
        questions: [...questions.children].map(block => {
          const type = block.dataset.type;
          const entries = [...block.querySelectorAll('.editor-entry')];
          const question = { id: block.dataset.id, type, points: Number(read(block, 'points')), prompt: { tr: read(block, 'promptTr'), en: read(block, 'promptEn') } };
          if (type === 'choice') {
            question.options = entries.map(entry => ({ id: entry.dataset.id, text: { tr: read(entry, 'tr'), en: read(entry, 'en') } }));
            question.answer = block.querySelector('input[type=radio]:checked')?.value;
          } else {
            question.answer = entries.map(entry => ({ accountCode: read(entry, 'account'), side: read(entry, 'side'), amount: read(entry, 'amount') }));
          }
          return question;
        }),
      });
      if (submitter === practice) {
        if (attachments.files.length) throw new Error(fileText.practiceError);
        await examApi.publishPractice(definition);
      } else {
        const files = await encodeExamFiles([...attachments.files]);
        if (account !== getActiveAccount()) throw new Error(fileText.accountError);
        await examApi.publish(definition, files);
      }
      if (account !== getActiveAccount()) return;
      attachments.value = ''; attachmentPicker.update();
      info.textContent = t.success;
      await refreshPractices();
      await onPublished(submitter === practice ? 'practice' : 'exam');
    } catch (error) { info.textContent = `${t.error} ${error.message}`; }
    finally { exam.disabled = practice.disabled = false; }
  });
  refreshPractices().catch(error => { info.textContent = `${t.error} ${error.message}`; });
  return root;
}
