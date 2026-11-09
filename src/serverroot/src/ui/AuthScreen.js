import { loginWithPassword } from '../client/matrix.js';
import { emit } from '../store/state.js';
import { getLang } from '../utils/i18n.js';
import { verifyTotpCode } from '../utils/totp.js';

const translations = {
  tr: {
    back: 'Ana sayfaya dön',
    tagline: 'Muhasebe bilgini oyuna taşı',
    login: 'Giriş yap',
    register: 'Hesap oluştur',
    homeserver: 'Matrix sunucusu',
    username: 'Kullanıcı adı',
    password: 'Şifre',
    code: 'Bu tarayıcıdaki doğrulama kodu',
    codeNote: 'Bu kod yalnızca bu tarayıcıda kontrol edilir; Matrix sunucusunun iki aşamalı doğrulaması değildir.',
    required: 'Lütfen tüm alanları doldurun.',
    invalidCode: 'Geçersiz doğrulama kodu. Lütfen tekrar deneyin.',
    verify: 'Kodu doğrula ve giriş yap',
    signingIn: 'Giriş yapılıyor…',
    failed: 'Giriş yapılamadı. Lütfen tekrar deneyin.',
    registerTitle: 'Önce bir Matrix hesabı oluşturun',
    registerDescription: 'HeapAccounting henüz doğrudan hesap oluşturmuyor. Bir Matrix sağlayıcısında hesap oluşturduktan sonra bu ekrana dönerek giriş yapabilirsiniz.',
    registerLink: 'Element ile Matrix hesabı oluştur',
    registerNote: 'Hesabınızın kayıt ve doğrulama koşulları seçtiğiniz Matrix sağlayıcısı tarafından belirlenir.',
    haveAccount: 'Zaten hesabım var',
  },
  en: {
    back: 'Back to home',
    tagline: 'Put your accounting skills into play',
    login: 'Sign in',
    register: 'Create account',
    homeserver: 'Matrix homeserver',
    username: 'Username',
    password: 'Password',
    code: 'Verification code for this browser',
    codeNote: 'This code is checked only in this browser; it is not two-factor authentication enforced by your Matrix server.',
    required: 'Please complete all fields.',
    invalidCode: 'Invalid verification code. Please try again.',
    verify: 'Verify code and sign in',
    signingIn: 'Signing in…',
    failed: 'Unable to sign in. Please try again.',
    registerTitle: 'Create a Matrix account first',
    registerDescription: 'HeapAccounting does not yet create accounts directly. Create an account with a Matrix provider, then return here to sign in.',
    registerLink: 'Create a Matrix account with Element',
    registerNote: 'Registration and verification requirements are determined by your chosen Matrix provider.',
    haveAccount: 'I already have an account',
  },
};

export function renderAuthScreen({ initialTab = 'login', onBack } = {}) {
  const el = document.createElement('div');
  el.id = 'auth-screen';
  const text = translations[getLang() === 'en' ? 'en' : 'tr'];
  let currentTab = initialTab === 'register' ? 'register' : 'login';

  function render() {
    el.innerHTML = `
      <div class="auth-card">
        <button type="button" class="auth-back">← ${text.back}</button>
        <div class="auth-logo">Heap<span>Accounting</span></div>
        <div class="auth-tagline">${text.tagline}</div>
        <div class="auth-tabs">
          <button type="button" class="auth-tab ${currentTab === 'login' ? 'active' : ''}" id="tab-login" aria-pressed="${currentTab === 'login'}">${text.login}</button>
          <button type="button" class="auth-tab ${currentTab === 'register' ? 'active' : ''}" id="tab-register" aria-pressed="${currentTab === 'register'}">${text.register}</button>
        </div>
        <div id="auth-form-body"></div>
      </div>
    `;
    el.querySelector('.auth-back').addEventListener('click', () => onBack?.());
    el.querySelector('#tab-login').addEventListener('click', () => { currentTab = 'login'; render(); });
    el.querySelector('#tab-register').addEventListener('click', () => { currentTab = 'register'; render(); });

    const body = el.querySelector('#auth-form-body');
    if (currentTab === 'register') {
      body.innerHTML = `
        <div class="auth-registration">
          <h1>${text.registerTitle}</h1>
          <p>${text.registerDescription}</p>
          <a class="btn-primary auth-register-link" href="https://app.element.io/#/register" target="_blank" rel="noopener noreferrer">${text.registerLink} ↗</a>
          <p class="auth-registration-note">${text.registerNote}</p>
          <button type="button" class="auth-register-login">${text.haveAccount}</button>
        </div>
      `;
      body.querySelector('.auth-register-login').addEventListener('click', () => { currentTab = 'login'; render(); });
      return;
    }

    body.innerHTML = `
      <form id="auth-login-form">
        <div class="form-field">
          <label class="form-label" for="auth-hs">${text.homeserver}</label>
          <input class="form-input" id="auth-hs" value="matrix.org" placeholder="matrix.org" required />
        </div>
        <div class="form-field">
          <label class="form-label" for="auth-user">${text.username}</label>
          <input class="form-input" id="auth-user" placeholder="@you:matrix.org" autocomplete="username" required />
        </div>
        <div class="form-field">
          <label class="form-label" for="auth-pass">${text.password}</label>
          <input class="form-input" type="password" id="auth-pass" placeholder="••••••••" autocomplete="current-password" required />
        </div>
        <div class="form-field auth-code-field" id="totp-login-field" hidden>
          <label class="form-label" for="auth-2fa-code">${text.code}</label>
          <input class="form-input" id="auth-2fa-code" placeholder="000000" inputmode="numeric" maxlength="6" autocomplete="one-time-code" />
          <p class="auth-registration-note">${text.codeNote}</p>
        </div>
        <div class="form-error" id="auth-error" role="alert"><span>⚠</span><span id="auth-error-text"></span></div>
        <button class="btn-primary" id="auth-submit" type="submit">${text.login}</button>
      </form>
    `;

    const form = body.querySelector('#auth-login-form');
    const btn = body.querySelector('#auth-submit');
    const errEl = body.querySelector('#auth-error');
    const errText = body.querySelector('#auth-error-text');
    const totpField = body.querySelector('#totp-login-field');
    let pending2faUser = null;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const hs = body.querySelector('#auth-hs').value.trim();
      const user = body.querySelector('#auth-user').value.trim();
      const pass = body.querySelector('#auth-pass').value;
      const totpCode = body.querySelector('#auth-2fa-code').value.trim();
      if (!hs || !user || !pass) {
        errText.textContent = text.required;
        errEl.classList.add('visible');
        return;
      }

      const fullUserId = user.startsWith('@') ? user : `@${user}:${hs}`;
      const saved2faSecret = localStorage.getItem(`cundai_2fa_${fullUserId}`);
      if (saved2faSecret && pending2faUser !== fullUserId) {
        pending2faUser = fullUserId;
        totpField.hidden = false;
        btn.textContent = text.verify;
        body.querySelector('#auth-2fa-code').focus();
        return;
      }
      if (saved2faSecret && !await verifyTotpCode(saved2faSecret, totpCode)) {
        errText.textContent = text.invalidCode;
        errEl.classList.add('visible');
        return;
      }

      errEl.classList.remove('visible');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> ${text.signingIn}`;
      try {
        const result = await loginWithPassword(hs, user, pass);
        if (result.ok) {
          emit('auth-success');
          return;
        }
        errText.textContent = result.error;
      } catch (error) {
        console.error('Matrix login failed:', error);
        errText.textContent = text.failed;
      }
      errEl.classList.add('visible');
      btn.disabled = false;
      btn.textContent = saved2faSecret ? text.verify : text.login;
    });
  }

  render();
  return el;
}
