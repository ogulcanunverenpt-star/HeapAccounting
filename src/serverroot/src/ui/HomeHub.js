import { getState, setState, getInitials, getActiveAccount } from '../store/state.js';
import { getRoomList, createRoom, sendFile, sendMessage, getTimeline, getMxcObjectUrl, getOrCreateDirectMessageRoom } from '../client/matrix.js';
import { openImageViewerModal } from './modals/ImageViewerModal.js';
import { openCallModal } from './modals/CallModal.js';
import { openInviteModal } from './modals/InviteModal.js';
import { toastSuccess, toastError } from '../utils/toast.js';
import { hydrateMediaIn } from './media.js';

let activeHubTab = 'profile'; // 'profile', 'stream', 'announcements'
let profileRoomId = null;
let duyuruRoomId = null;

export function renderHomeHub(targetUserId = null, targetName = null, targetAvatarUrl = null) {
  const container = document.createElement('div');
  container.className = 'home-hub-container';
  container.style.cssText = 'display:flex; flex-direction:column; height:100%; width:100%; overflow-y:auto; padding:24px 20px; background:var(--bg);';

  const myAccount = getActiveAccount();
  const isSelf = !targetUserId || targetUserId === myAccount?.userId;

  if (!isSelf) {
    renderOtherUserProfile(container, targetUserId, targetName, targetAvatarUrl);
    return container;
  }

  async function initAndRender() {
    await ensureSpecialRooms();
    renderContent();
  }

  function renderContent() {
    const account = getActiveAccount();
    const name = account?.displayName || account?.userId?.split(':')[0].replace('@', '') || 'Kullanıcı';
    const avatarUrl = account?.avatarUrl || null;

    container.innerHTML = `
      <!-- Top Brand Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:12px;">

          <span class="gamebler-brand" style="font-size:12px;">GameBler Hub</span>
        </div>

        <button class="btn-primary" id="btn-quick-start-dm" style="font-size:13px; padding:8px 16px;">
          <i class="fa-solid fa-circle-plus me-1"></i> Yeni Özel Sohbet
        </button>
      </div>

      <!-- Segmented Hub Tabs -->
      <div class="settings-tabs-horizontal" style="margin-bottom:24px;">
        <button class="settings-tab-pill ${activeHubTab === 'profile' ? 'active' : ''}" id="tab-hub-profile">
          <i class="fa-solid fa-user me-1"></i> Profilim
        </button>
        <button class="settings-tab-pill ${activeHubTab === 'stream' ? 'active' : ''}" id="tab-hub-stream">
          <i class="fa-solid fa-tower-broadcast me-1"></i> Yayınlar (MediaMTX)
        </button>
        <button class="settings-tab-pill ${activeHubTab === 'announcements' ? 'active' : ''}" id="tab-hub-announcements">
          <i class="fa-solid fa-bullhorn me-1"></i> Duyurular
        </button>
      </div>

      <!-- Hub Section Body -->
      <div id="hub-body-content" style="flex:1;"></div>
    `;

    container.querySelector('#btn-quick-start-dm')?.addEventListener('click', () => openInviteModal());

    container.querySelector('#tab-hub-profile')?.addEventListener('click', () => { activeHubTab = 'profile'; renderContent(); });
    container.querySelector('#tab-hub-stream')?.addEventListener('click', () => { activeHubTab = 'stream'; renderContent(); });
    container.querySelector('#tab-hub-announcements')?.addEventListener('click', () => { activeHubTab = 'announcements'; renderContent(); });

    const bodyEl = container.querySelector('#hub-body-content');
    if (activeHubTab === 'profile') renderProfileTab(bodyEl, name, avatarUrl);
    else if (activeHubTab === 'stream') renderStreamTab(bodyEl);
    else if (activeHubTab === 'announcements') renderAnnouncementsTab(bodyEl);
  }

  async function renderProfileTab(bodyEl, name, avatarUrl) {
    const avatarHtml = avatarUrl
      ? `<div class="panel-big-avatar" style="width:84px; height:84px;"><img data-media-src="${escAttr(avatarUrl)}" data-media-w="84" data-media-h="84" alt=""/></div>`
      : `<div class="panel-big-avatar initial-gold" style="width:84px; height:84px; font-size:32px;">${getInitials(name)}</div>`;

    bodyEl.innerHTML = `
      <!-- User Bio Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg2); padding:18px 20px; border-radius:18px; border:1px solid var(--border-hi); margin-bottom:24px;">
        <div style="display:flex; align-items:center; gap:16px;">
          ${avatarHtml}
          <div>
            <div style="font-family:'Syne',sans-serif; font-size:20px; font-weight:800; color:#ffffff;">${esc(name)}</div>
            <div style="font-size:13px; color:var(--yellow); font-weight:600; margin-top:2px;">Cundai Verified Creator</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Cundai Medya Galerisi & Profil Yayınları</div>
          </div>
        </div>

        <div>
          <input type="file" id="profile-media-upload" accept="image/*,video/*" style="display:none" />
          <button class="btn-primary" id="btn-upload-profile-media" style="padding:10px 13px; font-size:11px;">
          +<i class="fa-solid fa-camera me-1"></i>
          </button>
        </div>
      </div>

      <!-- Instagram-Style 3-Column Media Grid -->
      <div style="font-size:15px; font-weight:800; color:#ffffff; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between;">
        <span><i class="fa-solid fa-border-all text-warning me-2"></i>Medya Galerim </span>
        <span style="font-size:12px; color:var(--text-muted);" id="media-count-label">0 Medya</span>
      </div>

      <div id="profile-3grid-container" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; width:100%;">
        <div style="grid-column:span 3; color:var(--text-dim); text-align:center; padding:32px;">Medya galerisi yükleniyor...</div>
      </div>
    `;

    hydrateMediaIn(bodyEl);

    const uploadInput = bodyEl.querySelector('#profile-media-upload');
    bodyEl.querySelector('#btn-upload-profile-media')?.addEventListener('click', () => uploadInput.click());

    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files?.[0];
      if (!file) return;

      const btn = bodyEl.querySelector('#btn-upload-profile-media');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Yükleniyor…';
      }

      try {
        const special = await ensureSpecialRooms();
        const targetRoomId = special.profileRoomId || profileRoomId;

        if (!targetRoomId) {
          throw new Error('Profil odası hazırlanamadı, lütfen tekrar deneyin.');
        }

        await sendFile(targetRoomId, file);
        toastSuccess('Fotoğraf / Video profil galerinize yüklendi!');
        loadProfileGridMedia(bodyEl);
      } catch (err) {
        toastError(err.message || 'Yükleme başarısız.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-camera me-1"></i> Fotoğraf / Video Yükle';
        }
      }
    });

    loadProfileGridMedia(bodyEl);
  }

  async function loadProfileGridMedia(bodyEl) {
    if (!profileRoomId) return;
    const events = getTimeline(profileRoomId, 100);
    const mediaEvents = events.filter(e => e.url && (e.msgtype === 'm.image' || e.msgtype === 'm.video'));

    const gridEl = bodyEl.querySelector('#profile-3grid-container');
    const countEl = bodyEl.querySelector('#media-count-label');

    if (!gridEl) return;
    if (countEl) countEl.textContent = `${mediaEvents.length} Medya`;

    if (mediaEvents.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column:span 3; text-align:center; padding:48px 16px; background:var(--bg2); border-radius:16px; border:1px solid var(--border);">
          <div style="font-size:36px; color:var(--yellow); margin-bottom:8px;"><i class="fa-solid fa-photo-film"></i></div>
          <div style="font-size:14px; font-weight:700; color:#ffffff;">Henüz Fotoğraf veya Video Yok</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">"Fotoğraf / Video Yükle" butonuna basarak ilk medyanızı ekleyebilirsiniz.</div>
        </div>`;
      return;
    }

    gridEl.innerHTML = '';
    for (const ev of mediaEvents.reverse()) {
      const card = document.createElement('div');
      card.className = 'grid-media-card';
      card.style.cssText = 'aspect-ratio:1/1; border-radius:12px; overflow:hidden; background:#000000; cursor:pointer; position:relative; border:1px solid var(--border-hi); transition:transform 0.15s ease;';

      const isVideo = ev.msgtype === 'm.video' || (ev.body && ev.body.match(/\.(mp4|webm)$/i));

      if (isVideo) {
        card.innerHTML = `
          <video data-media-video="${ev.eventId}" style="width:100%; height:100%; object-fit:cover; pointer-events:none;"></video>
          <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.3); color:#ffffff; font-size:24px;">
            <i class="fa-solid fa-play"></i>
          </div>
        `;
        getMxcObjectUrl(ev.url).then(url => {
          const v = card.querySelector('video');
          if (v && url) v.src = url;
        });
      } else {
        card.innerHTML = `<img data-media-img="${ev.eventId}" alt="" style="width:100%; height:100%; object-fit:cover; -webkit-user-drag:none; user-select:none;" />`;
        getMxcObjectUrl(ev.url, 400, 400, 'crop').then(url => {
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

  let isStreamActive = false;

  function renderStreamTab(bodyEl) {
    const isAndroid = window.android && typeof window.android.startScreenShare === 'function';

    bodyEl.innerHTML = `
      <div style="background:var(--bg2); padding:20px; border-radius:18px; border:1px solid var(--border-hi); margin-bottom:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <div style="font-size:16px; font-weight:800; color:#ffffff;">
            <i class="fa-solid fa-tower-broadcast text-warning me-2"></i>MediaMTX Live Stream Server
          </div>
          <span id="stream-live-badge" style="font-size:11px; font-weight:800; padding:4px 10px; border-radius:12px; background:${isStreamActive ? 'var(--red)' : 'var(--bg4)'}; color:#ffffff; display:flex; align-items:center; gap:6px;">
            ${isStreamActive ? '🔴 CANLI YAYINDA' : '⚪ YAYIN KAPALI'}
          </span>
        </div>
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">
          MediaMTX RTSP / WebRTC sunucusu üzerinden canlı yayın ve ekran paylaşımı yapın.
        </div>

        <div class="form-field" style="margin-bottom:14px;">
          <label class="form-label">RTSP Stream Sunucu URL</label>
          <input class="form-input" id="stream-rtsp-url" value="rtsp://gamebler.io:8554/live" placeholder="rtsp://gamebler.io:8554/live" />
          <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">
            Emülatör Testi İçin: <code>rtsp://10.0.2.2:8554/live</code> | Gerçek Cihaz/Sunucu İçin: <code>rtsp://gamebler.io:8554/live</code>
          </div>
        </div>

        <div style="display:flex; gap:12px;">
          <button class="btn-primary" id="btn-start-stream" style="padding:10px 20px; font-size:13.5px;">
            <i class="fa-solid fa-play me-1"></i> Yayını Başlat
          </button>
          <button class="btn-secondary" id="btn-stop-stream" style="padding:10px 20px; font-size:13.5px; color:var(--red); border-color:rgba(239,68,68,0.4);">
            <i class="fa-solid fa-stop me-1"></i> Yayını Durdur
          </button>
        </div>
      </div>

      <!-- Live Stream Player Canvas -->
      <div style="width:100%; height:320px; background:#000000; border-radius:18px; border:1px solid var(--border-hi); display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; overflow:hidden;">
        ${isStreamActive ? `
          <div style="position:absolute; top:12px; left:12px; background:var(--red); color:#ffffff; font-size:11px; font-weight:800; padding:4px 10px; border-radius:8px; z-index:10; display:flex; align-items:center; gap:6px;">
            🔴 LIVE
          </div>
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px; color:var(--yellow);">
            <div style="font-size:48px;"><i class="fa-solid fa-signal"></i></div>
            <div style="font-size:16px; font-weight:800; color:#ffffff;">RTSP Yayın Akışı Aktif</div>
            <div style="font-size:12px; color:var(--text-muted);">MediaMTX sunucusuna canlı görüntü ve ses iletiliyor...</div>
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; align-items:center; gap:12px; color:var(--text-dim);" id="stream-placeholder">
            <div style="font-size:48px; color:var(--yellow);"><i class="fa-solid fa-video"></i></div>
            <div style="font-size:14px; font-weight:700; color:#ffffff;">Yayın Başlatılmadı</div>
            <div style="font-size:12px;">"Yayını Başlat" butonuna basarak MediaMTX sunucusuna canlı yayın aktarabilirsiniz.</div>
          </div>
        `}
      </div>
    `;

    bodyEl.querySelector('#btn-start-stream')?.addEventListener('click', () => {
      const rtspUrl = bodyEl.querySelector('#stream-rtsp-url').value.trim();
      if (!rtspUrl) {
        toastError('Lütfen RTSP sunucu adresini girin.');
        return;
      }
      isStreamActive = true;
      if (isAndroid) {
        window.android.startScreenShare(rtspUrl);
        toastSuccess('Android ScreenShare RTSP yayını başlatıldı!');
      } else {
        toastSuccess('WebRTC / RTSP yayını başlatıldı!');
      }
      renderStreamTab(bodyEl);
    });

    bodyEl.querySelector('#btn-stop-stream')?.addEventListener('click', () => {
      isStreamActive = false;
      if (isAndroid) {
        window.android.stopScreenShare();
        toastSuccess('Yayın durduruldu.');
      } else {
        toastSuccess('Yayın durduruldu.');
      }
      renderStreamTab(bodyEl);
    });
  }

  function renderAnnouncementsTab(bodyEl) {
    bodyEl.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <div style="font-size:16px; font-weight:800; color:#ffffff;">
          <i class="fa-solid fa-bullhorn text-warning me-2"></i>Resmi Duyurular
        </div>
        <button class="btn-primary" id="btn-add-announcement" style="padding:8px 16px; font-size:13px;">
          <i class="fa-solid fa-plus me-1"></i> Yeni Duyuru Ekle
        </button>
      </div>

      <div id="announcements-list-container" style="display:flex; flex-direction:column; gap:10px;">
        <div style="color:var(--text-dim); text-align:center; padding:32px;">Duyurular yükleniyor...</div>
      </div>
    `;

    bodyEl.querySelector('#btn-add-announcement')?.addEventListener('click', async () => {
      const text = prompt('Yayınlamak istediğiniz resmi duyuru metni:');
      if (!text) return;

      try {
        const special = await ensureSpecialRooms();
        const targetRoomId = special.duyuruRoomId || duyuruRoomId;

        if (!targetRoomId) {
          throw new Error('Duyuru odası hazırlanamadı, lütfen tekrar deneyin.');
        }

        await sendMessage(targetRoomId, `📢 ${text.trim()}`);
        toastSuccess('Yeni duyuru yayınlandı!');
        loadAnnouncements(bodyEl);
      } catch (err) {
        toastError(err.message || 'Duyuru eklenemedi.');
      }
    });

    loadAnnouncements(bodyEl);
  }

  async function loadAnnouncements(bodyEl) {
    if (!duyuruRoomId) return;
    const events = getTimeline(duyuruRoomId, 50);
    const msgEvents = events.filter(e => e.type === 'message');

    const containerEl = bodyEl.querySelector('#announcements-list-container');
    if (!containerEl) return;

    if (msgEvents.length === 0) {
      containerEl.innerHTML = `
        <div style="text-align:center; padding:48px 16px; background:var(--bg2); border-radius:16px; border:1px solid var(--border);">
          <div style="font-size:36px; color:var(--yellow); margin-bottom:8px;"><i class="fa-solid fa-bullhorn"></i></div>
          <div style="font-size:14px; font-weight:700; color:#ffffff;">Henüz Duyuru Yok</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">"Yeni Duyuru Ekle" butonuna basarak duyuru yayınlayabilirsiniz.</div>
        </div>`;
      return;
    }

    containerEl.innerHTML = '';
    for (const ev of msgEvents.reverse()) {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--bg2); border:1px solid var(--border-hi); border-left:4px solid var(--yellow); border-radius:12px; padding:14px 16px; display:flex; flex-direction:column; gap:6px;';

      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:12px; font-weight:800; color:var(--yellow); text-transform:uppercase;">📌 Resmi Duyuru</span>
          <span style="font-size:11px; color:var(--text-muted);">${new Date(ev.ts).toLocaleString()}</span>
        </div>
        <div style="font-size:14px; color:#ffffff; line-height:1.5;">${esc(ev.body)}</div>
      `;

      containerEl.appendChild(card);
    }
  }

  async function ensureSpecialRooms() {
    const account = getActiveAccount();
    if (!account) return { profileRoomId: null, duyuruRoomId: null };

    const username = account.displayName || account.userId.split(':')[0].replace('@', '') || 'Kullanıcı';
    const profName = `${username} Cundai Profil`;
    const duyName = `${username} Cundai Duyurular`;

    const rooms = getRoomList();

    let pRoom = rooms.find(r => r.name === profName);
    let dRoom = rooms.find(r => r.name === duyName);

    if (!pRoom) {
      const res = await createRoom(profName, true, 'Profil Medya Galerisi', null, false);
      if (res.ok && res.roomId) {
        profileRoomId = res.roomId;
      }
    } else {
      profileRoomId = pRoom.roomId;
    }

    if (!dRoom) {
      const res = await createRoom(duyName, true, 'Resmi Duyurular', null, false);
      if (res.ok && res.roomId) {
        duyuruRoomId = res.roomId;
      }
    } else {
      duyuruRoomId = dRoom.roomId;
    }

    return { profileRoomId, duyuruRoomId };
  }

  initAndRender();
  return container;
}

function renderOtherUserProfile(container, targetUserId, targetName, targetAvatarUrl) {
  const name = targetName || targetUserId.split(':')[0].replace('@', '');
  const initials = getInitials(name);

  const avatarHtml = targetAvatarUrl
    ? `<div class="panel-big-avatar" style="width:84px; height:84px;"><img data-media-src="${escAttr(targetAvatarUrl)}" data-media-w="84" data-media-h="84" alt=""/></div>`
    : `<div class="panel-big-avatar initial-gold" style="width:84px; height:84px; font-size:32px;">${initials}</div>`;

  container.innerHTML = `
    <!-- Top Back Button Bar -->
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
      <button class="btn-secondary" id="btn-back-my-hub" style="padding:8px 16px; font-size:13px;">
        <i class="fa-solid fa-arrow-left me-1"></i> Kendi Profilime Dön
      </button>

      <div style="display:flex; align-items:center; gap:10px;">
        <button class="btn-primary" id="btn-other-user-dm" style="font-size:13px; padding:8px 16px;">
          <i class="fa-solid fa-comments me-1"></i> Mesaj Gönder
        </button>
        <button class="btn-secondary" id="btn-other-user-audio" style="font-size:13px; padding:8px 12px;" title="Sesli Arama">
          <i class="fa-solid fa-phone text-warning"></i>
        </button>
        <button class="btn-secondary" id="btn-other-user-video" style="font-size:13px; padding:8px 12px;" title="Görüntülü Arama">
          <i class="fa-solid fa-video text-warning"></i>
        </button>
      </div>
    </div>

    <!-- Target User Header (Read-Only) -->
    <div style="display:flex; align-items:center; gap:16px; background:var(--bg2); padding:20px; border-radius:18px; border:1px solid var(--border-hi); margin-bottom:24px;">
      ${avatarHtml}
      <div>
        <div style="font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:#ffffff;">${esc(name)}</div>
        <div style="font-size:13px; color:var(--yellow); font-weight:600; margin-top:2px;">${esc(targetUserId)}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Cundai Kullanıcı Medya Galerisi (Salt Okunur)</div>
      </div>
    </div>

    <!-- 3-Column Media Grid (Read-Only) -->
    <div style="font-size:16px; font-weight:800; color:#ffffff; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between;">
      <span><i class="fa-solid fa-border-all text-warning me-2"></i>Kullanıcı Medya Galerisi (3'lü Grid)</span>
      <span style="font-size:12px; color:var(--text-muted);" id="other-media-count-label">0 Medya</span>
    </div>

    <div id="other-user-3grid-container" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; width:100%;">
      <div style="grid-column:span 3; color:var(--text-dim); text-align:center; padding:48px;">Görseller yükleniyor...</div>
    </div>
  `;

  container.querySelector('#btn-back-my-hub')?.addEventListener('click', () => {
    setState({ activeRoomId: null, viewingUserId: null });
  });

  container.querySelector('#btn-other-user-dm')?.addEventListener('click', async () => {
    try {
      const dmRoomId = await getOrCreateDirectMessageRoom(targetUserId);
      setState({ activeRoomId: dmRoomId, sidebarFilter: 'dms' });
    } catch (err) {
      toastError(err.message || 'Sohbet açılamadı.');
    }
  });

  container.querySelector('#btn-other-user-audio')?.addEventListener('click', async () => {
    try {
      const dmRoomId = await getOrCreateDirectMessageRoom(targetUserId);
      openCallModal({ roomId: dmRoomId, roomName: name, isVideo: false });
    } catch (err) {
      toastError(err.message || 'Arama başlatılamadı.');
    }
  });

  container.querySelector('#btn-other-user-video')?.addEventListener('click', async () => {
    try {
      const dmRoomId = await getOrCreateDirectMessageRoom(targetUserId);
      openCallModal({ roomId: dmRoomId, roomName: name, isVideo: true });
    } catch (err) {
      toastError(err.message || 'Arama başlatılamadı.');
    }
  });

  hydrateMediaIn(container);
  loadOtherUserMediaGrid(container, targetUserId, name);
}

async function loadOtherUserMediaGrid(container, targetUserId, displayName) {
  const gridEl = container.querySelector('#other-user-3grid-container');
  const countEl = container.querySelector('#other-media-count-label');
  if (!gridEl) return;

  const rooms = getRoomList();
  const profName = `${displayName} Cundai Profil`;
  const pRoom = rooms.find(r => r.name === profName || r.name.includes(displayName));

  if (!pRoom) {
    gridEl.innerHTML = `
      <div style="grid-column:span 3; text-align:center; padding:48px 16px; background:var(--bg2); border-radius:16px; border:1px solid var(--border);">
        <div style="font-size:36px; color:var(--yellow); margin-bottom:8px;"><i class="fa-solid fa-photo-film"></i></div>
        <div style="font-size:14px; font-weight:700; color:#ffffff;">Açık Medya Galerisi Bulunamadı</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Bu kullanıcının henüz yayınladığı bir medya yok.</div>
      </div>`;
    if (countEl) countEl.textContent = '0 Medya';
    return;
  }

  const events = getTimeline(pRoom.roomId, 100);
  const mediaEvents = events.filter(e => e.url && (e.msgtype === 'm.image' || e.msgtype === 'm.video'));

  if (countEl) countEl.textContent = `${mediaEvents.length} Medya`;

  if (mediaEvents.length === 0) {
    gridEl.innerHTML = `
      <div style="grid-column:span 3; text-align:center; padding:48px 16px; background:var(--bg2); border-radius:16px; border:1px solid var(--border);">
        <div style="font-size:36px; color:var(--yellow); margin-bottom:8px;"><i class="fa-solid fa-photo-film"></i></div>
        <div style="font-size:14px; font-weight:700; color:#ffffff;">Henüz Medya Yok</div>
      </div>`;
    return;
  }

  gridEl.innerHTML = '';
  for (const ev of mediaEvents.reverse()) {
    const card = document.createElement('div');
    card.style.cssText = 'aspect-ratio:1/1; border-radius:12px; overflow:hidden; background:#000000; cursor:pointer; position:relative; border:1px solid var(--border-hi); transition:transform 0.15s ease;';

    const isVideo = ev.msgtype === 'm.video' || (ev.body && ev.body.match(/\.(mp4|webm)$/i));

    if (isVideo) {
      card.innerHTML = `
        <video data-media-video="${ev.eventId}" style="width:100%; height:100%; object-fit:cover; pointer-events:none;"></video>
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.3); color:#ffffff; font-size:24px;">
          <i class="fa-solid fa-play"></i>
        </div>
      `;
      getMxcObjectUrl(ev.url).then(url => {
        const v = card.querySelector('video');
        if (v && url) v.src = url;
      });
    } else {
      card.innerHTML = `<img data-media-img="${ev.eventId}" alt="" style="width:100%; height:100%; object-fit:cover; -webkit-user-drag:none; user-select:none;" />`;
      getMxcObjectUrl(ev.url, 400, 400, 'crop').then(url => {
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
