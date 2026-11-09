let overlay = null;

export function showConfirmModal({ title = 'Emin misiniz?', message = 'Bu işlemi onaylıyor musunuz?', confirmText = 'Onayla', cancelText = 'İptal', danger = false, onConfirm }) {
  if (!overlay) buildModal();

  overlay.querySelector('#confirm-title').textContent = title;
  overlay.querySelector('#confirm-msg').textContent = message;

  const confirmBtn = overlay.querySelector('#confirm-ok');
  confirmBtn.textContent = confirmText;
  if (danger) {
    confirmBtn.className = 'btn-primary';
    confirmBtn.style.background = 'var(--red)';
    confirmBtn.style.color = '#ffffff';
  } else {
    confirmBtn.className = 'btn-primary';
    confirmBtn.style.background = 'var(--yellow)';
    confirmBtn.style.color = '#081018';
  }

  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener('click', () => {
    closeConfirmModal();
    if (onConfirm) onConfirm();
  });

  overlay.classList.add('open');
}

export function closeConfirmModal() {
  overlay?.classList.remove('open');
}

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '950';

  overlay.innerHTML = `
    <div class="modal" style="width:420px; max-width:calc(100vw - 28px); border-radius:20px; padding:24px;">
      <div class="modal-title" id="confirm-title" style="font-size:18px; font-weight:800; color:#ffffff; margin-bottom:6px;">Emin misiniz?</div>
      <div class="modal-sub" id="confirm-msg" style="font-size:13.5px; color:var(--text-muted); margin-bottom:20px; line-height:1.5;">Bu işlemi yapmak istediğinize emin misiniz?</div>

      <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn-secondary" id="confirm-cancel" style="padding:8px 16px;">İptal</button>
        <button class="btn-primary" id="confirm-ok" style="width:auto; padding:8px 20px;">Onayla</button>
      </div>
    </div>
  `;

  overlay.querySelector('#confirm-cancel').addEventListener('click', closeConfirmModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeConfirmModal(); });

  document.body.appendChild(overlay);
}
