import { inviteToRoom, getOrCreateDirectMessageRoom, searchUserDirectory } from '../../client/matrix.js';
import { setState, getInitials } from '../../store/state.js';
import { toastSuccess, toastError } from '../../utils/toast.js';

let overlay = null;
let currentRoomId = null;
let searchDebounceTimer = null;

export function openInviteModal(roomId = null) {
  currentRoomId = roomId;
  if (!overlay) buildModal();
  resetForm();
  overlay.classList.add('open');
  setTimeout(() => overlay.querySelector('#inv-user-input')?.focus(), 40);
}

function closeModal() {
  overlay?.classList.remove('open');
}

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title" id="inv-modal-title"><i class="fa-solid fa-user-plus text-warning me-2"></i>Kullanıcı Davet Et / Mesaj Başlat</div>
      <div class="modal-sub">Matrix kullanıcı rehberinde canlı arayın veya kullanıcı adını girin.</div>

      <div class="form-field">
        <label class="form-label">Matrix Kullanıcı Ara (Kullanıcı Adı veya ID)</label>
        <input class="form-input" id="inv-user-input" placeholder="örn: alice veya @alice:matrix.org" autocomplete="off" />
      </div>

      <div class="user-search-live-results" id="inv-search-results" style="max-height: 220px; overflow-y: auto; margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px;">
        <div style="font-size:12px; color:var(--text-dim); text-align:center; padding:10px 0;">Aramak için kullanıcı adı yazmaya başlayın...</div>
      </div>

      <div class="form-error" id="inv-error" style="margin-bottom:8px">
        <span>⚠</span><span id="inv-error-text"></span>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="inv-cancel">İptal</button>
        <button class="btn-primary" id="inv-submit" style="width:auto;padding:9px 20px">
          Manuel ID ile Gönder
        </button>
      </div>
    </div>
  `;

  overlay.querySelector('#inv-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  const inputEl = overlay.querySelector('#inv-user-input');
  const resultsEl = overlay.querySelector('#inv-search-results');

  // Live Search Input Listener
  inputEl.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const query = inputEl.value.trim();

    if (!query || query.length < 2) {
      resultsEl.innerHTML = `<div style="font-size:12px; color:var(--text-dim); text-align:center; padding:10px 0;">Aramak için kullanıcı adı yazmaya başlayın...</div>`;
      return;
    }

    resultsEl.innerHTML = `<div style="font-size:12px; color:var(--yellow); text-align:center; padding:10px 0;"><span class="spinner"></span> Matrix ağında aranıyor...</div>`;

    searchDebounceTimer = setTimeout(async () => {
      try {
        const users = await searchUserDirectory(query, 15);
        renderSearchResults(users, resultsEl);
      } catch (err) {
        resultsEl.innerHTML = `<div style="font-size:12px; color:var(--red); text-align:center; padding:10px 0;">Arama hatası: ${esc(err.message)}</div>`;
      }
    }, 300);
  });

  // Submit Manuel ID
  overlay.querySelector('#inv-submit').addEventListener('click', async () => {
    const userInput = inputEl.value.trim();
    if (!userInput) return;
    let fullUserId = userInput.startsWith('@') ? userInput : `@${userInput}:matrix.org`;
    handleSelectUser(fullUserId);
  });

  document.body.appendChild(overlay);
}

function renderSearchResults(users, resultsEl) {
  resultsEl.innerHTML = '';

  if (users.length === 0) {
    resultsEl.innerHTML = `<div style="font-size:12px; color:var(--text-dim); text-align:center; padding:10px 0;">Kullanıcı bulunamadı</div>`;
    return;
  }

  users.forEach(u => {
    const displayName = u.display_name || u.user_id.split(':')[0].replace('@', '');
    const initials = getInitials(displayName);

    const item = document.createElement('div');
    item.className = 'user-live-item';
    item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:var(--bg3); border-radius:10px; border:1px solid var(--border);';

    const avatarHtml = u.avatar_url
      ? `<div class="member-avatar" style="width:32px;height:32px;"><img src="${esc(u.avatar_url)}" alt=""/></div>`
      : `<div class="member-avatar initial-gold" style="width:32px;height:32px;">${initials}</div>`;

    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; overflow:hidden; margin-right:8px;">
        ${avatarHtml}
        <div style="overflow:hidden;">
          <div style="font-size:13.5px; font-weight:600; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(displayName)}</div>
          <div style="font-size:11px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(u.user_id)}</div>
        </div>
      </div>
      <button class="btn-primary btn-action-select" style="width:auto; padding:5px 12px; font-size:12px; flex-shrink:0;">
        ${currentRoomId ? 'Davet Et' : 'Sohbet Et'}
      </button>
    `;

    item.querySelector('.btn-action-select').addEventListener('click', () => {
      handleSelectUser(u.user_id);
    });

    resultsEl.appendChild(item);
  });
}

async function handleSelectUser(userId) {
  const errorEl = overlay.querySelector('#inv-error');
  const errorTx = overlay.querySelector('#inv-error-text');
  const btn = overlay.querySelector('#inv-submit');

  errorEl.classList.remove('visible');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> İşleniyor…';

  try {
    if (currentRoomId) {
      await inviteToRoom(currentRoomId, userId);
      toastSuccess(`${userId} odaya davet edildi!`);
    } else {
      const dmRoomId = await getOrCreateDirectMessageRoom(userId);
      setState({ activeRoomId: dmRoomId, sidebarFilter: 'dms' });
      toastSuccess(`${userId} ile sohbet başlatıldı!`);
    }
    closeModal();
  } catch (err) {
    errorTx.textContent = err.message || 'İşlem gerçekleştirilemedi.';
    errorEl.classList.add('visible');
  }

  btn.disabled = false;
  btn.textContent = 'Manuel ID ile Gönder';
}

function resetForm() {
  if (!overlay) return;
  overlay.querySelector('#inv-user-input').value = '';
  overlay.querySelector('#inv-error')?.classList.remove('visible');
  overlay.querySelector('#inv-search-results').innerHTML = `<div style="font-size:12px; color:var(--text-dim); text-align:center; padding:10px 0;">Aramak için kullanıcı adı yazmaya başlayın...</div>`;
  const titleEl = overlay.querySelector('#inv-modal-title');
  if (titleEl) {
    titleEl.innerHTML = currentRoomId
      ? '<i class="fa-solid fa-user-plus text-warning me-2"></i>Odaya Kullanıcı Davet Et'
      : '<i class="fa-solid fa-comments text-warning me-2"></i>Yeni Özel Sohbet Başlat';
  }
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
