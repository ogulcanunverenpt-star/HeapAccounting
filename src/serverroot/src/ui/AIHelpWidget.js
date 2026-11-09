import { examApi } from '../client/examApi.js';
import { getActiveAccount, on } from '../store/state.js';

const copy = {
  tr: {
    open: 'Yapay zekâ yardımını aç',
    close: 'Yardımı kapat',
    title: 'Yapay zekâ yardımı',
    subtitle: 'Muhasebe arenandaki yardımcın',
    status: 'Henüz bağlı değil',
    heading: 'Birlikte çözelim',
    description: 'Yapay zekâ bağlantısı kurulduğunda muhasebe konuları ve uygulamanın kullanımı hakkında buradan yardım alabileceksin.',
    privacy: 'Kişisel veya gerçek finansal veri girmeyin. Gemini seçilirse mesaj Google’a gönderilir.',
    input: 'Yardım mesajın',
    placeholder: 'Yapay zekâ bağlantısı bekleniyor',
    send: 'Gönder',
    consent: 'Mesajımın Google Gemini’ye gönderilmesini kabul ediyorum.',
    ready: 'Hazır', unavailable: 'Asistan kullanılamıyor', sending: 'Yanıt hazırlanıyor…',
    examBlocked: 'Asistan, puanlı sınav devam ederken kullanılamaz.',
  },
  en: {
    open: 'Open AI help',
    close: 'Close help',
    title: 'AI help',
    subtitle: 'Your accounting arena assistant',
    status: 'Not connected yet',
    heading: 'Let’s solve it together',
    description: 'Once AI is connected, you can get help here with accounting topics and using the app.',
    privacy: 'Do not enter personal or real financial data. Gemini sends your message to Google.',
    input: 'Your help message',
    placeholder: 'Waiting for an AI connection',
    send: 'Send',
    consent: 'I agree to send my message to Google Gemini.',
    ready: 'Ready', unavailable: 'Assistant unavailable', sending: 'Preparing answer…',
    examBlocked: 'The assistant is unavailable during a scored exam.',
  },
};

export function renderAIHelpWidget(lang) {
  const text = copy[lang] || copy.tr;
  const widget = document.createElement('div');
  widget.className = 'ai-help';
  widget.innerHTML = `
    <section class="ai-help-panel" id="ai-help-panel" role="dialog" aria-labelledby="ai-help-title" hidden>
      <header class="ai-help-header">
        <span class="ai-help-avatar" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
        <div class="ai-help-heading"><h2 id="ai-help-title">${text.title}</h2><p>${text.subtitle}</p></div>
        <button type="button" class="ai-help-close" aria-label="${text.close}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      <div class="ai-help-body">
        <p class="ai-help-status"><span aria-hidden="true"></span>${text.status}</p>
        <div class="ai-help-welcome">
          <span class="ai-help-welcome-icon" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
          <h3>${text.heading}</h3>
          <p>${text.description}</p>
        </div>
        <div class="ai-help-messages" role="log" aria-live="polite"></div>
        <p class="ai-help-error" role="status"></p>
        <p class="ai-help-privacy"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${text.privacy}</p>
      </div>
      <div class="ai-help-composer">
        <label class="ai-help-sr-only" for="ai-help-input">${text.input}</label>
        <div class="ai-help-input-wrap">
          <label class="ai-help-consent" hidden><input type="checkbox"> ${text.consent}</label>
          <textarea id="ai-help-input" rows="2" maxlength="2000" placeholder="${text.placeholder}" disabled></textarea>
        </div>
        <button type="button" class="ai-help-send" disabled>${text.send} <i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
      </div>
    </section>
    <button type="button" class="ai-help-trigger" aria-label="${text.open}" aria-expanded="false" aria-controls="ai-help-panel">
      <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
    </button>`;

  const panel = widget.querySelector('.ai-help-panel');
  const trigger = widget.querySelector('.ai-help-trigger');
  const close = widget.querySelector('.ai-help-close');
  const status = widget.querySelector('.ai-help-status');
  const description = widget.querySelector('.ai-help-welcome p');
  const messages = widget.querySelector('.ai-help-messages');
  const error = widget.querySelector('.ai-help-error');
  const input = widget.querySelector('textarea');
  const send = widget.querySelector('.ai-help-send');
  const consentLabel = widget.querySelector('.ai-help-consent');
  const consent = consentLabel.querySelector('input');
  let provider = 'disabled', busy = false, generation = 0, destroyed = false;
  let history = [];
  const sessionKey = () => {
    const account = getActiveAccount();
    return account ? `${account.userId}\0${account.baseUrl}\0${account.accessToken}` : '';
  };
  let session = sessionKey();
  function update() {
    input.disabled = provider === 'disabled' || busy;
    send.disabled = input.disabled || (provider === 'gemini' && !consent.checked);
    consentLabel.hidden = provider !== 'gemini';
  }
  async function loadStatus() {
    const request = ++generation;
    try {
      const result = await examApi.aiStatus();
      if (destroyed || request !== generation) return;
      if (!['disabled', 'ollama', 'gemini'].includes(result)) throw new Error('Invalid AI provider');
      provider = result;
      status.textContent = provider === 'disabled' ? text.status : `${text.ready} · ${provider === 'gemini' ? 'Gemini' : 'Ollama'}`;
      description.textContent = provider === 'disabled' ? text.description : text.privacy;
      input.placeholder = provider === 'disabled' ? text.placeholder : text.input;
      error.textContent = '';
    } catch (failure) {
      if (destroyed || request !== generation) return;
      provider = 'disabled';
      error.textContent = `${text.unavailable}: ${failure.message}`;
    }
    update();
  }
  function addMessage(role, content) {
    const message = document.createElement('p');
    message.className = `ai-help-message ${role}`;
    message.textContent = content;
    messages.appendChild(message);
    message.scrollIntoView({ block: 'nearest' });
  }
  send.addEventListener('click', async () => {
    if (busy || !input.value.trim() || send.disabled) return;
    const message = input.value.trim(), request = generation, requestSession = session;
    busy = true;
    update();
    error.textContent = text.sending;
    try {
      const result = await examApi.assistant(message, consent.checked, history);
      if (destroyed || request !== generation || requestSession !== session) return;
      addMessage('user', message);
      addMessage('assistant', result.answer);
      history = [...history, { role: 'user', text: message }, { role: 'assistant', text: result.answer.slice(0, 2000) }].slice(-4);
      input.value = '';
      error.textContent = '';
    } catch (failure) {
      if (!destroyed && request === generation && requestSession === session) {
        error.textContent = failure.message.includes('active exam') ? text.examBlocked : `${text.unavailable}: ${failure.message}`;
      }
    } finally { busy = false; if (!destroyed) update(); }
  });
  consent.addEventListener('change', update);
  function setOpen(open) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) { close.focus(); loadStatus(); }
    else trigger.focus();
  }
  trigger.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  widget.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      setOpen(false);
    }
  });
  const unsubscribe = on('state', () => {
    const next = sessionKey();
    if (next === session) return;
    session = next;
    generation++;
    messages.replaceChildren();
    history = [];
    input.value = '';
    consent.checked = false;
    provider = 'disabled';
    error.textContent = '';
    update();
    if (!panel.hidden) loadStatus();
  });
  return { element: widget, destroy: () => { destroyed = true; generation++; unsubscribe(); } };
}
