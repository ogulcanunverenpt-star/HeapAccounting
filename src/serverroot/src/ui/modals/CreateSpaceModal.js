import { createSpace } from '../../client/matrix.js';
import { setState } from '../../store/state.js';
import { toastSuccess, toastError } from '../../utils/toast.js';

let overlay = null;

export function openCreateSpaceModal() {
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
      <div class="modal-title"><i class="fa-solid fa-cubes text-warning me-2"></i>Yeni Alan (Space) Oluştur</div>
      <div class="modal-sub">Alanlar, odaları ve kanalları bir arada toplamanızı sağlar.</div>

      <div class="form-field">
        <label class="form-label">Alan Adı</label>
        <input class="form-input" id="cs-name" placeholder="örn: Yazılım Ekibi" />
      </div>

      <div class="form-field">
        <label class="form-label">Açıklama / Konu <span style="color:var(--text-dim);font-weight:400">(isteğe bağlı)</span></label>
        <input class="form-input" id="cs-topic" placeholder="Alan hakkında kısa bilgi..." />
      </div>

      <div class="form-field">
        <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="checkbox" id="cs-private" checked style="accent-color:var(--yellow);width:16px;height:16px" />
          Özel Alan (Sadece Davetliler)
        </label>
      </div>

      <div class="form-error" id="cs-error" style="margin-bottom:8px">
        <span>⚠</span><span id="cs-error-text"></span>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="cs-cancel">İptal</button>
        <button class="btn-primary" id="cs-submit" style="width:auto;padding:9px 20px">
          Alan Oluştur
        </button>
      </div>
    </div>
  `;

  overlay.querySelector('#cs-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.querySelector('#cs-submit').addEventListener('click', async () => {
    const name = overlay.querySelector('#cs-name').value.trim();
    const topic = overlay.querySelector('#cs-topic').value.trim();
    const isPriv = overlay.querySelector('#cs-private').checked;
    const errorEl = overlay.querySelector('#cs-error');
    const errorTx = overlay.querySelector('#cs-error-text');
    const btn = overlay.querySelector('#cs-submit');

    if (!name) {
      errorTx.textContent = 'Lütfen alan adını girin.';
      errorEl.classList.add('visible');
      return;
    }

    errorEl.classList.remove('visible');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Oluşturuluyor…';

    const result = await createSpace(name, isPriv, topic);

    if (result.ok) {
      toastSuccess(`${name} alanı oluşturuldu!`);
      setState({ activeSpaceId: result.roomId });
      closeModal();
    } else {
      errorTx.textContent = result.error || 'Alan oluşturulamadı.';
      errorEl.classList.add('visible');
    }

    btn.disabled = false;
    btn.textContent = 'Alan Oluştur';
  });

  document.body.appendChild(overlay);
}

function resetForm() {
  if (!overlay) return;
  overlay.querySelector('#cs-name').value = '';
  overlay.querySelector('#cs-topic').value = '';
  overlay.querySelector('#cs-private').checked = true;
  overlay.querySelector('#cs-error')?.classList.remove('visible');
}
