import { examApi } from '../client/examApi.js';
import { getActiveAccount } from '../store/state.js';

const words = {
  tr: { title: 'Alıştırma görevleri', empty: 'Henüz ek alıştırma yok.', done: 'Tamamlandı', solve: 'Görevi çöz', submit: 'Cevabı kontrol et', account: 'Hesap kodu', side: 'Yön', debit: 'Borç', credit: 'Alacak', amount: 'Tutar', wait: 'Kontrol ediliyor…', passed: 'Görev tamamlandı.', more: 'Görev tamamlandı. Diğer zorunlu alıştırmaları da tamamla.', error: 'Alıştırma:' },
  en: { title: 'Practice quests', empty: 'No additional practice yet.', done: 'Completed', solve: 'Solve quest', submit: 'Check answer', account: 'Account code', side: 'Side', debit: 'Debit', credit: 'Credit', amount: 'Amount', wait: 'Checking…', passed: 'Quest completed.', more: 'Quest completed. Finish the other required exercises too.', error: 'Practice:' },
};

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

export function renderPracticePanel(lang, onProgress) {
  const text = words[lang];
  const root = element('section', undefined, 'game-card practice-quests');
  const status = element('p', '', 'game-hint');
  status.setAttribute('role', 'status');
  const list = element('div');
  root.append(element('h2', text.title), status, list);
  let generation = 0, destroyed = false;
  const sessionKey = () => {
    const account = getActiveAccount();
    return account ? `${account.userId}\0${account.baseUrl}\0${account.accessToken}` : '';
  };
  async function refresh() {
    const request = ++generation;
    const session = sessionKey();
    try {
      const practices = await examApi.practices();
      if (destroyed || request !== generation || session !== sessionKey()) return;
      list.replaceChildren();
      if (!practices.some(item => item.active)) list.append(element('p', text.empty, 'game-hint'));
      for (const practice of practices.filter(item => item.active)) {
        const card = element('article', undefined, 'exam-list-item');
        card.append(element('strong', practice.exam.title[lang]), element('p', practice.exam.description[lang], 'game-hint'));
        if (practice.completed) { card.append(element('span', text.done, 'game-badge')); list.append(card); continue; }
        const details = element('details');
        details.append(element('summary', text.solve));
        const form = element('form', undefined, 'exam-form');
        for (const question of practice.exam.questions) {
          const field = element('fieldset', undefined, 'exam-question');
          field.dataset.id = question.id;
          field.dataset.type = question.type;
          field.append(element('legend', question.prompt[lang]));
          if (question.type === 'choice') {
            for (const option of question.options) {
              const label = element('label', undefined, 'exam-option');
              const input = element('input');
              input.type = 'radio'; input.name = question.id; input.value = option.id;
              label.append(input, document.createTextNode(`${option.id} — ${option.text[lang]}`));
              field.append(label);
            }
          } else {
            for (let i = 0; i < question.lineCount; i++) {
              const row = element('div', undefined, 'exam-journal-row');
              row.className = 'exam-journal-row';
              for (const key of ['account', 'side', 'amount']) {
                const label = element('label', `${i + 1}. ${text[key]}`, 'practice-label');
                const input = element(key === 'side' ? 'select' : 'input');
                input.dataset.field = key;
                if (key === 'side') {
                  input.add(new Option('—', ''));
                  input.add(new Option(text.debit, 'debit'));
                  input.add(new Option(text.credit, 'credit'));
                }
                label.append(input); row.append(label);
              }
              field.append(row);
            }
          }
          form.append(field);
        }
        const submit = element('button', text.submit, 'game-button');
        submit.type = 'submit';
        form.append(submit);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const answers = {};
          for (const field of form.querySelectorAll('fieldset')) {
            if (field.dataset.type === 'choice') {
              const checked = field.querySelector('input:checked');
              if (checked) answers[field.dataset.id] = checked.value;
            } else {
              answers[field.dataset.id] = [...field.querySelectorAll('.exam-journal-row')].map(row => ({
                accountCode: row.querySelector('[data-field=account]').value.trim(),
                side: row.querySelector('[data-field=side]').value,
                amount: row.querySelector('[data-field=amount]').value.trim(),
              }));
            }
          }
          const originalSession = sessionKey();
          submit.disabled = true;
          status.textContent = text.wait;
          try {
            const profile = await examApi.completePractice(practice.id, answers);
            if (destroyed || sessionKey() !== originalSession) return;
            status.textContent = profile.qualified ? text.passed : text.more;
            await refresh();
            await onProgress(profile);
          } catch (error) {
            if (!destroyed && sessionKey() === originalSession) status.textContent = `${text.error} ${error.message}`;
          } finally { submit.disabled = false; }
        });
        details.append(form); card.append(details); list.append(card);
      }
    } catch (error) {
      if (!destroyed && request === generation) status.textContent = `${text.error} ${error.message}`;
    }
  }
  return { element: root, refresh, clear: () => { generation++; list.replaceChildren(); status.textContent = ''; }, destroy: () => { destroyed = true; generation++; } };
}
