import { getState, setState, on } from '../../store/state.js';
import { createCompanyRoom, listCompanyRooms } from '../../client/companyRooms.js';
import { addMinorUnits } from '../../wasm/bridge.js';
import { inspectRecoveryReadiness } from '../../client/keyBackup.js';
import { getLang } from '../../utils/i18n.js';

const translations = {
  tr: {
    title: 'Şirket odaları',
    intro: 'Şirket başına davetle erişilen şifreli oda oluşturun. Bu aşamada muhasebe kaydı henüz yoktur.',
    notice: 'Oda adı, üyeler ve diğer Matrix meta verileri şifrelenmez. Anahtar yedekleme ve cihaz doğrulamasını yapılandırın. Bu prototipe gerçek finansal veri girmeyin.',
    create: 'Şirket odası oluştur',
    creating: 'Oluşturuluyor…',
    created: 'Oda oluşturuldu. Güvenlik durumunun doğrulanması için Matrix eşitlemesi bekleniyor.',
    rooms: 'Şirket odalarınız',
    empty: 'Henüz eşitlenmiş bir şirket odası yok.',
    ready: 'Oda ayarları doğrulandı',
    open: 'Sohbeti aç',
    failed: 'Oda oluşturulamadı',
    'not-connected': 'Aktif Matrix bağlantısı bulunamadı.',
    'not-joined': 'Bu odaya katılmadınız.',
    'crypto-unavailable': 'Şifreleme hazır değil. Güvenli bağlantıyı ve Matrix şifreleme kurulumunu kontrol edin.',
    'sync-unavailable': 'Matrix eşitlemesi hazır değil. Bağlantıyı kontrol edip tekrar deneyin.',
    'encryption-unavailable': 'Odanın şifrelemesi doğrulanamadı.',
    'privacy-changed': 'Odanın erişim veya geçmiş ayarları değişmiş. Güvenli kullanım durduruldu.',
    'not-company-room': 'Şirket odası doğrulanamadı.',
    'room-id-missing': 'Sunucu oda kimliği döndürmedi.',
    demoTitle: 'C / WebAssembly örneği',
    demoDesc: 'Tarayıcıdaki C fonksiyonu örnek sayıları toplar; kayıt oluşturmaz.',
    demoButton: 'C fonksiyonunu çalıştır',
    demoError: 'WebAssembly örneği çalıştırılamadı.',
    checkRecovery: 'Anahtar ve cihaz durumunu kontrol et',
    recoveryHint: 'Bu kontroller gerçek kurtarma veya mevzuata uygunluk garantisi değildir.',
    recoveryFailed: 'Anahtar durumu kontrol edilemedi.',
    deviceVerified: 'Cihaz doğrulaması',
    crossSigning: 'Çapraz imzalama',
    secretStorage: 'Gizli anahtar deposu',
    backupActive: 'Aktif anahtar yedeği',
    backupKeyAvailable: 'Yedek çözme anahtarı',
    backupTrusted: 'Güvenilir ve eşleşen yedek',
    checkYes: 'Hazır',
    checkNo: 'Hazır değil',
    close: 'Kapat',
  },
  en: {
    title: 'Company rooms',
    intro: 'Create an encrypted, invite-only room per company. Accounting records are not yet available.',
    notice: 'Room names, membership and other Matrix metadata are not encrypted. Configure key backup and verify devices. Do not enter real financial data in this prototype.',
    create: 'Create company room',
    creating: 'Creating…',
    created: 'Room created. Waiting for Matrix sync before its security settings can be verified.',
    rooms: 'Your company rooms',
    empty: 'No company rooms have synced yet.',
    ready: 'Room settings verified',
    open: 'Open chat',
    failed: 'Could not create the room',
    'not-connected': 'There is no active Matrix connection.',
    'not-joined': 'You have not joined this room.',
    'crypto-unavailable': 'Encryption is not ready. Check the secure connection and Matrix encryption setup.',
    'sync-unavailable': 'Matrix sync is not ready. Check your connection and try again.',
    'encryption-unavailable': 'Room encryption could not be verified.',
    'privacy-changed': 'Room access or history settings have changed. Safe use has been stopped.',
    'not-company-room': 'The company room could not be verified.',
    'room-id-missing': 'The server did not return a room ID.',
    demoTitle: 'C / WebAssembly example',
    demoDesc: 'The C function adds sample numbers in your browser; no record is created.',
    demoButton: 'Run C function',
    demoError: 'Could not run the WebAssembly example.',
    checkRecovery: 'Check key and device status',
    recoveryHint: 'These checks do not guarantee recovery or regulatory compliance.',
    recoveryFailed: 'Could not check key status.',
    deviceVerified: 'Device verification',
    crossSigning: 'Cross-signing',
    secretStorage: 'Secret storage',
    backupActive: 'Active key backup',
    backupKeyAvailable: 'Backup decryption key',
    backupTrusted: 'Trusted, matching backup',
    checkYes: 'Ready',
    checkNo: 'Not ready',
    close: 'Close',
  },
};

let closeCurrent;

export function openCompanyWorkspace() {
  if (closeCurrent) return;
  const text = translations[getLang() === 'en' ? 'en' : 'tr'];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open company-workspace-overlay';
  overlay.innerHTML = `
    <div class="modal company-workspace" role="dialog" aria-modal="true" aria-labelledby="company-workspace-title">
      <h2 class="modal-title" id="company-workspace-title">${text.title}</h2>
      <p class="modal-sub">${text.intro}</p>
      <p class="company-workspace-notice">${text.notice}</p>
      <button type="button" class="btn-secondary company-check-recovery">${text.checkRecovery}</button>
      <p class="company-recovery-hint">${text.recoveryHint}</p>
      <ul class="company-recovery-result" aria-live="polite"></ul>
      <button type="button" class="btn-primary company-create">${text.create}</button>
      <p class="company-create-result" role="status" aria-live="polite"></p>
      <h3>${text.rooms}</h3>
      <div class="company-room-list"></div>
      <div class="company-demo">
        <h3>${text.demoTitle}</h3>
        <p>${text.demoDesc}</p>
        <button type="button" class="btn-secondary company-demo-button">${text.demoButton}</button>
        <output class="company-demo-result" aria-live="polite"></output>
      </div>
      <div class="modal-actions"><button type="button" class="btn-secondary company-close">${text.close}</button></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const list = overlay.querySelector('.company-room-list');
  const result = overlay.querySelector('.company-create-result');
  const create = overlay.querySelector('.company-create');
  const closeButton = overlay.querySelector('.company-close');
  const previousFocus = document.activeElement;

  function refresh() {
    const rooms = listCompanyRooms(getState().client);
    list.replaceChildren();
    if (!rooms.length) {
      const empty = document.createElement('p');
      empty.textContent = text.empty;
      list.appendChild(empty);
      return;
    }
    rooms.forEach(room => {
      const row = document.createElement('div');
      row.className = 'company-room-row';
      const details = document.createElement('div');
      const id = document.createElement('strong');
      id.textContent = room.roomId;
      const status = document.createElement('p');
      status.textContent = text[room.status] || text['not-company-room'];
      details.append(id, status);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn-secondary';
      open.textContent = text.open;
      open.disabled = room.status !== 'ready';
      open.addEventListener('click', () => {
        const current = listCompanyRooms(getState().client).find(item => item.roomId === room.roomId);
        if (current?.status !== 'ready') {
          refresh();
          return;
        }
        setState({ activeSpaceId: null, activeRoomId: room.roomId });
        close();
      });
      row.append(details, open);
      list.appendChild(row);
    });
  }

  const unsubscribe = [on('rooms-updated', refresh), on('state', refresh)];
  function close() {
    unsubscribe.forEach(unsub => unsub());
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    closeCurrent = null;
    previousFocus?.focus();
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') close();
  }
  closeCurrent = close;
  document.addEventListener('keydown', onKeyDown);
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });

  create.addEventListener('click', async () => {
    create.disabled = true;
    create.textContent = text.creating;
    result.textContent = '';
    try {
      await createCompanyRoom(getState().client);
      result.textContent = text.created;
      refresh();
    } catch (error) {
      console.error('Company room creation failed:', error);
      result.textContent = `${text.failed}: ${text[error.message] || error.message}`;
    } finally {
      create.disabled = false;
      create.textContent = text.create;
    }
  });
  overlay.querySelector('.company-demo-button').addEventListener('click', async () => {
    const output = overlay.querySelector('.company-demo-result');
    try {
      output.textContent = `120 + 30 = ${await addMinorUnits(120, 30)}`;
    } catch (error) {
      console.error('WebAssembly bridge failed:', error);
      output.textContent = text.demoError;
    }
  });
  const recoveryButton = overlay.querySelector('.company-check-recovery');
  recoveryButton.addEventListener('click', async () => {
    const output = overlay.querySelector('.company-recovery-result');
    output.replaceChildren();
    recoveryButton.disabled = true;
    try {
      const readiness = await inspectRecoveryReadiness(getState().client);
      for (const [key, ready] of Object.entries(readiness)) {
        const item = document.createElement('li');
        item.textContent = `${text[key]}: ${ready ? text.checkYes : text.checkNo}`;
        output.appendChild(item);
      }
    } catch (error) {
      console.error('Matrix recovery readiness check failed:', error);
      const item = document.createElement('li');
      item.textContent = text.recoveryFailed;
      output.appendChild(item);
    } finally {
      recoveryButton.disabled = false;
    }
  });

  refresh();
  closeButton.focus();
}
