let overlay = null;

export function openImageViewerModal(srcUrl, altName = 'Resim') {
  if (!overlay) buildModal();

  const imgEl = overlay.querySelector('#lightbox-img');
  const downloadBtn = overlay.querySelector('#lightbox-download');

  imgEl.src = srcUrl;
  downloadBtn.href = srcUrl;
  downloadBtn.download = altName || 'image.png';

  overlay.classList.add('open');
}

export function closeImageViewerModal() {
  overlay?.classList.remove('open');
}

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '990';
  overlay.style.background = 'rgba(5, 14, 24, 0.95)';

  overlay.innerHTML = `
    <div style="position:relative; max-width:90vw; max-height:90vh; display:flex; flex-direction:column; align-items:center;">
      <div style="position:absolute; top:-48px; right:0; display:flex; gap:12px;">
        <a id="lightbox-download" class="btn-primary" style="padding:6px 14px; font-size:13px; text-decoration:none; display:flex; align-items:center; gap:6px;" download>
          <i class="fa-solid fa-download"></i> İndir
        </a>
        <button id="lightbox-close" class="btn-secondary" style="padding:6px 12px; font-size:14px;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <img id="lightbox-img" src="" style="max-width:90vw; max-height:80vh; border-radius:12px; border:1px solid var(--border-hi); box-shadow:0 20px 60px rgba(0,0,0,0.8); object-fit:contain; -webkit-user-drag:none; user-select:none;" alt="" />
    </div>
  `;

  overlay.querySelector('#lightbox-close').addEventListener('click', closeImageViewerModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeImageViewerModal(); });

  document.body.appendChild(overlay);
}
