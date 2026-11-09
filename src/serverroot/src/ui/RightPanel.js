import { getRoomMembers, getOrCreateDirectMessageRoom, getPinnedEvents, unpinEvent, getRoomById, getMxcObjectUrl } from '../client/matrix.js';
import { getState, on, getUserColor, getInitials, setState } from '../store/state.js';
import { showProfile } from './ProfilePopup.js';
import { openInviteModal } from './modals/InviteModal.js';
import { openUserProfileModal } from './modals/UserProfileModal.js';
import { hydrateMediaIn } from './media.js';
import { toastError, toastSuccess } from '../utils/toast.js';

export function renderRightPanel() {
  const el = document.createElement('div');
  el.className = 'right-panel';

  let currentSubView = 'main'; // 'main', 'people', 'pins', 'files'

  function render() {
    const state = getState();
    const roomId = state.activeRoomId;

    if (!roomId) {
      el.innerHTML = `<div style="color:var(--text-dim);font-size:13px;padding:20px;text-align:center">Bir oda seçin</div>`;
      return;
    }

    const room = getRoomById(roomId);
    const name = room?.name || 'Sohbet';
    const avatarUrl = room?.avatarUrl || null;
    const isEncrypted = room?.isEncrypted ?? true;
    const members = getRoomMembers(roomId);
    const pins = getPinnedEvents(roomId);

    if (currentSubView === 'people') {
      renderPeopleSubView(roomId, name, members);
      return;
    }

    if (currentSubView === 'pins') {
      renderPinsSubView(roomId, name, pins);
      return;
    }

    if (currentSubView === 'files') {
      renderFilesSubView(roomId, name);
      return;
    }

    const avatarHtml = avatarUrl
      ? `<div class="panel-big-avatar"><img data-media-src="${escAttr(avatarUrl)}" data-media-w="70" data-media-h="70" alt=""/></div>`
      : `<div class="panel-big-avatar initial-gold">${getInitials(name)}</div>`;

    el.innerHTML = `
      <div class="element-panel-container" style="display:flex; flex-direction:column; height:100%; overflow-y:auto; padding:20px 16px;">
        <!-- Header Card (Clickable to open User Profile) -->
        <div id="right-panel-header-card" style="display:flex; flex-direction:column; align-items:center; text-align:center; padding-bottom:16px; border-bottom:1px solid var(--border); cursor:pointer;" title="Kullanıcı Profili">
          ${avatarHtml}
          <div style="font-family:'Syne',sans-serif; font-size:18px; font-weight:800; color:#ffffff; margin-top:10px; margin-bottom:4px;">${esc(name)}</div>
          <div class="e2e-badge ${isEncrypted ? '' : 'not-encrypted'}" style="font-size:11px; padding:3px 10px;">
            <div class="e2e-dot"></div><span>${isEncrypted ? 'Encrypted' : 'Not Encrypted'}</span>
          </div>
        </div>

        <!-- Action Items List (Settings Removed) -->
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:14px;">
          <div class="element-action-item" id="act-favourite">
            <span class="act-icon"><i class="fa-regular fa-star"></i></span>
            <span class="act-label">Favourite</span>
            <div class="toggle" id="toggle-fav"></div>
          </div>

          <div class="element-action-item" id="act-invite">
            <span class="act-icon"><i class="fa-solid fa-user-plus"></i></span>
            <span class="act-label">Invite</span>
          </div>

          <div class="element-action-item" id="act-people">
            <span class="act-icon"><i class="fa-solid fa-users"></i></span>
            <span class="act-label">People</span>
            <span class="act-badge">${members.length}</span>
          </div>

          <div class="element-action-item" id="act-pins">
            <span class="act-icon"><i class="fa-solid fa-thumbtack"></i></span>
            <span class="act-label">Pinned messages</span>
            <span class="act-badge">${pins.length}</span>
          </div>

          <div class="element-action-item" id="act-files">
            <span class="act-icon"><i class="fa-solid fa-file"></i></span>
            <span class="act-label">Files</span>
          </div>
        </div>
      </div>
    `;

    // Event Listeners
    el.querySelector('#right-panel-header-card')?.addEventListener('click', () => {
      openUserProfileModal(roomId, name, avatarUrl);
    });

    el.querySelector('#act-favourite')?.addEventListener('click', () => {
      const toggle = el.querySelector('#toggle-fav');
      if (toggle) toggle.classList.toggle('on');
    });

    el.querySelector('#act-invite')?.addEventListener('click', () => {
      openInviteModal(roomId);
    });

    el.querySelector('#act-people')?.addEventListener('click', () => {
      currentSubView = 'people';
      render();
    });

    el.querySelector('#act-pins')?.addEventListener('click', () => {
      currentSubView = 'pins';
      render();
    });

    el.querySelector('#act-files')?.addEventListener('click', () => {
      currentSubView = 'files';
      render();
    });

    hydrateMediaIn(el);
  }

  function renderPeopleSubView(roomId, name, members) {
    el.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%; padding:16px; overflow-y:auto;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-shrink:0;">
          <button class="btn-secondary" id="btn-back-main" style="padding:6px 10px; border-radius:8px;"><i class="fa-solid fa-chevron-left"></i></button>
          <div style="font-weight:800; font-size:16px; color:#ffffff;">People (${members.length})</div>
        </div>
        <div id="people-list-container" style="display:flex; flex-direction:column; gap:6px; flex:1; overflow-y:auto;"></div>
      </div>
    `;

    el.querySelector('#btn-back-main')?.addEventListener('click', () => {
      currentSubView = 'main';
      render();
    });

    const listEl = el.querySelector('#people-list-container');
    const state = getState();

    members.forEach(m => {
      const color = getUserColor(m.userId);
      const mName = m.displayName ?? m.userId.split(':')[0].slice(1);
      const mAvatar = m.avatarUrl ?? null;
      const isMe = m.userId === state.accounts[state.activeAccountIndex]?.userId;

      const item = document.createElement('div');
      item.className = 'member-item-card';

      const avatarHtml = mAvatar
        ? `<div class="member-avatar"><img data-media-src="${escAttr(mAvatar)}" data-media-w="34" data-media-h="34" alt=""/><div class="member-status-dot"></div></div>`
        : `<div class="member-avatar initial-gold">${getInitials(mName)}<div class="member-status-dot"></div></div>`;

      item.innerHTML = `
        ${avatarHtml}
        <div class="member-info">
          <div class="member-name">${esc(mName)}${isMe ? ' <span style="color:var(--yellow);font-weight:700;">(sen)</span>' : ''}</div>
          <div class="member-sub">${m.powerLevel >= 100 ? 'Admin' : m.powerLevel >= 50 ? 'Moderatör' : esc(m.userId)}</div>
        </div>
      `;

      item.addEventListener('click', async () => {
        openUserProfileModal(m.userId, mName, mAvatar);
      });

      listEl.appendChild(item);
    });

    hydrateMediaIn(listEl);
  }

  function renderPinsSubView(roomId, name, pins) {
    el.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%; padding:16px; overflow-y:auto;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-shrink:0;">
          <button class="btn-secondary" id="btn-back-main" style="padding:6px 10px; border-radius:8px;"><i class="fa-solid fa-chevron-left"></i></button>
          <div style="font-weight:800; font-size:16px; color:#ffffff;">Pinned Messages (${pins.length})</div>
        </div>
        <div id="pins-list-container" style="display:flex; flex-direction:column; gap:8px; flex:1; overflow-y:auto;"></div>
      </div>
    `;

    el.querySelector('#btn-back-main')?.addEventListener('click', () => {
      currentSubView = 'main';
      render();
    });

    const listEl = el.querySelector('#pins-list-container');

    if (pins.length === 0) {
      listEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:32px 12px;gap:10px;color:var(--text-dim);text-align:center">
          <div style="font-size:32px;color:var(--yellow);"><i class="fa-solid fa-thumbtack"></i></div>
          <div style="font-size:14px;color:#ffffff;font-weight:700">İğnelenmiş mesaj yok</div>
          <div style="font-size:12px">Sohbetteki herhangi bir mesajın yanındaki iğne ikonuna basarak buraya sabitleyebilirsiniz.</div>
        </div>`;
      return;
    }

    pins.forEach(ev => {
      const card = document.createElement('div');
      card.className = 'pinned-msg-card';
      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
          <span style="font-size:13px; font-weight:700; color:var(--yellow);">${esc(ev.sender || 'User')}</span>
          <button class="btn-unpin" title="İğneden Kaldır" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:13px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div style="font-size:13.5px; color:#ffffff; line-height:1.4; word-break:break-word;">${esc(ev.body)}</div>
      `;

      card.querySelector('.btn-unpin').addEventListener('click', async (e) => {
        e.stopPropagation();
        await unpinEvent(roomId, ev.eventId);
        toastSuccess('Mesaj iğneden kaldırıldı');
        render();
      });

      listEl.appendChild(card);
    });
  }

  function renderFilesSubView(roomId, name) {
    el.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%; padding:16px; overflow-y:auto;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-shrink:0;">
          <button class="btn-secondary" id="btn-back-main" style="padding:6px 10px; border-radius:8px;"><i class="fa-solid fa-chevron-left"></i></button>
          <div style="font-weight:800; font-size:16px; color:#ffffff;">Files & Media</div>
        </div>
        <div id="files-list-container" style="display:flex; flex-direction:column; gap:8px; flex:1; overflow-y:auto;"></div>
      </div>
    `;

    el.querySelector('#btn-back-main')?.addEventListener('click', () => {
      currentSubView = 'main';
      render();
    });

    const listEl = el.querySelector('#files-list-container');
    const state = getState();
    const client = state.client;
    const room = client?.getRoom(roomId);

    if (!room) {
      listEl.innerHTML = `<div style="font-size:12px; color:var(--text-dim); text-align:center;">Paylaşılan dosya bulunamadı</div>`;
      return;
    }

    const events = room.getLiveTimeline().getEvents()
      .filter(e => !e.isRedacted() && ['m.room.message'].includes(e.getType()))
      .map(e => e.getContent())
      .filter(c => c && c.url && (c.msgtype === 'm.file' || c.msgtype === 'm.image' || c.msgtype === 'm.audio' || c.msgtype === 'm.video'));

    if (events.length === 0) {
      listEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:32px 12px;gap:10px;color:var(--text-dim);text-align:center">
          <div style="font-size:32px;color:var(--yellow);"><i class="fa-solid fa-file"></i></div>
          <div style="font-size:14px;color:#ffffff;font-weight:700">Paylaşılan dosya yok</div>
          <div style="font-size:12px">Sohbette gönderilen dosya ve medyalar burada listelenir.</div>
        </div>`;
      return;
    }

    events.forEach(c => {
      const filename = c.body || 'Dosya';
      const item = document.createElement('div');
      item.className = 'msg-file-card';
      item.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--bg3); border:1px solid var(--border-hi); border-radius:12px; margin-bottom:4px;';

      item.innerHTML = `
        <div style="font-size:20px; color:var(--yellow); flex-shrink:0;"><i class="fa-solid fa-file"></i></div>
        <div style="flex:1; overflow:hidden;">
          <div style="font-size:13px; font-weight:700; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(filename)}</div>
          <div style="font-size:11px; color:var(--text-muted);">${c.msgtype ? c.msgtype.replace('m.', '').toUpperCase() : 'FILE'}</div>
        </div>
        <a data-file-url="${escAttr(c.url)}" href="#" class="btn-file-download" download="${escAttr(filename)}" title="İndir">
          <i class="fa-solid fa-download"></i>
        </a>
      `;

      const downloadBtn = item.querySelector('.btn-file-download');
      if (downloadBtn && c.url) {
        getMxcObjectUrl(c.url).then(resolved => {
          if (resolved) downloadBtn.href = resolved;
        });
      }

      listEl.appendChild(item);
    });
  }

  on('state', render);
  on('membership-changed', render);
  on('pinned-events-changed', render);
  return el;
}

function esc(s) { return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
