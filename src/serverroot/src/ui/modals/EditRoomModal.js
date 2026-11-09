import { getRoomById, updateRoomProfile } from '../../client/matrix.js';
import { toastSuccess, toastError } from '../../utils/toast.js';

let overlay = null;
let currentRoomId = null;

export function openEditRoomModal(roomId) {
  currentRoomId = roomId;
  if (!overlay) buildModal();
  populateForm();
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
      <div class="modal-title"><i class="fa-solid fa-pen text-warning me-2"></i>Oda Profilini Düzenle</div>
      <div class="modal-sub">Oda adını ve konusunu güncelleyin.</div>

      <div class="form-field">
        <label class="form-label">Oda Adı</label>
        <input class="form-input" id="ed-name-input" placeholder="Oda adı girin" />
      </div>

      <div class="form-field">
        <label class="form-label">Oda Konusu / Açıklaması</label>
        <input class="form-input" id="ed-topic-input" placeholder="Oda hakkında bilgi..." />
      </div>

      <div class="form-error" id="ed-error" style="margin-bottom:8px">
        <span>⚠</span><span id="ed-error-text"></span>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="ed-cancel">İptal</button>
        <button class="btn-primary" id="ed-submit" style="width:auto;padding:9px 20px">
          Kaydet
        </button>
      </div>
    </div>
  `;

  overlay.querySelector('#ed-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.querySelector('#ed-submit').addEventListener('click', async () => {
    const name = overlay.querySelector('#ed-name-input').value.trim();
    const topic = overlay.querySelector('#ed-topic-input').value.trim();
    const errorEl = overlay.querySelector('#ed-error');
    const errorTx = overlay.querySelector('#ed-error-text');
    const btn = overlay.querySelector('#ed-submit');

    if (!name) {
      errorTx.textContent = 'Lütfen oda adını boş bırakmayın.';
      errorEl.classList.add('visible');
      return;
    }

    errorEl.classList.remove('visible');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Kaydediliyor…';

    try {
      await updateRoomProfile(currentRoomId, { name, topic });
      toastSuccess('Oda profili güncellendi!');
      closeModal();
    } catch (err) {
      errorTx.textContent = err.message || 'Güncelleme başarısız.';
      errorEl.classList.add('visible');
    }

    btn.disabled = false;
    btn.textContent = 'Kaydet';
  });

  document.body.appendChild(overlay);
}

function populateForm() {
  if (!overlay || !currentRoomId) return;
  const room = getRoomById(currentRoomId);
  if (!room) return;

  const currentName = room.name || '';
  const currentTopic = room.currentState?.getStateEvents('m.room.topic', '')?.getContent()?.topic || '';

  overlay.querySelector('#ed-name-input').value = currentName;
  overlay.querySelector('#ed-topic-input').value = currentTopic;
  overlay.querySelector('#ed-error')?.classList.remove('visible');
}
