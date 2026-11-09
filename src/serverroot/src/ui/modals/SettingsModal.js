import { getState, setState, getInitials, getUserColor } from '../../store/state.js';
import { switchAccount, removeAccount, loginWithPassword, updateMyProfile, restoreKeyBackup } from '../../client/matrix.js';
import { toastSuccess, toastError } from '../../utils/toast.js';
import { showConfirmModal } from './ConfirmModal.js';
import { generateTotpSecret, verifyTotpCode } from '../../utils/totp.js';
import { getLang, setLang } from '../../utils/i18n.js';
import { hydrateMediaIn } from '../media.js';

let overlay = null;
let activeSection = 'accounts';

export function openSettings(section = 'accounts') {
  activeSection = section;
  if (!overlay) buildModal();
  renderContent();
  overlay.classList.add('open');
}

function closeModal() { overlay?.classList.remove('open'); }

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:500px; max-width:calc(100vw - 28px); max-height:80vh; display:flex; flex-direction:column; padding:24px; border-radius:20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-shrink:0;">
        <div class="modal-title" style="margin-bottom:0; font-family:'Syne',sans-serif; font-size:19px;">
          <i class="fa-solid fa-gear text-warning me-2"></i>Ayarlar
        </div>
        <button class="btn-secondary" id="settings-close" style="padding:6px 12px; border-radius:8px;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Sağa Kayan Segment Tablar -->
      <div class="settings-tabs-horizontal" id="settings-nav"></div>

      <div id="settings-content" style="flex:1; overflow-y:auto; min-height:0; padding-right:2px;"></div>
    </div>
  `;

  overlay.querySelector('#settings-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

const SECTIONS = [
  { id: 'accounts', icon: '<i class="fa-solid fa-user me-1"></i>', label: 'Hesaplar' },
  { id: 'appearance', icon: '<i class="fa-solid fa-palette me-1"></i>', label: 'Görünüm' },
  { id: 'notifications', icon: '<i class="fa-solid fa-bell me-1"></i>', label: 'Bildirimler' },
  { id: 'privacy', icon: '<i class="fa-solid fa-shield-halved me-1"></i>', label: 'Gizlilik' },
];

function renderContent() {
  const nav = overlay.querySelector('#settings-nav');
  const content = overlay.querySelector('#settings-content');

  nav.innerHTML = '';
  SECTIONS.forEach(s => {
    const item = document.createElement('button');
    item.className = `settings-tab-pill${s.id === activeSection ? ' active' : ''}`;
    item.innerHTML = `<span>${s.icon}</span><span>${s.label}</span>`;
    item.addEventListener('click', () => { activeSection = s.id; renderContent(); });
    nav.appendChild(item);
  });

  content.innerHTML = '';
  if (activeSection === 'accounts') renderAccounts(content);
  if (activeSection === 'appearance') renderAppearance(content);
  if (activeSection === 'notifications') renderNotifications(content);
  if (activeSection === 'privacy') renderPrivacy(content);
}

function renderAccounts(container) {
  const state = getState();
  container.innerHTML = `<div style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:12px">Profilim</div>`;

  const active = state.accounts[state.activeAccountIndex] ?? null;
  if (active) {
    const profileBlock = document.createElement('div');
    profileBlock.className = 'account-item';
    profileBlock.style.marginBottom = '14px';

    const currentName = active.displayName ?? active.userId.split(':')[0].slice(1);
    const activeAvatar = active.avatarUrl ?? null;
    const activeAvatarHtml = activeAvatar
      ? `<div class="account-avatar"><img data-media-src="${escAttr(activeAvatar)}" data-media-w="40" data-media-h="40" alt=""/></div>`
      : `<div class="account-avatar initial-gold" style="background:var(--yellow); color:#081018; font-weight:800">${getInitials(currentName)}</div>`;

    profileBlock.innerHTML = `
      ${activeAvatarHtml}
      <div class="account-info">
        <div class="account-name" style="font-weight:700; color:#ffffff;">${esc(currentName)}</div>
        <div class="account-hs">${esc(active.userId)}</div>
      </div>
    `;
    container.appendChild(profileBlock);

    const profileEdit = document.createElement('div');
    profileEdit.innerHTML = `
      <div class="form-field">
        <label class="form-label">Görünen Ad</label>
        <input class="form-input" id="profile-name" value="${escAttr(currentName)}" />
      </div>
      <div class="form-field" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <label class="form-label" style="margin:0">Profil Fotoğrafı</label>
        <button class="btn-secondary" id="profile-avatar-btn" style="padding:6px 12px">Resim Seç…</button>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:-8px;margin-bottom:12px" id="profile-avatar-file">Yeni resim seçilmedi</div>
      <button class="btn-primary" id="profile-save-btn" style="margin-bottom:18px">Profili Kaydet</button>
      <input type="file" id="profile-avatar-input" accept="image/*" style="display:none"/>
    `;
    container.appendChild(profileEdit);

    let pickedAvatarFile = null;
    const avatarInput = profileEdit.querySelector('#profile-avatar-input');
    const avatarFileLabel = profileEdit.querySelector('#profile-avatar-file');
    profileEdit.querySelector('#profile-avatar-btn').addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', () => {
      pickedAvatarFile = avatarInput.files?.[0] ?? null;
      avatarFileLabel.textContent = pickedAvatarFile ? `Seçildi: ${pickedAvatarFile.name}` : 'Yeni resim seçilmedi';
    });

    profileEdit.querySelector('#profile-save-btn').addEventListener('click', async () => {
      const displayName = profileEdit.querySelector('#profile-name').value.trim();
      const btn = profileEdit.querySelector('#profile-save-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Kaydediliyor…';
      try {
        await updateMyProfile({ displayName, avatarFile: pickedAvatarFile });
        toastSuccess('Profil güncellendi!');
        renderContent();
      } catch (err) {
        toastError(err.message ?? 'Profil güncellenemedi');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Profili Kaydet';
      }
    });
  }

  const sectionLabel = document.createElement('div');
  sectionLabel.style.cssText = 'font-size:14px;font-weight:700;color:#ffffff;margin:12px 0 10px';
  sectionLabel.textContent = 'Bağlı Hesaplar';
  container.appendChild(sectionLabel);

  state.accounts.forEach((account, i) => {
    const isActive = i === state.activeAccountIndex;
    const name = account.displayName ?? account.userId.split(':')[0].slice(1);
    const hs = account.baseUrl.replace('https://', '').replace('http://', '');
    const item = document.createElement('div');
    item.className = `account-item${isActive ? ' active' : ''}`;

    const avatarUrl = account.avatarUrl ?? null;
    const avatarHtml = avatarUrl
      ? `<div class="account-avatar"><img data-media-src="${escAttr(avatarUrl)}" data-media-w="40" data-media-h="40" alt=""/></div>`
      : `<div class="account-avatar initial-gold" style="background:var(--yellow); color:#081018">${getInitials(name)}</div>`;

    item.innerHTML = `
      ${avatarHtml}
      <div class="account-info">
        <div class="account-name">${esc(name)}${isActive ? ' <span style="color:var(--yellow);font-size:11px;font-weight:700">● aktif</span>' : ''}</div>
        <div class="account-hs">${esc(hs)}</div>
      </div>
      <button class="account-remove" data-i="${i}" title="Hesabı kaldır"><i class="fa-solid fa-trash-can"></i></button>
    `;

    if (!isActive) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', e => {
        if (e.target.closest('.account-remove')) return;
        switchAccount(i);
        renderContent();
        toastSuccess(`${name} hesabına geçildi`);
      });
    }

    item.querySelector('.account-remove').addEventListener('click', e => {
      e.stopPropagation();
      showConfirmModal({
        title: 'Hesabı Kaldır',
        message: `${name} hesabını kaldırmak istediğinize emin misiniz? Oturum kapatılacaktır.`,
        confirmText: 'Hesabı Kaldır',
        danger: true,
        onConfirm: async () => {
          await removeAccount(account.userId);
          renderContent();
          toastSuccess(`${name} hesabı kaldırıldı`);
        }
      });
    });

    container.appendChild(item);
  });

  const addSection = document.createElement('div');
  addSection.innerHTML = `
    <div style="font-size:14px;font-weight:700;color:#ffffff;margin:20px 0 10px">Yeni Hesap Ekle</div>
    <div class="form-field">
      <label class="form-label">Homeserver</label>
      <input class="form-input" id="add-hs" placeholder="matrix.org" value="matrix.org" />
    </div>
    <div class="form-field">
      <label class="form-label">Kullanıcı Adı</label>
      <input class="form-input" id="add-user" placeholder="@kullanici:matrix.org" />
    </div>
    <div class="form-field">
      <label class="form-label">Şifre</label>
      <input class="form-input" type="password" id="add-pass" placeholder="••••••••" />
    </div>
    <div class="form-error" id="add-error"><span>⚠</span><span id="add-error-text"></span></div>
    <button class="btn-primary" id="add-account-btn" style="margin-top:8px">
      Hesap Ekle
    </button>
  `;
  container.appendChild(addSection);

  addSection.querySelector('#add-account-btn').addEventListener('click', async () => {
    const hs = addSection.querySelector('#add-hs').value.trim();
    const user = addSection.querySelector('#add-user').value.trim();
    const pass = addSection.querySelector('#add-pass').value;
    const errEl = addSection.querySelector('#add-error');
    const errTx = addSection.querySelector('#add-error-text');
    const btn = addSection.querySelector('#add-account-btn');

    if (!hs || !user || !pass) { errTx.textContent = 'Lütfen tüm alanları doldurun.'; errEl.classList.add('visible'); return; }
    errEl.classList.remove('visible');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Giriş yapılıyor…';

    const result = await loginWithPassword(hs, user, pass);
    if (result.ok) {
      toastSuccess('Yeni hesap eklendi!');
      addSection.querySelector('#add-hs').value = 'matrix.org';
      addSection.querySelector('#add-user').value = '';
      addSection.querySelector('#add-pass').value = '';
      renderContent();
    } else {
      errTx.textContent = result.error;
      errEl.classList.add('visible');
    }
    btn.disabled = false;
    btn.textContent = 'Hesap Ekle';
  });

  hydrateMediaIn(container);
}

function renderAppearance(container) {
  const root = document.documentElement;
  const isCompact = root.classList.contains('compact');
  const currentLang = getLang();

  container.innerHTML = `
    <div style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:14px">Görünüm ve Dil / Appearance</div>

    <div class="settings-row">
      <div><div class="settings-row-label">Uygulama Dili / Language</div><div class="settings-row-sub">Arayüz dil seçeneği</div></div>
      <div style="display:flex; gap:6px;">
        <button class="btn-secondary" id="lang-tr-btn" style="padding:6px 12px; font-size:12px; background:${currentLang === 'tr' ? 'var(--yellow)' : 'var(--bg3)'}; color:${currentLang === 'tr' ? '#081018' : 'var(--text-muted)'}; font-weight:700;">Türkçe 🇹🇷</button>
        <button class="btn-secondary" id="lang-en-btn" style="padding:6px 12px; font-size:12px; background:${currentLang === 'en' ? 'var(--yellow)' : 'var(--bg3)'}; color:${currentLang === 'en' ? '#081018' : 'var(--text-muted)'}; font-weight:700;">English 🇬🇧</button>
      </div>
    </div>

    <div class="settings-row">
      <div><div class="settings-row-label">Sıkışık Mod (Compact)</div><div class="settings-row-sub">Mesajlar arasındaki mesafeyi daraltın</div></div>
      <div class="toggle${isCompact ? ' on' : ''}" id="toggle-compact"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Varsayılan Tema</div><div class="settings-row-sub">Fenerbahçe / Sarı Lacivert Gece Teması (Aktif)</div></div>
    </div>
  `;

  container.querySelector('#lang-tr-btn').addEventListener('click', () => setLang('tr'));
  container.querySelector('#lang-en-btn').addEventListener('click', () => setLang('en'));

  const compactToggle = container.querySelector('#toggle-compact');
  compactToggle.addEventListener('click', () => {
    compactToggle.classList.toggle('on');
    document.documentElement.classList.toggle('compact', compactToggle.classList.contains('on'));
    try { localStorage.setItem('trinity_compact', compactToggle.classList.contains('on') ? '1' : '0'); } catch { }
  });
}

function renderNotifications(container) {
  const notifOn = localStorage.getItem('trinity_notif_desktop') === '1';
  const mentionOnly = localStorage.getItem('trinity_notif_mention_only') !== '0';
  const soundOn = localStorage.getItem('trinity_notif_sound') === '1';

  container.innerHTML = `
    <div style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:14px">Bildirimler</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Sistem Bildirimleri</div><div class="settings-row-sub">Yeni mesajlarda cihaz bildirimi gönder</div></div>
      <div class="toggle${notifOn ? ' on' : ''}" id="toggle-notif"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Sadece @bahsetmelerde uyar</div></div>
      <div class="toggle${mentionOnly ? ' on' : ''}" id="toggle-mention"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Sesli Bildirim (2-Tone Chime)</div></div>
      <div class="toggle${soundOn ? ' on' : ''}" id="toggle-sound"></div>
    </div>
  `;

  container.querySelector('#toggle-notif').addEventListener('click', async function () {
    this.classList.toggle('on');
    if (this.classList.contains('on')) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { this.classList.remove('on'); toastError('Bildirim izni reddedildi.'); return; }
    }
    try { localStorage.setItem('trinity_notif_desktop', this.classList.contains('on') ? '1' : '0'); } catch { }
  });

  container.querySelector('#toggle-mention').addEventListener('click', function () {
    this.classList.toggle('on');
    try { localStorage.setItem('trinity_notif_mention_only', this.classList.contains('on') ? '1' : '0'); } catch { }
  });

  container.querySelector('#toggle-sound').addEventListener('click', function () {
    this.classList.toggle('on');
    try { localStorage.setItem('trinity_notif_sound', this.classList.contains('on') ? '1' : '0'); } catch { }
  });
}

function renderPrivacy(container) {
  const state = getState();
  const currentUserId = state.accounts[state.activeAccountIndex]?.userId || 'user';
  const existing2faSecret = localStorage.getItem(`cundai_2fa_${currentUserId}`);
  const is2faActive = !!existing2faSecret;

  let tempSecret = generateTotpSecret();

  container.innerHTML = `
    <div style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:14px">Gizlilik ve Güvenlik</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Okundu Bilgisi</div><div class="settings-row-sub">Mesajları okuduğunuzu diğerlerine gösterin</div></div>
      <div class="toggle on"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Yazıyor Bilgisi</div><div class="settings-row-sub">Yazarken diğer kullanıcılara gösterin</div></div>
      <div class="toggle on"></div>
    </div>

    <!-- 2FA / TOTP Authenticator Section -->
    <div style="margin-top:20px; padding:16px; background:var(--bg3); border-radius:14px; border:1px solid var(--border-hi);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <div style="font-size:14px; font-weight:700; color:var(--yellow);">
          <i class="fa-solid fa-shield-halved me-2"></i>Tarayıcıdaki yerel TOTP kontrolü
        </div>
        <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${is2faActive ? 'var(--green)' : 'var(--bg4)'}; color:${is2faActive ? '#081018' : 'var(--text-dim)'}">
          ${is2faActive ? 'AKTİF' : 'PASİF'}
        </span>
      </div>

      ${is2faActive ? `
        <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">
          Bu kontrol yalnızca bu tarayıcıda uygulanır ve Matrix hesabınız için sunucu taraflı 2FA sağlamaz.
        </div>
        <button class="btn-secondary" id="btn-disable-2fa" style="width:100%; color:var(--red); border-color:rgba(239,68,68,0.4);">
          Yerel Kontrolü Devre Dışı Bırak
        </button>
      ` : `
        <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">
          Gizli anahtarı doğrulayıcı uygulamanıza elle ekleyin. Bu kontrol yalnızca bu tarayıcıdadır; Matrix sunucusunda 2FA etkinleştirmez.
        </div>

        <div style="display:flex; flex-direction:column; align-items:center; background:var(--bg2); padding:12px; border-radius:10px; margin-bottom:12px; border:1px solid var(--border);">
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:2px;">Gizli Anahtar (Secret Key):</div>
          <div style="font-family:monospace; font-size:14px; font-weight:700; color:var(--yellow); letter-spacing:1px; user-select:all;">${tempSecret}</div>
        </div>

        <div class="form-field" style="margin-bottom:10px;">
          <label class="form-label">Authenticator 6 Hanesini Girin</label>
          <input class="form-input" id="totp-code-input" placeholder="000000" maxlength="6" style="text-align:center; font-size:18px; letter-spacing:4px; font-weight:700;" />
        </div>

        <button class="btn-primary" id="btn-enable-2fa" style="width:100%; font-size:13px; padding:10px 14px;">
          Yerel Kontrolü Etkinleştir
        </button>
      `}
    </div>

    <!-- Element-Style Key Backup Recovery Section -->
    <div style="margin-top:20px; padding:14px; background:var(--bg3); border-radius:12px; border:1px solid var(--border-hi);">
      <div style="font-size:14px; font-weight:700; color:var(--yellow); margin-bottom:4px;">
        <i class="fa-solid fa-key me-2"></i>Matrix Şifreleme Anahtar Yedeği
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">
        Bu cihazda kayıtlı yedek anahtarını kullanın veya eski tip yedek parolasını girin. Modern Matrix kurtarma anahtarını yapılandırmak için Element gibi bir istemci kullanın.
      </div>
      <div class="form-field" style="margin-bottom:10px;">
        <input class="form-input" id="key-backup-input" placeholder="Eski tip yedek parolası (isteğe bağlı)" type="password" />
      </div>
      <button class="btn-primary" id="btn-restore-key-backup" style="width:100%; font-size:13px; padding:8px 14px;">
        Yedek Anahtarları İçe Aktar
      </button>
    </div>

    <div style="margin-top:24px">
      <button class="btn-secondary" style="color:var(--red);border-color:rgba(239,68,68,0.4)"
        onclick="import('/src/client/matrix.js').then(m=>m.logout())">
        <i class="fa-solid fa-right-from-bracket me-2"></i>Tüm Hesaplardan Çıkış Yap
      </button>
    </div>
  `;

  container.querySelectorAll('.toggle').forEach(t => t.addEventListener('click', () => t.classList.toggle('on')));

  // 2FA Enable Handler
  container.querySelector('#btn-enable-2fa')?.addEventListener('click', async () => {
    const code = container.querySelector('#totp-code-input').value.trim();
    if (code.length !== 6) {
      toastError('Lütfen 6 haneli doğrulama kodunu girin.');
      return;
    }
    const isValid = await verifyTotpCode(tempSecret, code);
    if (isValid) {
      localStorage.setItem(`cundai_2fa_${currentUserId}`, tempSecret);
      toastSuccess('Yerel doğrulama kontrolü etkinleştirildi.');
      renderContent();
    } else {
      toastError('Geçersiz doğrulama kodu. Lütfen saatinizi kontrol edin.');
    }
  });

  // 2FA Disable Handler
  container.querySelector('#btn-disable-2fa')?.addEventListener('click', () => {
    localStorage.removeItem(`cundai_2fa_${currentUserId}`);
    toastSuccess('Yerel doğrulama kontrolü devre dışı bırakıldı.');
    renderContent();
  });

  container.querySelector('#btn-restore-key-backup')?.addEventListener('click', async () => {
    const input = container.querySelector('#key-backup-input').value.trim();
    const btn = container.querySelector('#btn-restore-key-backup');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Anahtarlar Çözülüyor…';
    try {
      const result = await restoreKeyBackup(input || undefined);
      toastSuccess(`${result.imported}/${result.total} anahtar içe aktarıldı.`);
    } catch (err) {
      toastError(err.message || 'Anahtar yedeği yüklenemedi.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Yedek Anahtarları İçe Aktar';
    }
  });
}

function esc(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
