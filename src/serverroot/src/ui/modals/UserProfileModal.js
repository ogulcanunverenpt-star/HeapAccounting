import { getState, setState, getInitials } from '../../store/state.js';
import { getRoomList, getOrCreateDirectMessageRoom, getTimeline, getMxcObjectUrl } from '../../client/matrix.js';
import { openImageViewerModal } from './ImageViewerModal.js';
import { openCallModal } from './CallModal.js';
import { toastError } from '../../utils/toast.js';

let overlay = null;

export async function openUserProfileModal(targetUserId, targetName = null, targetAvatarUrl = null) {
  if (!overlay) buildModal();

  const displayName = targetName || targetUserId.split(':')[0].replace('@', '');
  const initials = getInitials(displayName);

  overlay.querySelector('#user-prof-name').textContent = displayName;
  overlay.querySelector('#user-prof-id').textContent = targetUserId;
  overlay.querySelector('#user-prof-initials').textContent = initials;

  const avatarContainer = overlay.querySelector('#user-prof-avatar-container');
  if (targetAvatarUrl) {
    avatarContainer.innerHTML = `<img src="${escAttr(targetAvatarUrl)}" style="width:100%; height:100%; object-fit:cover;" alt="" />`;
  } else {
    avatarContainer.innerHTML = `<span id="user-prof-initials">${initials}</span>`;
  }

  // Bind Actions
  const dmBtn = overlay.querySelector('#btn-user-prof-dm');
  const audioCallBtn = overlay.querySelector('#btn-user-prof-audio');
  const videoCallBtn = overlay.querySelector('#btn-user-prof-video');

  const newDmBtn = dmBtn.cloneNode(true);
  const newAudioBtn = audioCallBtn.cloneNode(true);
  const newVideoBtn = videoCallBtn.cloneNode(true);

  dmBtn.parentNode.replaceChild(newDmBtn, dmBtn);
  audioCallBtn.parentNode.replaceChild(newAudioBtn, audioCallBtn);
  videoCallBtn.parentNode.replaceChild(newVideoBtn, videoCallBtn);

  newDmBtn.addEventListener('click', async () => {
    closeUserProfileModal();
    try {
      const dmRoomId = await getOrCreateDirectMessageRoom(targetUserId);
      setState({ activeRoomId: dmRoomId, sidebarFilter: 'dms' });
    } catch (err) {
      toastError(err.message || 'Özel sohbet açılamadı.');
    }
  });

  newAudioBtn.addEventListener('click', async () => {
    closeUserProfileModal();
    try {
      const dmRoomId = await getOrCreateDirectMessageRoom(targetUserId);
      openCallModal({ roomId: dmRoomId, roomName: displayName, isVideo: false });
    } catch (err) {
      toastError(err.message || 'Arama başlatılamadı.');
    }
  });

  newVideoBtn.addEventListener('click', async () => {
    closeUserProfileModal();
    try {
      const dmRoomId = await getOrCreateDirectMessageRoom(targetUserId);
      openCallModal({ roomId: dmRoomId, roomName: displayName, isVideo: true });
    } catch (err) {
      toastError(err.message || 'Arama başlatılamadı.');
    }
  });

  overlay.classList.add('open');

  // Load User's Public Profile Media Grid
  loadUserPublicMedia(targetUserId, displayName);
}

export function closeUserProfileModal() {
  overlay?.classList.remove('open');
}

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '960';

  overlay.innerHTML = `
    <div class="modal" style="width:520px; max-width:calc(100vw - 28px); background:var(--bg2); border-radius:24px; padding:24px; display:flex; flex-direction:column;">
      <!-- Profile Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div class="panel-big-avatar initial-gold" style="width:72px; height:72px; font-size:28px;" id="user-prof-avatar-container">
            <span id="user-prof-initials">C</span>
          </div>
          <div>
            <div style="font-family:'Syne',sans-serif; font-size:19px; font-weight:800; color:#ffffff;" id="user-prof-name">Kullanıcı</div>
            <div style="font-size:12px; color:var(--yellow); font-weight:600; margin-top:2px;" id="user-prof-id">@user:matrix.org</div>
            <div style="font-size:11.5px; color:var(--text-muted); margin-top:3px;">Cundai Kullanıcı Profili (Salt Okunur)</div>
          </div>
        </div>

        <button class="btn-secondary" id="user-prof-close" style="padding:6px 12px; font-size:14px;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Quick Action Buttons -->
      <div style="display:flex; gap:10px; margin-bottom:20px;">
        <button class="btn-primary" id="btn-user-prof-dm" style="flex:1; font-size:13px; padding:8px 12px;">
          <i class="fa-solid fa-comments me-1"></i> Mesaj Gönder
        </button>
        <button class="btn-secondary" id="btn-user-prof-audio" style="font-size:13px; padding:8px 12px;">
          <i class="fa-solid fa-phone text-warning me-1"></i> Sesli
        </button>
        <button class="btn-secondary" id="btn-user-prof-video" style="font-size:13px; padding:8px 12px;">
          <i class="fa-solid fa-video text-warning me-1"></i> Görüntülü
        </button>
      </div>

      <!-- User Media Grid Title -->
      <div style="font-size:14px; font-weight:800; color:#ffffff; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
        <span><i class="fa-solid fa-border-all text-warning me-2"></i>Kullanıcı Medya Galerisi</span>
        <span style="font-size:11px; color:var(--text-muted);" id="user-media-count-label">0 Medya</span>
      </div>

      <!-- 3-Column Media Grid (Read-Only) -->
      <div id="user-public-media-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; max-height:280px; overflow-y:auto; width:100%;">
        <div style="grid-column:span 3; color:var(--text-dim); text-align:center; padding:24px;">Görseller yükleniyor...</div>
      </div>
    </div>
  `;

  overlay.querySelector('#user-prof-close').addEventListener('click', closeUserProfileModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeUserProfileModal(); });

  document.body.appendChild(overlay);
}

async function loadUserPublicMedia(targetUserId, displayName) {
  const gridEl = overlay?.querySelector('#user-public-media-grid');
  const countEl = overlay?.querySelector('#user-media-count-label');
  if (!gridEl) return;

  const rooms = getRoomList();
  const profName = `${displayName} Cundai Profil`;
  const pRoom = rooms.find(r => r.name === profName || r.name.includes(displayName));

  if (!pRoom) {
    gridEl.innerHTML = `
      <div style="grid-column:span 3; text-align:center; padding:32px 12px; background:var(--bg3); border-radius:12px; border:1px solid var(--border);">
        <div style="font-size:28px; color:var(--yellow); margin-bottom:6px;"><i class="fa-solid fa-photo-film"></i></div>
        <div style="font-size:13px; font-weight:700; color:#ffffff;">Açık Medya Galerisi Bulunamadı</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Bu kullanıcının henüz yayınladığı bir medya yok.</div>
      </div>`;
    if (countEl) countEl.textContent = '0 Medya';
    return;
  }

  const events = getTimeline(pRoom.roomId, 60);
  const mediaEvents = events.filter(e => e.url && (e.msgtype === 'm.image' || e.msgtype === 'm.video'));

  if (countEl) countEl.textContent = `${mediaEvents.length} Medya`;

  if (mediaEvents.length === 0) {
    gridEl.innerHTML = `
      <div style="grid-column:span 3; text-align:center; padding:32px 12px; background:var(--bg3); border-radius:12px; border:1px solid var(--border);">
        <div style="font-size:28px; color:var(--yellow); margin-bottom:6px;"><i class="fa-solid fa-photo-film"></i></div>
        <div style="font-size:13px; font-weight:700; color:#ffffff;">Medya Yok</div>
      </div>`;
    return;
  }

  gridEl.innerHTML = '';
  for (const ev of mediaEvents.reverse()) {
    const card = document.createElement('div');
    card.style.cssText = 'aspect-ratio:1/1; border-radius:10px; overflow:hidden; background:#000000; cursor:pointer; position:relative; border:1px solid var(--border-hi);';

    const isVideo = ev.msgtype === 'm.video' || (ev.body && ev.body.match(/\.(mp4|webm)$/i));

    if (isVideo) {
      card.innerHTML = `
        <video data-media-video="${ev.eventId}" style="width:100%; height:100%; object-fit:cover; pointer-events:none;"></video>
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.3); color:#ffffff; font-size:18px;">
          <i class="fa-solid fa-play"></i>
        </div>
      `;
      getMxcObjectUrl(ev.url).then(url => {
        const v = card.querySelector('video');
        if (v && url) v.src = url;
      });
    } else {
      card.innerHTML = `<img data-media-img="${ev.eventId}" alt="" style="width:100%; height:100%; object-fit:cover; -webkit-user-drag:none; user-select:none;" />`;
      getMxcObjectUrl(ev.url, 300, 300, 'crop').then(url => {
        const img = card.querySelector('img');
        if (img && url) {
          img.src = url;
          card.addEventListener('click', () => openImageViewerModal(url, ev.body || 'Resim'));
        }
      });
    }

    gridEl.appendChild(card);
  }
}

function esc(s) { return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
