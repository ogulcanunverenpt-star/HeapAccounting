import { createRoom } from '../../client/matrix.js';
import { setState } from '../../store/state.js';
import { toastError, toastSuccess } from '../../utils/toast.js';

let overlay = null;
let selectedParentSpaceId = null;

export function openCreateRoom({ parentSpaceId = null } = {}) {
  selectedParentSpaceId = parentSpaceId;
  if (!overlay) buildModal();
  resetForm();
  overlay.classList.add('open');
}

function closeModal() {
  overlay?.classList.remove('open');
}

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title"><i class="fa-solid fa-bullhorn text-warning me-2"></i>Yeni Oda / Kanal Oluştur</div>
      <div class="modal-sub">Katılımcıların mesajlaşabileceği bir oda veya kanal başlatın.</div>

      <div class="form-field">
        <label class="form-label">Oda / Kanal Adı</label>
        <input class="form-input" id="cr-name" placeholder="örn: genel-sohbet" />
      </div>

      <div class="form-field">
        <label class="form-label">Oda Konusu <span style="color:var(--text-dim);font-weight:400">(isteğe bağlı)</span></label>
        <input class="form-input" id="cr-topic" placeholder="Bu oda ne hakkında?" />
      </div>

      <div class="form-field">
        <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="checkbox" id="cr-e2ee" checked style="accent-color:var(--yellow);width:16px;height:16px" />
          Uçtan Uca Şifreleme (E2EE) Etkinleştir
        </label>
        <p style="font-size:12px;color:var(--text-dim);margin-top:4px;line-height:1.4;">
          Etkinleştirildiğinde oda mesajları Megolm ile şifrelenir. İşaretsiz seçilirse her cihazda anında çözülen düz metin sohbet başlatılır.
        </p>
      </div>

      <div class="form-field">
        <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="checkbox" id="cr-private" style="accent-color:var(--yellow);width:16px;height:16px" />
          Özel Oda (Sadece Davetliler)
        </label>
      </div>

      <div class="form-error" id="cr-error" style="margin-bottom:8px">
        <span>⚠</span><span id="cr-error-text"></span>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="cr-cancel">İptal</button>
        <button class="btn-primary" id="cr-submit" style="width:auto;padding:9px 20px">
          Oda Oluştur
        </button>
      </div>
    </div>
  `;

  overlay.querySelector('#cr-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.querySelector('#cr-submit').addEventListener('click', async () => {
    const name = overlay.querySelector('#cr-name').value.trim();
    const topic = overlay.querySelector('#cr-topic').value.trim();
    const isPriv = overlay.querySelector('#cr-private').checked;
    const isE2EE = overlay.querySelector('#cr-e2ee').checked;
    const errorEl = overlay.querySelector('#cr-error');
    const errorTx = overlay.querySelector('#cr-error-text');
    const btn = overlay.querySelector('#cr-submit');

    if (!name) {
      errorTx.textContent = 'Lütfen bir oda adı girin.';
      errorEl.classList.add('visible');
      return;
    }

    errorEl.classList.remove('visible');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Oluşturuluyor…';

    const result = await createRoom(name, isPriv, topic, selectedParentSpaceId, isE2EE);

    if (result.ok) {
      toastSuccess(`#${name} odası oluşturuldu!`);
      setState({ activeRoomId: result.roomId });
      closeModal();
    } else {
      errorTx.textContent = result.error;
      errorEl.classList.add('visible');
    }

    btn.disabled = false;
    btn.textContent = 'Oda Oluştur';
  });

  document.body.appendChild(overlay);
}

function resetForm() {
  if (!overlay) return;
  overlay.querySelector('#cr-name').value = '';
  overlay.querySelector('#cr-topic').value = '';
  overlay.querySelector('#cr-e2ee').checked = true;
  overlay.querySelector('#cr-private').checked = false;
  overlay.querySelector('#cr-error')?.classList.remove('visible');
}
