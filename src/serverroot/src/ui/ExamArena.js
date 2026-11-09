import { examApi } from '../client/examApi.js';
import { getActiveAccount, on } from '../store/state.js';
import { makeTemplate, readAnswers } from '../game/answerFiles.js';
import { renderExamEditor } from './ExamEditor.js';
import { createFilePicker } from './FilePicker.js';
import { downloadAuthorFile, encodeExamFiles, examDefinitionTemplate, questionDataTemplate } from '../game/examAuthorFiles.js';
import { validateExamDefinition } from '../game/examRules.js';

const translations = {
  tr: {
    title: 'Sınavlar ve sıralama', refresh: 'Yenile', loading: 'Yükleniyor…',
    unqualified: 'Sınavlara katılmak için önce alıştırmayı sunucuya doğrulat.',
    rating: 'Elo puanın', exams: 'Sınavlar', empty: 'Henüz yayımlanmış sınav yok.',
    easy: 'Kolay', medium: 'Orta', hard: 'Zor', difficultyRating: 'Zorluk puanı', minutes: 'Süre',
    start: 'Sınavı başlat', resume: 'Sınavı aç', complete: 'Sonucu gör',
    confirmStart: 'Bu sınava yalnızca bir kez girebilirsin. Süre hemen başlayacak. Devam edilsin mi?',
    confirmSubmit: 'Sınavı göndermek istediğine emin misin? Tekrar deneme hakkın yok.',
    submit: 'Sınavı gönder', time: 'Kalan süre', files: 'Soru dosyaları', points: 'puan',
    line: 'Satır', account: 'Hesap kodu', side: 'Yön', debit: 'Borç', credit: 'Alacak', amount: 'Tutar (TL)',
    select: 'Seç', invalid: 'Doldurulan yevmiye sorusunda tüm satırlar tamamlanmalı.',
    leaderboard: 'Sıralama', results: 'Sonuçların', noResults: 'Henüz sınav sonucu yok.',
    score: 'Sınav puanı', elapsed: 'Geçen süre', before: 'Önce', after: 'Sonra', solutions: 'Cevap anahtarı',
    active: 'Devam ediyor', finished: 'Tamamlandı', expired: 'Süre doldu',
    admin: 'Sınav yayımla', json: 'Sınav tanımı (JSON)', attachments: 'Soru dosyaları (PDF veya CSV)',
    publish: 'Yayımla', published: 'Sınav yayımlandı.', fileLimit: 'En fazla 5 dosya; dosya başına 5 MB, toplam 10 MB.',
    practiceUpdated: 'Alıştırma güncellendi.',
    error: 'Sınav servisi:', failed: 'İşlem başarısız', noFile: 'JSON sınav tanımı seç.',
    format: 'Puanlanan soruları ve cevap anahtarını JSON tanımında doldurun. PDF/CSV soru dosyaları, sınav sırasında gösterilen ek verilerdir; içeriği otomatik puanlanmaz. Cevap anahtarını ek dosyalara koymayın.',
    downloadDefinition: 'Örnek sınav ve soru tanımını indir (JSON)', downloadQuestionData: 'Örnek soru veri dosyasını indir (CSV)',
    fileNameHint: 'Dosya adlarında yalnızca İngilizce harf, rakam, nokta, alt çizgi veya tire kullanın. JSON en fazla 1 MiB.',
    note: 'Süre ve puan sunucuda hesaplanır. Sınav sırasında yapay zekâ yardımı kapalıdır; Matrix senkronizasyonu henüz etkin değildir.',
    downloadCsv: 'CSV şablonunu indir', downloadExcel: 'Excel şablonunu indir', answerFile: 'Cevap dosyası (CSV veya XLSX)',
    chooseFile: 'Dosya seç', noFileSelected: 'Henüz dosya seçilmedi',
    fileHint: 'Dosya seçersen ekrandaki cevapların yerine dosyadaki cevaplar gönderilir. Seçimlerde şık kodunu, yevmiyede debit/credit kullan. En fazla 1 MiB.',
    confirm: 'Devam et', cancel: 'Vazgeç', confirmTitle: 'Görev onayı',
    primeUnlocked: 'PRIME AÇIK', primeProgress: 'Prime yolculuğu', player: 'OYUNCU',
  },
  en: {
    title: 'Exams and leaderboard', refresh: 'Refresh', loading: 'Loading…',
    unqualified: 'Complete and verify the practice challenge before entering exams.',
    rating: 'Your Elo', exams: 'Exams', empty: 'No exams have been published.',
    easy: 'Easy', medium: 'Medium', hard: 'Hard', difficultyRating: 'Difficulty rating', minutes: 'Time limit',
    start: 'Start exam', resume: 'Open exam', complete: 'View result',
    confirmStart: 'You can enter this exam only once. The timer starts immediately. Continue?',
    confirmSubmit: 'Submit this exam? You cannot attempt it again.',
    submit: 'Submit exam', time: 'Time remaining', files: 'Question files', points: 'points',
    line: 'Line', account: 'Account code', side: 'Side', debit: 'Debit', credit: 'Credit', amount: 'Amount (TRY)',
    select: 'Select', invalid: 'Complete every line in any journal answer you enter.',
    leaderboard: 'Leaderboard', results: 'Your results', noResults: 'No exam results yet.',
    score: 'Exam score', elapsed: 'Elapsed time', before: 'Before', after: 'After', solutions: 'Answer key',
    active: 'In progress', finished: 'Completed', expired: 'Time expired',
    admin: 'Publish an exam', json: 'Exam definition (JSON)', attachments: 'Question files (PDF or CSV)',
    publish: 'Publish', published: 'Exam published.', fileLimit: 'Up to 5 files; 5 MB per file, 10 MB total.',
    practiceUpdated: 'Practice updated.',
    error: 'Exam service:', failed: 'Operation failed', noFile: 'Choose a JSON exam definition.',
    format: 'Enter graded questions and answer keys in the JSON definition. PDF/CSV question files are supplementary data shown during the exam and are not graded automatically. Do not put answer keys in attachments.',
    downloadDefinition: 'Download example exam and question definition (JSON)', downloadQuestionData: 'Download example question data (CSV)',
    fileNameHint: 'Use only ASCII letters, numbers, dots, underscores or hyphens in attachment names. JSON is limited to 1 MiB.',
    note: 'Time and score are calculated on the server. AI help is unavailable during exams; Matrix synchronization is not active yet.',
    downloadCsv: 'Download CSV template', downloadExcel: 'Download Excel template', answerFile: 'Answer file (CSV or XLSX)',
    chooseFile: 'Choose file', noFileSelected: 'No file selected',
    fileHint: 'A selected file replaces the answers entered on screen. Use the option ID for choices and debit/credit for journal lines. Maximum 1 MiB.',
    confirm: 'Continue', cancel: 'Cancel', confirmTitle: 'Confirm challenge',
    primeUnlocked: 'PRIME UNLOCKED', primeProgress: 'Road to Prime', player: 'PLAYER',
  },
};

function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (className) element.className = className;
  return element;
}

function button(text, handler) {
  const result = node('button', text, 'game-chat');
  result.type = 'button';
  result.addEventListener('click', handler);
  return result;
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function renderExamArena(lang, { onAttempt = () => {}, onAccountChange = () => {}, onPracticeChange = () => {} } = {}) {
  const text = translations[lang];
  const root = node('section', undefined, 'game-card exam-arena');
  root.innerHTML = `<h2>${text.title}</h2><p class="game-hint">${text.note}</p>
    <button type="button" class="game-chat exam-refresh">${text.refresh}</button>
    <p class="exam-message" role="status" aria-live="polite"></p>
    <div class="exam-profile"></div><div class="exam-list"></div><div class="exam-content"></div>
    <div class="exam-board"></div><div class="exam-results"></div><div class="exam-admin"></div>`;
  const message = root.querySelector('.exam-message');
  const profile = root.querySelector('.exam-profile');
  const listing = root.querySelector('.exam-list');
  const content = root.querySelector('.exam-content');
  const board = root.querySelector('.exam-board');
  const results = root.querySelector('.exam-results');
  const admin = root.querySelector('.exam-admin');
  let interval = null;
  let destroyed = false;
  let selected = null;
  let busy = false;
  let generation = 0;
  let openDialog = null;
  const sessionKey = () => {
    const account = getActiveAccount();
    return account ? `${account.userId}\0${account.baseUrl}\0${account.accessToken}` : '';
  };
  let currentSession = sessionKey();
  let view = 'exams';
  function showView(next) {
    view = next;
    listing.hidden = view !== 'exams';
    admin.hidden = view !== 'exams';
    content.hidden = view !== 'attempt';
    board.hidden = view !== 'ranking';
    results.hidden = view !== 'ranking';
  }
  showView(view);

  function report(error) {
    message.textContent = `${text.error} ${error instanceof Error ? error.message : String(error)}`;
    message.classList.add('is-error');
  }

  function clearTimer() { clearInterval(interval); interval = null; }
  function confirmAction(question) {
    return new Promise(resolve => {
      const dialog = node('dialog', undefined, 'arena-dialog');
      openDialog = dialog;
      const title = node('h3', text.confirmTitle);
      const message = node('p', question);
      const actions = node('div', undefined, 'arena-dialog-actions');
      const cancel = button(text.cancel, () => dialog.close('cancel'));
      const accept = node('button', text.confirm, 'game-button');
      accept.type = 'button';
      accept.addEventListener('click', () => dialog.close('confirm'));
      actions.append(cancel, accept);
      dialog.append(title, message, actions);
      dialog.addEventListener('close', () => {
        const accepted = dialog.returnValue === 'confirm';
        if (openDialog === dialog) openDialog = null;
        dialog.remove();
        resolve(accepted);
      }, { once: true });
      root.appendChild(dialog);
      dialog.showModal();
      cancel.focus();
    });
  }

  function showResult(attempt) {
    clearTimer();
    content.replaceChildren(node('h3', `${text.complete}: ${attempt.examTitle[lang]}`));
    const summary = node('p', `${text[attempt.status] || attempt.status} · ${text.score}: ${attempt.score}/100 · ${text.elapsed}: ${formatTime(attempt.durationMs || 0)} · ${text.before}: ${attempt.ratingBefore} → ${text.after}: ${attempt.ratingAfter}`, 'game-hint');
    content.appendChild(summary);
    content.appendChild(node('h4', text.solutions));
    content.appendChild(node('pre', JSON.stringify(attempt.solutions, null, 2), 'exam-solutions'));
  }

  async function openAttempt(id) {
    clearTimer();
    selected = id;
    onAttempt();
    const session = sessionKey();
    const attempt = await examApi.attempt(id);
    if (destroyed || selected !== id || session !== sessionKey()) return;
    if (attempt.status !== 'active') { showResult(attempt); return; }
    content.replaceChildren(node('h3', attempt.exam.title[lang]));
    content.appendChild(node('p', attempt.exam.description[lang], 'game-hint'));
    const clock = node('p', `${text.time}: ${formatTime(attempt.remainingMs)}`, 'exam-clock');
    content.appendChild(clock);
    const timeBar = node('progress', undefined, 'arena-timebar');
    timeBar.max = attempt.exam.timeLimitSeconds * 1000;
    timeBar.value = attempt.remainingMs;
    timeBar.setAttribute('aria-label', text.time);
    content.appendChild(timeBar);
    const deadline = performance.now() + attempt.remainingMs;
    interval = setInterval(() => {
      const left = Math.max(0, deadline - performance.now());
      clock.textContent = `${text.time}: ${formatTime(left)}`;
      timeBar.value = left;
      if (left === 0) {
        clearTimer();
        openAttempt(id).catch(report);
      }
    }, 1000);
    if (attempt.files.length) {
      content.appendChild(node('h4', text.files));
      for (const file of attempt.files) content.appendChild(button(file.filename, async () => {
        try {
          const blob = await examApi.file(attempt.examId, file.id);
          if (destroyed || session !== sessionKey()) return;
          const url = URL.createObjectURL(blob);
          const link = node('a');
          link.href = url;
          link.download = file.filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { report(error); }
      }));
    }
    const form = node('form', undefined, 'exam-form');
    const fileTools = node('div', undefined, 'exam-file-tools');
    for (const [format, label] of [['csv', text.downloadCsv], ['xlsx', text.downloadExcel]]) {
      fileTools.appendChild(button(label, async () => {
        try {
          const blob = await makeTemplate(attempt.exam, format, lang);
          const url = URL.createObjectURL(blob);
          const link = node('a');
          link.href = url;
          link.download = `answers.${format}`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { report(error); }
      }));
    }
    const answerFile = node('input');
    answerFile.type = 'file';
    answerFile.accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const pickerText = { choose: text.chooseFile, empty: text.noFileSelected };
    const answerPicker = createFilePicker(text.answerFile, answerFile, pickerText);
    fileTools.append(answerPicker.element, node('p', text.fileHint, 'game-hint'));
    form.appendChild(fileTools);
    for (const [index, question] of attempt.exam.questions.entries()) {
      const group = node('fieldset', undefined, 'exam-question');
      group.appendChild(node('legend', `${index + 1}. ${question.prompt[lang]} (${question.points} ${text.points})`));
      if (question.type === 'choice') {
        for (const option of question.options) {
          const label = node('label', undefined, 'exam-option');
          const radio = node('input');
          radio.type = 'radio';
          radio.name = question.id;
          radio.value = option.id;
          label.append(radio, document.createTextNode(`${option.id} — ${option.text[lang]}`));
          group.appendChild(label);
        }
      } else {
        for (let i = 0; i < question.lineCount; i++) {
          const row = node('div', undefined, 'exam-journal-row');
          for (const [field, labelText] of [['account', text.account], ['side', text.side], ['amount', text.amount]]) {
            const label = node('label', `${text.line} ${i + 1} · ${labelText}`, 'practice-label');
            const input = node(field === 'side' ? 'select' : 'input');
            input.dataset.field = field;
            if (field === 'side') {
              input.add(new Option(text.select, ''));
              input.add(new Option(text.debit, 'debit'));
              input.add(new Option(text.credit, 'credit'));
            } else if (field === 'amount') input.inputMode = 'decimal';
            label.appendChild(input);
            row.appendChild(label);
          }
          group.appendChild(row);
        }
      }
      group.dataset.questionId = question.id;
      group.dataset.type = question.type;
      form.appendChild(group);
    }
    const submit = node('button', text.submit, 'game-button');
    submit.type = 'submit';
    form.appendChild(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      submit.disabled = true;
      try {
      let answers = {};
      if (answerFile.files.length) answers = await readAnswers(attempt.exam, answerFile.files[0]);
      else for (const group of form.querySelectorAll('.exam-question')) {
        if (group.dataset.type === 'choice') {
          const chosen = group.querySelector('input:checked');
          if (chosen) answers[group.dataset.questionId] = chosen.value;
        } else {
          const lines = [...group.querySelectorAll('.exam-journal-row')].map(row => ({
            accountCode: row.querySelector('[data-field="account"]').value.trim(),
            side: row.querySelector('[data-field="side"]').value,
            amount: row.querySelector('[data-field="amount"]').value.trim(),
          }));
          if (lines.some(line => line.accountCode || line.side || line.amount)) {
            if (lines.some(line => !line.accountCode || !line.side || !line.amount)) throw new Error(text.invalid);
            answers[group.dataset.questionId] = lines;
          }
        }
      }
      if (destroyed || session !== sessionKey()) return;
      if (!await confirmAction(text.confirmSubmit)) return;
        if (destroyed || session !== sessionKey()) return;
        const completed = await examApi.submit(id, answers);
        if (destroyed || session !== sessionKey()) return;
        showResult(completed);
        await refresh(false);
      } catch (error) { report(error); }
      finally { busy = false; submit.disabled = false; }
    });
    content.appendChild(form);
  }

  function renderAdmin() {
    admin.replaceChildren(node('h3', text.admin), node('p', text.format, 'game-hint'));
    const templates = node('div', undefined, 'arena-dialog-actions exam-template-actions');
    templates.append(
      button(text.downloadDefinition, () => {
        try { downloadAuthorFile(examDefinitionTemplate(), 'exam-template.json'); } catch (error) { report(error); }
      }),
      button(text.downloadQuestionData, () => {
        try { downloadAuthorFile(questionDataTemplate(), 'question-data-template.csv'); } catch (error) { report(error); }
      }),
    );
    admin.append(templates, node('p', text.fileNameHint, 'game-hint'));
    admin.appendChild(renderExamEditor(lang, async kind => {
      await onPracticeChange();
      await refresh();
      message.textContent = kind === 'practice' ? text.practiceUpdated : text.published;
    }));
    const form = node('form', undefined, 'exam-admin-form');
    const jsonFile = node('input');
    jsonFile.type = 'file';
    jsonFile.accept = '.json,application/json';
    const attachments = node('input');
    attachments.type = 'file';
    attachments.accept = '.pdf,.csv,application/pdf,text/csv';
    attachments.multiple = true;
    const pickerText = { choose: text.chooseFile, empty: text.noFileSelected };
    const jsonPicker = createFilePicker(text.json, jsonFile, pickerText);
    const attachmentsPicker = createFilePicker(text.attachments, attachments, pickerText);
    const submit = node('button', text.publish, 'game-button');
    submit.type = 'submit';
    form.append(jsonPicker.element, attachmentsPicker.element, node('p', text.fileLimit, 'game-hint'), submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      submit.disabled = true;
      const session = sessionKey();
      try {
        const file = jsonFile.files[0];
        if (!file || file.size > 1024 * 1024) throw new Error(text.noFile);
        const definition = validateExamDefinition(JSON.parse(await file.text()));
        const files = await encodeExamFiles([...attachments.files]);
        if (destroyed || session !== sessionKey()) throw new Error('Matrix account changed during the request');
        await examApi.publish(definition, files);
        if (destroyed || session !== sessionKey()) return;
        form.reset();
        jsonPicker.update();
        attachmentsPicker.update();
        await refresh(!selected);
        message.textContent = text.published;
        message.classList.remove('is-error');
      } catch (error) { report(error); }
      finally { busy = false; submit.disabled = false; }
    });
    admin.appendChild(form);
  }

  async function refresh() {
    const requestGeneration = ++generation;
    message.textContent = text.loading;
    message.classList.remove('is-error');
    try {
      const me = await examApi.me();
      const [exams, rankings, history] = await Promise.all([examApi.exams(), examApi.leaderboard(), examApi.results()]);
      if (destroyed || requestGeneration !== generation) return;
      profile.replaceChildren();
      if (me.qualified) {
        profile.append(node('span', text.player, 'game-kicker'), node('strong', `${me.rating} ELO`, 'arena-profile-rating'),
          node('span', me.primeUnlocked ? text.primeUnlocked : `${text.primeProgress} · ${Math.min(me.rating, 500)}/500`, 'game-badge'));
        const progress = node('progress', undefined, 'arena-timebar');
        progress.max = 500; progress.value = Math.min(me.rating, 500); progress.setAttribute('aria-label', text.primeProgress);
        profile.append(progress);
      } else profile.textContent = text.unqualified;
      listing.replaceChildren(node('h3', text.exams));
      if (!exams.length) listing.appendChild(node('p', text.empty, 'game-hint'));
      for (const exam of exams) {
        const card = node('div', undefined, 'exam-list-item arena-exam-card');
        card.appendChild(node('strong', exam.title[lang]));
        card.appendChild(node('p', `${text[exam.difficulty]} · ${text.difficultyRating}: ${exam.difficultyRating} · ${text.minutes}: ${formatTime(exam.timeLimitSeconds * 1000)}`, 'game-hint'));
        const action = button(exam.attemptId ? (exam.attemptStatus === 'active' ? text.resume : text.complete) : text.start, async () => {
          if (busy) return;
          const session = sessionKey();
          busy = true;
          action.disabled = true;
          try {
            if (exam.attemptId) return await openAttempt(exam.attemptId);
            if (!await confirmAction(text.confirmStart)) return;
            if (destroyed || session !== sessionKey()) return;
            const attempt = await examApi.start(exam.id);
            if (destroyed || session !== sessionKey()) return;
            await openAttempt(attempt.id);
          } catch (error) { report(error); }
          finally { busy = false; action.disabled = !me.qualified; }
        });
        action.disabled = !me.qualified;
        card.appendChild(action);
        listing.appendChild(card);
      }
      board.replaceChildren(node('h3', text.leaderboard));
      const rankingList = node('ol', undefined, 'arena-rankings');
      for (const [index, entry] of rankings.entries()) {
        const row = node('li', undefined, `arena-ranking ${index < 3 ? `rank-${index + 1}` : ''}`);
        row.append(node('span', `#${index + 1}`, 'arena-rank-number'), node('strong', entry.userId), node('span', `${entry.rating} ELO`, 'game-badge'));
        rankingList.appendChild(row);
      }
      board.appendChild(rankingList);
      results.replaceChildren(node('h3', text.results));
      if (!history.length) results.appendChild(node('p', text.noResults, 'game-hint'));
      for (const entry of history) {
        const row = node('div', undefined, 'exam-list-item');
        const details = entry.status === 'active' ? text.active : `${text[entry.status]} · ${text.score}: ${entry.score}/100 · ${text.elapsed}: ${formatTime(entry.durationMs || 0)} · ${entry.ratingBefore} → ${entry.ratingAfter}`;
        row.append(node('strong', entry.examTitle[lang]), node('p', details), button(entry.status === 'active' ? text.resume : text.complete, () => { openAttempt(entry.id).catch(report); }));
        results.appendChild(row);
      }
      if (me.isAdmin) renderAdmin(); else admin.replaceChildren();
      message.textContent = '';
    } catch (error) { if (!destroyed && requestGeneration === generation) report(error); }
  }

  const unsubscribe = on('state', () => {
    const nextSession = sessionKey();
    if (nextSession === currentSession) return;
    currentSession = nextSession;
    if (openDialog && openDialog.open) openDialog.close('cancel');
    generation++;
    selected = null;
    clearTimer();
    profile.replaceChildren();
    listing.replaceChildren();
    content.replaceChildren();
    board.replaceChildren();
    results.replaceChildren();
    admin.replaceChildren();
    onAccountChange();
    refresh().catch(report);
  });
  root.querySelector('.exam-refresh').addEventListener('click', () => { refresh().catch(report); });
  refresh().catch(report);
  return { element: root, refresh, showView, destroy: () => {
    destroyed = true;
    generation++;
    unsubscribe();
    clearTimer();
    if (openDialog && openDialog.open) openDialog.close('cancel');
  } };
}
