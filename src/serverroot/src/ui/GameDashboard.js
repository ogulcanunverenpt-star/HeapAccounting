import { accounts, cashSaleQuestion, checkCashSale } from '../game/cashSale.js';
import { getLang } from '../utils/i18n.js';
import { getActiveAccount, on } from '../store/state.js';
import { examApi } from '../client/examApi.js';
import { renderExamArena } from './ExamArena.js';
import { renderAIHelpWidget } from './AIHelpWidget.js';
import { renderPracticePanel } from './PracticePanel.js';
import { renderCryptoMarket } from './CryptoMarket.js';

const copy = {
  tr: {
    practice: 'ALIŞTIRMA MODU', chat: 'Matrix sohbeti', kicker: 'GÖREV 01 / YEVMİYE',
    title: 'Muhasebe arenasına hoş geldin.', intro: 'Verileri incele. Kaydını oluştur. Zamana karşı kendini geliştir.',
    badge: 'BAŞLANGIÇ', task: cashSaleQuestion.tr.title, date: '15 OCAK 2024 · KURGUSAL SENARYO',
    story: cashSaleQuestion.tr.story,
    objective: 'Görev', objectiveText: cashSaleQuestion.tr.objective,
    source: 'Hesap adları Tekdüzen Hesap Planı esas alınarak seçilmiştir; KDV oranı bu senaryonun verilen varsayımıdır.',
    timer: 'SÜRE', mistakes: 'YANLIŞ DENEME', attempts: 'Bu oturumda', start: 'Görevi başlat', restart: 'Yeniden başla',
    formTitle: 'Yevmiye kaydın', formHint: 'Her satırda hesap, borç/alacak ve pozitif TL tutarı seç. Örnek: 1200,00 (binlik ayırıcı kullanma).',
    line: 'Satır', account: 'Hesap', choose: 'Hesap seç', side: 'Yön', sideChoose: 'Yön seç',
    debit: 'Borç', credit: 'Alacak', amount: 'Tutar (TL)', submit: 'Çözümü kontrol et',
    waiting: 'Süreyi başlatmak ve kaydı doldurmak için görevi başlat.',
    invalid: 'Her satırda geçerli bir hesap, yön ve pozitif tutar gir. Binlik ayırıcı kullanma; en fazla iki ondalık basamak gir.',
    unbalanced: 'Borç ve alacak toplamları eşit değil. Kaydını kontrol edip tekrar dene.',
    incorrect: 'Kayıt dengeli, ancak senaryonun çözümü değil. Hesapları, yönleri ve tutarları tekrar kontrol et.',
    correct: 'Doğru çözüm! Süren durduruldu. Tekrar deneyerek kendini geliştirebilirsin.',
    ranking: 'SIRALAMA', soon: 'Henüz mevcut değil', rankingText: 'Elo kuralları ve güvenilir sunucu doğrulaması henüz geliştirilmedi.',
    local: 'Alıştırmayı geçince sunucu doğrulamasıyla 100 Elo ile sıralamaya katılırsın.',
    cancel: 'Alıştırmayı bırak', cancelled: 'Alıştırma bırakıldı.',
    qualify: 'Alıştırmayı tekrar doğrula', qualifying: 'Alıştırma sunucuda doğrulanıyor…',
    qualified: 'Alıştırma doğrulandı. Sınavlar ve sıralama açıldı.',
    practiceMore: 'Bu alıştırma doğrulandı. Diğer zorunlu görevleri de tamamla.',
    practiceDone: 'Başlangıç alıştırması tamamlandı. İstersen tekrar oynayabilirsin.',
    qualifyError: 'Alıştırma sunucuda doğrulanamadı. Bağlantıyı kontrol edip tekrar doğrula.',
    accountChanged: 'Matrix hesabı değişti; alıştırmayı yeniden çöz.',
    disclaimer: 'Eğitim amaçlıdır; mevzuata uygunluk garantisi veya mesleki danışmanlık değildir. Gerçek finansal veri girmeyin.',
    navPractice: 'Alıştırma', navExams: 'Sınavlar', navRanking: 'Sıralama', navAttempt: 'Aktif sınav', navCrypto: 'Prime Kripto', navTransactions: 'İşlemler',
  },
  en: {
    practice: 'PRACTICE MODE', chat: 'Matrix chat', kicker: 'CHALLENGE 01 / JOURNAL',
    title: 'Welcome to the accounting arena.', intro: 'Review the facts. Build your entry. Improve against the clock.',
    badge: 'BEGINNER', task: cashSaleQuestion.en.title, date: '15 JANUARY 2024 · FICTIONAL SCENARIO',
    story: cashSaleQuestion.en.story,
    objective: 'Your task', objectiveText: cashSaleQuestion.en.objective,
    source: 'Account names are based on Türkiye’s uniform chart of accounts; the VAT rate is an assumption given for this scenario.',
    timer: 'TIME', mistakes: 'INCORRECT ATTEMPTS', attempts: 'This session', start: 'Start challenge', restart: 'Start again',
    formTitle: 'Your journal entry', formHint: 'Choose an account, debit/credit and a positive TRY amount for each line. Example: 1200.00 (no thousands separators).',
    line: 'Line', account: 'Account', choose: 'Choose account', side: 'Side', sideChoose: 'Choose side',
    debit: 'Debit', credit: 'Credit', amount: 'Amount (TRY)', submit: 'Check solution',
    waiting: 'Start the challenge to begin the timer and fill in your entry.',
    invalid: 'Enter a valid account, side and positive amount on every line. Use no thousands separators and at most two decimal places.',
    unbalanced: 'Debits and credits do not balance. Check your entry and try again.',
    incorrect: 'The entry balances, but does not solve the scenario. Check accounts, sides and amounts.',
    correct: 'Correct solution! Your timer has stopped. Try again to improve.',
    ranking: 'LEADERBOARD', soon: 'Not available yet', rankingText: 'Elo rules and trusted server-side verification have not been implemented.',
    local: 'After server verification of the practice challenge, you enter the leaderboard at 100 Elo.',
    cancel: 'Abandon practice', cancelled: 'Practice abandoned.',
    qualify: 'Retry practice verification', qualifying: 'Verifying practice on the server…',
    qualified: 'Practice verified. Exams and the leaderboard are unlocked.',
    practiceMore: 'This exercise is verified. Complete the other required quests too.',
    practiceDone: 'The starter practice is complete. You can play it again.',
    qualifyError: 'Practice could not be verified on the server. Check your connection and retry.',
    accountChanged: 'The Matrix account changed; solve the practice again.',
    disclaimer: 'For educational use only; not a guarantee of regulatory compliance or professional advice. Do not enter real financial data.',
    navPractice: 'Practice', navExams: 'Exams', navRanking: 'Leaderboard', navAttempt: 'Active exam', navCrypto: 'Prime Crypto', navTransactions: 'Trades',
  },
};

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function renderGameDashboard({ onChat }) {
  const lang = getLang() === 'en' ? 'en' : 'tr';
  const text = copy[lang];
  document.documentElement.lang = lang;
  const page = document.createElement('div');
  page.className = 'game-page';
  const options = accounts.map(account => `<option value="${account.code}">${account.code} — ${account[lang]}</option>`).join('');
  const rows = [1, 2, 3].map(index => `
    <div class="game-entry-row">
      <span class="game-line-number">${String(index).padStart(2, '0')}</span>
      <label><span>${text.line} ${index} · ${text.account}</span><select name="account" aria-label="${text.line} ${index}: ${text.account}"><option value="">${text.choose}</option>${options}</select></label>
      <label><span>${text.side}</span><select name="side" aria-label="${text.line} ${index}: ${text.side}"><option value="">${text.sideChoose}</option><option value="debit">${text.debit}</option><option value="credit">${text.credit}</option></select></label>
      <label><span>${text.amount}</span><input name="amount" aria-label="${text.line} ${index}: ${text.amount}" inputmode="decimal" maxlength="19" placeholder="0,00" autocomplete="off"></label>
    </div>`).join('');
  page.innerHTML = `
    <header class="game-header">
      <div class="game-brand"><span class="game-brand-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span><strong>Heap<span>Accounting</span></strong></div>
      <div class="game-header-actions"><span class="game-mode">${text.practice}</span><button type="button" class="game-chat">${text.chat} <span aria-hidden="true">↗</span></button></div>
    </header>
    <main class="game-main">
      <nav class="arena-nav" aria-label="${lang === 'tr' ? 'Oyun sayfaları' : 'Game pages'}">
        <button type="button" data-view="practice">${text.navPractice}</button>
        <button type="button" data-view="exams">${text.navExams}</button>
        <button type="button" data-view="ranking">${text.navRanking}</button>
        <button type="button" data-view="crypto">${text.navCrypto}</button>
        <button type="button" data-view="transactions">${text.navTransactions}</button>
        <button type="button" data-view="attempt" hidden>${text.navAttempt}</button>
      </nav>
      <div class="practice-view"><div class="game-intro"><p class="game-kicker">${text.kicker}</p><h1>${text.title}</h1><p>${text.intro}</p><p class="practice-status" role="status"></p></div>
      <div class="game-layout">
        <div class="game-primary">
          <section class="game-card game-challenge">
            <div class="game-card-heading"><div><p class="game-kicker">${text.date}</p><h2>${text.task}</h2></div><span class="game-badge">${text.badge}</span></div>
            <p class="game-story">${text.story}</p>
            <div class="game-objective"><strong>${text.objective}</strong><p>${text.objectiveText}</p></div>
            <p class="game-source">${text.source}</p>
          </section>
          <section class="game-card game-entry">
            <h2>${text.formTitle}</h2><p class="game-hint">${text.formHint}</p>
            <form novalidate>
              <fieldset disabled>${rows}<button type="submit" class="game-button">${text.submit} <span aria-hidden="true">→</span></button></fieldset>
              <p class="game-feedback" role="status" aria-live="polite">${text.waiting}</p>
              <button type="button" class="game-chat practice-qualify" hidden>${text.qualify}</button>
            </form>
          </section>
        </div>
        <aside class="game-aside">
          <section class="game-card game-timer-card">
            <p class="game-kicker">${text.timer}</p><span class="game-clock" aria-label="${text.timer}">00:00</span>
            <div class="game-mistakes"><span>${text.mistakes}</span><strong>0</strong></div>
            <p class="game-session">${text.attempts}</p>
            <button type="button" class="game-button game-start">${text.start} <span aria-hidden="true">→</span></button>
            <button type="button" class="game-chat game-cancel" hidden>${text.cancel}</button>
          </section>
          <p class="game-local">${text.local}</p>
        </aside>
      </div></div>
      <div class="arena-view" hidden></div>
      <div class="crypto-view" hidden></div>
      <p class="game-disclaimer">${text.disclaimer}</p>
    </main>`;

  const form = page.querySelector('form');
  const fieldset = form.querySelector('fieldset');
  const feedback = form.querySelector('.game-feedback');
  const clock = page.querySelector('.game-clock');
  const mistakeCount = page.querySelector('.game-mistakes strong');
  const start = page.querySelector('.game-start');
  const cancel = page.querySelector('.game-cancel');
  const qualify = page.querySelector('.practice-qualify');
  const practiceStatus = page.querySelector('.practice-status');
  const arena = renderExamArena(lang, {
    onAttempt: () => showView('attempt'),
    onPracticeChange: () => practicePanel.refresh(),
    onAccountChange: () => {
      const currentAttempt = nav.querySelector('[data-view="attempt"]');
      const active = currentAttempt.hasAttribute('aria-current');
      currentAttempt.hidden = true;
      if (active) showView('exams');
    },
  });
  page.querySelector('.arena-view').appendChild(arena.element);
  const practicePanel = renderPracticePanel(lang, async profile => {
    applyProfile(profile);
    await arena.refresh();
  });
  page.querySelector('.practice-view').appendChild(practicePanel.element);
  const cryptoMarket = renderCryptoMarket(lang, () => arena.refresh());
  page.querySelector('.crypto-view').appendChild(cryptoMarket.element);
  const assistant = renderAIHelpWidget(lang);
  page.appendChild(assistant.element);
  const nav = page.querySelector('.arena-nav');
  let userNavigated = false;
  function showView(view) {
    page.querySelector('.practice-view').hidden = view !== 'practice';
    const cryptoView = view === 'crypto' || view === 'transactions';
    page.querySelector('.arena-view').hidden = view === 'practice' || cryptoView;
    page.querySelector('.crypto-view').hidden = !cryptoView;
    const attemptButton = nav.querySelector('[data-view="attempt"]');
    if (view === 'attempt') attemptButton.hidden = false;
    for (const control of nav.querySelectorAll('button')) {
      if (control.dataset.view === view) control.setAttribute('aria-current', 'page');
      else control.removeAttribute('aria-current');
    }
    if (view !== 'practice' && !cryptoView) arena.showView(view);
    if (cryptoView) { cryptoMarket.setView(view); cryptoMarket.refresh(); } else cryptoMarket.hide();
    page.scrollTop = 0;
  }
  nav.addEventListener('click', event => {
    const control = event.target.closest('button[data-view]');
    if (control) { userNavigated = true; showView(control.dataset.view); }
  });
  showView('practice');
  let startedAt = null;
  let mistakes = 0;
  let timer = null;
  let busy = false;
  let correctRows = null;
  let practiceUser = null;

  function setBusy(value) {
    busy = value;
    start.disabled = value;
    cancel.disabled = value;
    qualify.disabled = value;
    fieldset.disabled = value || startedAt === null;
  }

  async function verifyPractice() {
    if (!correctRows || busy) return;
    setBusy(true);
    feedback.textContent = text.qualifying;
    try {
      if (getActiveAccount()?.userId !== practiceUser) throw new Error(text.accountChanged);
      const profile = await examApi.qualify(correctRows);
      qualify.hidden = true;
      applyProfile(profile);
      feedback.textContent = profile.qualified ? text.qualified : text.practiceMore;
      feedback.className = 'game-feedback is-correct';
      await arena.refresh();
      await practicePanel.refresh();
    } catch (error) {
      feedback.textContent = `${text.qualifyError} ${error instanceof Error ? error.message : String(error)}`;
      feedback.className = 'game-feedback is-error';
      qualify.hidden = false;
    } finally {
      setBusy(false);
    }
  }

  qualify.addEventListener('click', verifyPractice);
  page.querySelector('.game-chat').addEventListener('click', onChat);
  start.addEventListener('click', () => {
    if (busy) return;
    correctRows = null;
    practiceUser = getActiveAccount()?.userId;
    qualify.hidden = true;
    clearInterval(timer);
    form.reset();
    mistakes = 0;
    mistakeCount.textContent = '0';
    clock.textContent = '00:00';
    feedback.textContent = '';
    feedback.className = 'game-feedback';
    startedAt = performance.now();
    timer = setInterval(() => { clock.textContent = formatTime(performance.now() - startedAt); }, 250);
    start.innerHTML = `${text.restart} <span aria-hidden="true">↻</span>`;
    cancel.hidden = false;
    setBusy(false);
    form.querySelector('select').focus();
  });
  cancel.addEventListener('click', () => {
    if (busy) return;
    clearInterval(timer);
    timer = null;
    startedAt = null;
    setBusy(false);
    fieldset.disabled = true;
    cancel.hidden = true;
    feedback.textContent = text.cancelled;
    feedback.className = 'game-feedback';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || startedAt === null || fieldset.disabled) return;
    const values = [...form.querySelectorAll('.game-entry-row')].map(row => ({
      accountCode: row.querySelector('[name="account"]').value,
      side: row.querySelector('[name="side"]').value,
      amount: row.querySelector('[name="amount"]').value,
    }));
    const result = checkCashSale(values);
    if (result === 'invalid') {
      feedback.textContent = text.invalid;
      feedback.className = 'game-feedback is-error';
      return;
    }
    const newMistakes = mistakes + (result === 'correct' ? 0 : 1);
    const elapsedMs = Math.floor(performance.now() - startedAt);
    feedback.textContent = text[result];
    feedback.className = `game-feedback ${result === 'correct' ? 'is-correct' : 'is-error'}`;
    if (result === 'correct') {
      clock.textContent = formatTime(elapsedMs);
      clearInterval(timer);
      timer = null;
      startedAt = null;
      fieldset.disabled = true;
      cancel.hidden = true;
      correctRows = values;
      await verifyPractice();
    } else {
      mistakes = newMistakes;
      mistakeCount.textContent = String(mistakes);
    }
  });

  let destroyed = false, profileGeneration = 0;
  const sessionKey = () => {
    const account = getActiveAccount();
    return account ? `${account.userId}\0${account.baseUrl}\0${account.accessToken}` : '';
  };
  let session = sessionKey();
  function applyProfile(profile) {
    practiceStatus.textContent = profile.builtinPracticeCompleted ? text.practiceDone : '';
  }
  async function loadProfile() {
    const request = ++profileGeneration, current = session;
    try {
      const profile = await examApi.me();
      if (destroyed || request !== profileGeneration || current !== session) return;
      applyProfile(profile);
      if (profile.qualified && !userNavigated) showView('exams');
    } catch (error) {
      if (!destroyed && request === profileGeneration) practiceStatus.textContent = `${text.qualifyError} ${error.message}`;
    }
  }
  const unsubscribe = on('state', () => {
    const next = sessionKey();
    if (session === next) return;
    session = next;
    profileGeneration++;
    practicePanel.clear();
    cryptoMarket.reset();
    clearInterval(timer);
    timer = null; startedAt = null; correctRows = null; practiceUser = null;
    form.reset(); fieldset.disabled = true; cancel.hidden = true; qualify.hidden = true;
    practiceStatus.textContent = ''; feedback.textContent = text.accountChanged;
    userNavigated = false;
    showView('practice');
    loadProfile();
    practicePanel.refresh();
  });
  loadProfile();
  practicePanel.refresh();
  return { element: page, destroy: () => { destroyed = true; profileGeneration++; unsubscribe(); clearInterval(timer); practicePanel.destroy(); cryptoMarket.destroy(); arena.destroy(); assistant.destroy(); } };
}
