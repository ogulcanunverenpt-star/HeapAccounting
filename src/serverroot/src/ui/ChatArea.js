import {
  getTimeline, sendMessage, sendTyping, getRoomById,
  getRoomMembers, getEncryptionStatus, loadMoreMessages,
  getRoomMemberMap, markRoomRead, getEventById,
  sendFile, inviteToRoom, updateRoomProfile, getMxcObjectUrl, sendReaction, getReactions, sendRedaction, pinEvent, leaveRoomOrSpace
} from '../client/matrix.js';
import { getState, on, getUserColor, getInitials, getRoomTheme } from '../store/state.js';
import { formatTime, formatDate, renderMessageBody, isSameMinute } from '../utils/format.js';
import { toastError, toastSuccess } from '../utils/toast.js';
import { openCmdK } from './CmdK.js';
import { openInviteModal } from './modals/InviteModal.js';
import { openEditRoomModal } from './modals/EditRoomModal.js';
import { openCallModal } from './modals/CallModal.js';
import { openImageViewerModal } from './modals/ImageViewerModal.js';
import { showConfirmModal } from './modals/ConfirmModal.js';
import { fetchOpenGraph, extractFirstUrl } from '../utils/opengraph.js';
import { renderHomeHub } from './HomeHub.js';
import { hydrateMediaIn } from './media.js';
import { playOutgoingSound } from '../utils/audio.js';
import 'emoji-picker-element';

export function renderChatArea() {
  const el = document.createElement('div');
  el.className = 'chat-area';
  el.innerHTML = `
    <div id="no-room-placeholder" class="no-room-selected"></div>
    <div id="chat-inner" style="display:none;flex:1;flex-direction:column;min-height:0">
      <div class="chat-header">
        <button class="header-btn mobile-menu-btn" id="mobile-menu-btn" title="Rooms"><i class="fa-solid fa-bars"></i></button>
        <div class="chat-room-icon" id="chat-icon">#</div>
        <span class="chat-room-name" id="chat-name">—</span>
        <span class="chat-room-topic" id="chat-topic"></span>
        <div class="header-actions">
          <button class="header-btn" id="btn-audio-call" title="Sesli Arama"><i class="fa-solid fa-phone"></i></button>
          <button class="header-btn" id="btn-video-call" title="Görüntülü Arama"><i class="fa-solid fa-video"></i></button>
          <button class="header-btn" id="btn-room-invite" title="Kullanıcı Davet Et"><i class="fa-solid fa-user-plus"></i></button>
          <button class="header-btn" id="btn-room-edit" title="Oda Ayarları"><i class="fa-solid fa-pen"></i></button>
          <button class="header-btn" id="btn-room-leave" title="Odadan Ayrıl" style="color:var(--red) !important;"><i class="fa-solid fa-right-from-bracket"></i></button>
          <div class="e2e-badge not-encrypted" id="e2e-badge">
            <div class="e2e-dot"></div><span id="e2e-text">Not encrypted</span>
          </div>
          <button class="header-btn" id="btn-toggle-rightpanel" title="Oda Bilgisi / Panel"><i class="fa-solid fa-circle-info"></i></button>
        </div>
      </div>
      <div class="messages-container" id="messages-container">
        <div class="messages-inner" id="messages-inner"></div>
      </div>
      <div class="chat-input-wrap" id="input-wrap">
        <div class="typing-indicator" id="typing-indicator"></div>
        <div class="mention-popup" id="mention-popup" style="display:none"></div>
        <div class="chat-input-box">
          <input type="file" id="file-input" style="display:none" />
          <textarea class="msg-input" id="msg-input" rows="1" placeholder="Mesaj yazın…"></textarea>
          <div class="input-actions">
            <button class="input-btn" id="btn-attach" title="Dosya ekle"><i class="fa-solid fa-paperclip"></i></button>
            <button class="input-btn" id="btn-emoji" title="Emoji"><i class="fa-regular fa-face-smile"></i></button>
            <button class="input-btn send" id="btn-send"><i class="fa-solid fa-paper-plane"></i></button>
          </div>
        </div>
        <div class="emoji-popup" id="emoji-popup" style="display:none"></div>
      </div>
    </div>
  `;

  let currentRoomId = null;
  let isAtBottom = true;
  let typingTimer = null;
  let memberMap = [];
  let mentionFocus = 0;

  const msgsContainer = el.querySelector('#messages-container');
  const msgsInner = el.querySelector('#messages-inner');
  const msgInput = el.querySelector('#msg-input');
  const sendBtn = el.querySelector('#btn-send');
  const fileInput = el.querySelector('#file-input');
  const attachBtn = el.querySelector('#btn-attach');
  const emojiBtn = el.querySelector('#btn-emoji');
  const emojiPopup = el.querySelector('#emoji-popup');
  const noRoom = el.querySelector('#no-room-placeholder');
  const chatInner = el.querySelector('#chat-inner');
  const mentionPopup = el.querySelector('#mention-popup');
  const inputWrap = el.querySelector('#input-wrap');

  const homeHubEl = renderHomeHub();
  noRoom.innerHTML = '';
  noRoom.style.cssText = 'flex:1; width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden;';
  noRoom.appendChild(homeHubEl);

  el.querySelector('#mobile-menu-btn')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.add('mobile-open');
    document.querySelector('.mobile-overlay')?.classList.add('active');
  });

  el.querySelector('#btn-audio-call')?.addEventListener('click', () => {
    if (!currentRoomId) return;
    const room = getRoomById(currentRoomId);
    openCallModal({ roomId: currentRoomId, roomName: room?.name, isVideo: false });
  });

  el.querySelector('#btn-video-call')?.addEventListener('click', () => {
    if (!currentRoomId) return;
    const room = getRoomById(currentRoomId);
    openCallModal({ roomId: currentRoomId, roomName: room?.name, isVideo: true });
  });

  el.querySelector('#btn-toggle-rightpanel')?.addEventListener('click', () => {
    const rightPanel = document.querySelector('.right-panel');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.mobile-overlay');
    if (rightPanel) {
      if (sidebar) sidebar.classList.remove('mobile-open');
      rightPanel.classList.toggle('mobile-open');
      if (overlay) overlay.classList.toggle('active', rightPanel.classList.contains('mobile-open'));
    }
  });

  el.querySelector('#btn-room-invite')?.addEventListener('click', () => {
    if (!currentRoomId) return;
    openInviteModal(currentRoomId);
  });

  el.querySelector('#btn-room-edit')?.addEventListener('click', () => {
    if (!currentRoomId) return;
    openEditRoomModal(currentRoomId);
  });

  el.querySelector('#btn-room-leave')?.addEventListener('click', () => {
    if (!currentRoomId) return;
    const room = getRoomById(currentRoomId);
    const roomName = room?.name || 'Sohbet';
    showConfirmModal({
      title: 'Odadan Ayrıl',
      message: `"${roomName}" odasından ayrılmak istediğinize emin misiniz?`,
      confirmText: 'Odadan Ayrıl',
      danger: true,
      onConfirm: async () => {
        try {
          await leaveRoomOrSpace(currentRoomId);
          toastSuccess(`"${roomName}" odasından ayrılındı.`);
        } catch (err) {
          toastError(err.message || 'Odadan ayrılınamadı.');
        }
      }
    });
  });

  let visibleMessageLimit = 25;
  let isLoadingOlder = false;

  function loadRoom(roomId) {
    if (roomId === currentRoomId) return;
    currentRoomId = roomId;
    visibleMessageLimit = 25;
    const room = getRoomById(roomId);
    if (!room) return;

    noRoom.style.display = 'none';
    chatInner.style.display = 'flex';

    const theme = getRoomTheme(roomId);
    const iconEl = el.querySelector('#chat-icon');
    const avatarMxc = room.getMxcAvatarUrl();
    if (avatarMxc) {
      iconEl.innerHTML = `<img data-media-src="${escAttr(avatarMxc)}" data-media-w="48" data-media-h="48" alt=""/>`;
      hydrateMediaIn(iconEl);
    } else {
      iconEl.textContent = '#';
      iconEl.style.color = `var(--${theme})`;
    }

    el.querySelector('#chat-name').textContent = room.name ?? roomId;
    const topic = room.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic ?? '';
    el.querySelector('#chat-topic').textContent = topic;
    el.querySelector('#chat-topic').style.display = topic ? '' : 'none';

    updateE2E(roomId);
    msgInput.placeholder = `${room.name ?? roomId}…`;

    memberMap = getRoomMemberMap(roomId);

    renderMessages(roomId, visibleMessageLimit);
    markRoomRead(roomId);
    requestAnimationFrame(scrollToBottom);
  }

  function updateE2E(roomId) {
    const s = getEncryptionStatus(roomId);
    const badge = el.querySelector('#e2e-badge');
    const text = el.querySelector('#e2e-text');
    badge.className = `e2e-badge ${s === 'encrypted' ? '' : s === 'not-encrypted' ? 'not-encrypted' : 'unverified'}`;
    text.textContent = s === 'encrypted' ? 'E2E Encrypted' : s === 'not-encrypted' ? 'Not encrypted' : 'Keys unverified';
  }

  function renderMessages(roomId, limit = visibleMessageLimit) {
    const events = getTimeline(roomId, limit);
    const reactions = getReactions(roomId);
    msgsInner.innerHTML = '';
    if (events.length === 0) {
      msgsInner.innerHTML = `
        <div class="room-empty">
          <div class="room-empty-icon"><i class="fa-solid fa-comments"></i></div>
          <div class="room-empty-title">Sohbeti Başlatın</div>
          <div class="room-empty-sub">Henüz mesaj yok — selam verin!</div>
        </div>`;
      return;
    }
    let lastDate = null, lastSender = null, lastTs = null;
    for (const event of events) {
      const d = formatDate(event.ts);
      if (d !== lastDate) {
        msgsInner.appendChild(makeDivider(d));
        lastDate = d; lastSender = null;
      }
      if (event.type === 'event') {
        msgsInner.appendChild(makeEventRow(event));
        lastSender = null; continue;
      }
      const cont = event.sender === lastSender && isSameMinute(event.ts, lastTs ?? 0);
      msgsInner.appendChild(makeMessage(event, cont, reactions[event.eventId] ?? {}));
      lastSender = event.sender; lastTs = event.ts;
    }
  }

  function makeDivider(label) {
    const d = document.createElement('div');
    d.className = 'day-divider'; d.textContent = label; return d;
  }

  function makeEventRow(event) {
    const d = document.createElement('div');
    d.className = 'msg-event';
    d.innerHTML = `<span>${event.icon}</span><span>${esc(event.text)}</span>
      <span style="margin-left:auto;font-size:10px;color:var(--text-dim)">${formatTime(event.ts)}</span>`;
    return d;
  }

  function makeMessage(event, isCont, eventReactions = {}) {
    const wrap = document.createElement('div');
    wrap.className = `msg-group${isCont ? ' continuation' : ''}`;
    wrap.dataset.eventId = event.eventId;

    const color = getUserColor(event.sender);
    const member = memberMap.find(m => m.userId === event.sender);
    const name = member?.displayName ?? event.sender.split(':')[0].slice(1);
    const initials = getInitials(name);
    const avatarUrl = member?.avatarUrl ?? null;
    const time = formatTime(event.ts);
    const activeUserId = getState().accounts[getState().activeAccountIndex]?.userId ?? '';
    const activeLocal = activeUserId.split(':')[0].replace(/^@/, '');
    const mentionHit = (event.mentionedUserIds ?? []).includes(activeUserId)
      || new RegExp(`(^|\\s)@${escapeRegExp(activeLocal)}\\b`, 'i').test(event.body ?? '');
    if (mentionHit) wrap.classList.add('mention-highlight');

    let displayBody = event.body ?? '';
    if (event.replyTo) {
      displayBody = displayBody.replace(/^(>.*\n?)+\n?/, '').trim();
    }
    const bodyHtml = renderMessageBody(displayBody);
    const mediaHtml = renderAttachment(event);
    const errHtml = event.status === 'not_sent'
      ? `<div class="msg-send-error"><span>⚠</span><div>Failed to send. <a class="retry-link">Retry ↗</a></div></div>` : '';

    let replyHtml = '';
    if (event.replyTo) {
      const replied = getEventById(currentRoomId, event.replyTo);
      if (replied) {
        const rName = replied.senderName;
        const rBody = (replied.body ?? '').replace(/^(>.*\n?)+\n?/, '').trim().slice(0, 120);
        replyHtml = `<div class="msg-reply-preview" data-reply-to="${escAttr(event.replyTo)}" style="cursor:pointer;"><span class="msg-reply-author">${esc(rName)}</span><span class="msg-reply-body">${esc(rBody)}</span></div>`;
      }
    }

    const firstUrl = extractFirstUrl(displayBody);
    const ogPlaceholderHtml = firstUrl ? `<div class="msg-og-card" data-og-url="${escAttr(firstUrl)}"></div>` : '';

    const avatarHtml = avatarUrl
      ? `<div class="msg-avatar${isCont ? ' hidden' : ''}" data-userid="${esc(event.sender)}" style="cursor:pointer"><img data-media-src="${escAttr(avatarUrl)}" data-media-w="34" data-media-h="34" alt=""/></div>`
      : `<div class="msg-avatar${isCont ? ' hidden' : ''}" data-userid="${esc(event.sender)}" style="background:${color};cursor:pointer">${initials}</div>`;

    const reactionEntries = Object.entries(eventReactions);
    const reactionsHtml = reactionEntries.length
      ? `<div class="msg-reactions">${reactionEntries.map(([emoji, count]) =>
        `<button class="reaction-pill" data-emoji="${escAttr(emoji)}">${esc(emoji)} <span>${count}</span></button>`
      ).join('')}</div>`
      : '';

    if (isCont) {
      wrap.innerHTML = `
        <div class="msg-avatar-col">${avatarHtml}<div class="msg-ts-inline">${time}</div></div>
        <div class="msg-body">${replyHtml}<div class="msg-text">${bodyHtml}</div>${mediaHtml}${ogPlaceholderHtml}${errHtml}${reactionsHtml}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" data-action="pin" title="İğnele"><i class="fa-solid fa-thumbtack"></i></button>
          <button class="msg-action-btn" data-action="react" title="Tepki Ver"><i class="fa-regular fa-face-smile"></i></button>
          <button class="msg-action-btn" data-action="reply" title="Yanıtla"><i class="fa-solid fa-reply"></i></button>
        </div>`;
    } else {
      wrap.innerHTML = `
        <div class="msg-avatar-col">${avatarHtml}</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-author" style="color:${color}" data-userid="${esc(event.sender)}">${esc(name)}</span>
            <span class="msg-time">${time}</span>
          </div>
          ${replyHtml}<div class="msg-text">${bodyHtml}</div>${mediaHtml}${ogPlaceholderHtml}${errHtml}${reactionsHtml}
        </div>
        <div class="msg-actions">
          <button class="msg-action-btn" data-action="pin" title="İğnele"><i class="fa-solid fa-thumbtack"></i></button>
          <button class="msg-action-btn" data-action="react" title="Tepki Ver"><i class="fa-regular fa-face-smile"></i></button>
          <button class="msg-action-btn" data-action="reply" title="Yanıtla"><i class="fa-solid fa-reply"></i></button>
        </div>`;
    }

    if (firstUrl) {
      queueMicrotask(() => hydrateOpenGraphCard(wrap, firstUrl));
    }

    wrap.querySelector('.msg-reply-preview')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = event.replyTo;
      if (!targetId) return;
      const targetEl = msgsInner.querySelector(`[data-event-id="${targetId}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.classList.add('mention-highlight');
        setTimeout(() => targetEl.classList.remove('mention-highlight'), 1800);
      }
    });

    wrap.querySelectorAll('[data-userid]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const member = memberMap.find(m => m.userId === btn.dataset.userid);
        if (member) {
          import('./ProfilePopup.js').then(m => m.showProfile(member, btn));
        }
      });
    });

    wrap.querySelectorAll('.reaction-pill').forEach(pill => {
      pill.addEventListener('click', async e => {
        e.stopPropagation();
        try {
          await sendReaction(currentRoomId, event.eventId, pill.dataset.emoji);
        } catch (err) {
          toastError(err.message);
        }
      });
    });

    wrap.querySelector('[data-action="pin"]')?.addEventListener('click', () => {
      pinEvent(currentRoomId, event);
      toastSuccess('Mesaj iğnelendi!');
    });

    wrap.querySelector('[data-action="reply"]')?.addEventListener('click', () => {
      startReply(event);
    });

    wrap.querySelector('[data-action="react"]')?.addEventListener('click', e => {
      e.stopPropagation();
      showReactionPicker(event.eventId, e.currentTarget);
    });
    hydrateMediaIn(wrap);

    return wrap;
  }

  function renderAttachment(event) {
    if (!event.url || !event.msgtype) return '';
    const mediaId = `m_${event.eventId}`;
    const filename = event.body || 'file';
    const lowerName = filename.toLowerCase();

    const isImage = event.msgtype === 'm.image' ||
                    lowerName.endsWith('.png') || lowerName.endsWith('.jpg') ||
                    lowerName.endsWith('.jpeg') || lowerName.endsWith('.gif') ||
                    lowerName.endsWith('.svg') || lowerName.endsWith('.ico') ||
                    lowerName.endsWith('.webp');
    const isPdf = lowerName.endsWith('.pdf');

    if (isImage) {
      queueMicrotask(() => hydrateAttachment(event.url, mediaId, 'image'));
      return `<div class="msg-attachment"><img data-media-img="${mediaId}" alt="${esc(filename)}" style="cursor:pointer; -webkit-user-drag:none; user-select:none; max-width:min(420px, 100%); border-radius:12px;"/></div>`;
    }

    if (event.msgtype === 'm.audio') {
      queueMicrotask(() => hydrateAttachment(event.url, mediaId, 'audio'));
      return `
        <div class="msg-audio-card" style="background:var(--bg3); border:1px solid var(--border-hi); border-radius:12px; padding:10px 12px; max-width:360px; margin-top:6px;">
          <div style="font-size:13px; font-weight:700; color:#ffffff; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            <i class="fa-solid fa-music text-warning me-2"></i>${esc(filename)}
          </div>
          <audio data-media-audio="${mediaId}" controls style="width:100%; height:36px; border-radius:8px; outline:none;"></audio>
        </div>`;
    }

    if (event.msgtype === 'm.video') {
      queueMicrotask(() => hydrateAttachment(event.url, mediaId, 'video'));
      return `
        <div class="msg-video-card" style="margin-top:6px; max-width:480px;">
          <video data-media-video="${mediaId}" controls playsinline webkit-playsinline style="width:100%; max-height:300px; border-radius:12px; background:#000000; border:1px solid var(--border-hi);"></video>
        </div>`;
    }

    if (isPdf) {
      queueMicrotask(() => hydrateAttachment(event.url, mediaId, 'file'));
      return `
        <div class="msg-pdf-card" style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--bg3); border:1px solid var(--border-hi); border-radius:12px; max-width:340px; margin-top:6px;">
          <div style="font-size:30px; color:var(--red); flex-shrink:0;"><i class="fa-solid fa-file-pdf"></i></div>
          <div style="flex:1; overflow:hidden;">
            <div style="font-size:13.5px; font-weight:700; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(filename)}</div>
            <div style="font-size:11px; color:var(--text-muted);">PDF Belgesi</div>
          </div>
          <a data-media-file="${mediaId}" href="#" class="btn-file-download" download="${escAttr(filename)}" title="İndir">
            <i class="fa-solid fa-download"></i>
          </a>
        </div>`;
    }

    queueMicrotask(() => hydrateAttachment(event.url, mediaId, 'file'));
    return `
      <div class="msg-file-card" style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--bg3); border:1px solid var(--border-hi); border-radius:12px; max-width:340px; margin-top:6px;">
        <div style="font-size:24px; color:var(--yellow); flex-shrink:0;"><i class="fa-solid fa-paperclip"></i></div>
        <div style="flex:1; overflow:hidden;">
          <div style="font-size:13.5px; font-weight:700; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(filename)}</div>
          <div style="font-size:11px; color:var(--text-muted);">Dosya Ek</div>
        </div>
        <a data-media-file="${mediaId}" href="#" class="btn-file-download" download="${escAttr(filename)}" title="İndir">
          <i class="fa-solid fa-download"></i>
        </a>
      </div>`;
  }

  async function hydrateAttachment(sourceUrl, mediaId, mediaType) {
    const mxc = sourceUrl?.startsWith('mxc://') ? sourceUrl : null;
    const resolved = mxc
      ? await getMxcObjectUrl(mxc, mediaType === 'image' ? 960 : null, mediaType === 'image' ? 720 : null, 'scale')
      : sourceUrl;
    if (!resolved) return;

    if (mediaType === 'image') {
      const img = msgsInner.querySelector(`[data-media-img="${mediaId}"]`);
      if (img) {
        img.src = resolved;
        img.addEventListener('contextmenu', e => e.preventDefault());
        img.addEventListener('dragstart', e => e.preventDefault());
        img.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openImageViewerModal(resolved, img.alt || 'Resim');
        });
      }
      return;
    }

    if (mediaType === 'audio') {
      const audio = msgsInner.querySelector(`[data-media-audio="${mediaId}"]`);
      if (audio) audio.src = resolved;
      return;
    }

    if (mediaType === 'video') {
      const video = msgsInner.querySelector(`[data-media-video="${mediaId}"]`);
      if (video) video.src = resolved;
      return;
    }

    const fileLink = msgsInner.querySelector(`[data-media-file="${mediaId}"]`);
    if (fileLink) {
      fileLink.href = resolved;
    }
  }

  function scrollToBottom() {
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
  }

  async function hydrateOpenGraphCard(wrap, url) {
    const ogEl = wrap.querySelector(`[data-og-url="${escAttr(url)}"]`);
    if (!ogEl) return;
    const og = await fetchOpenGraph(url);
    if (!og) return;

    const imageHtml = og.image ? `<img src="${escAttr(og.image)}" style="width:100%; max-height:160px; object-fit:cover; border-radius:10px 10px 0 0;" />` : '';

    ogEl.innerHTML = `
      <a href="${escAttr(og.url)}" target="_blank" rel="noopener" style="text-decoration:none; color:inherit; display:block; background:var(--bg3); border:1px solid var(--border-hi); border-radius:12px; overflow:hidden; margin-top:8px; max-width:380px; transition:border-color 0.15s ease;">
        ${imageHtml}
        <div style="padding:10px 12px;">
          <div style="font-size:11px; font-weight:700; color:var(--yellow); text-transform:uppercase; margin-bottom:2px;">${esc(og.publisher)}</div>
          <div style="font-size:13.5px; font-weight:700; color:#ffffff; margin-bottom:4px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(og.title)}</div>
          ${og.description ? `<div style="font-size:12px; color:var(--text-muted); line-height:1.4; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(og.description)}</div>` : ''}
        </div>
      </a>
    `;
  }

  let replyingTo = null;

  function startReply(event) {
    if (!event?.eventId || event.eventId.startsWith('~')) {
      toastError('Mesaj henüz gönderilmedi.');
      return;
    }
    const member = memberMap.find(m => m.userId === event.sender);
    const name = member?.displayName ?? event.sender.split(':')[0].slice(1);
    replyingTo = { eventId: event.eventId, senderName: name, body: (event.body ?? '').replace(/^(>.*\n?)+\n?/, '').trim().slice(0, 100) };

    let bar = inputWrap.querySelector('.reply-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'reply-bar';
      bar.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:var(--bg3); border-left:3px solid var(--yellow); border-radius:8px 8px 0 0; margin-bottom:4px; border:1px solid var(--border-hi); border-bottom:none;';
      inputWrap.insertBefore(bar, inputWrap.querySelector('.chat-input-box'));
    }
    bar.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
        <i class="fa-solid fa-reply text-warning"></i>
        <div style="font-size:12.5px; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          <strong>${esc(name)}</strong> kullanıcısına yanıt veriliyor: <em>"${esc(replyingTo.body)}"</em>
        </div>
      </div>
      <button class="reply-bar-cancel" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:2px 6px;">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    bar.querySelector('.reply-bar-cancel').addEventListener('click', cancelReply);
    msgInput.focus();
  }

  function cancelReply() {
    replyingTo = null;
    inputWrap.querySelector('.reply-bar')?.remove();
  }

  const ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  ctxMenu.style.display = 'none';
  document.body.appendChild(ctxMenu);

  function showCtxMenu(x, y, items) {
    ctxMenu.innerHTML = '';
    items.forEach(({ label, action, danger }) => {
      const item = document.createElement('div');
      item.className = `ctx-item${danger ? ' danger' : ''}`;
      item.textContent = label;
      item.addEventListener('click', () => { action(); hideCtxMenu(); });
      ctxMenu.appendChild(item);
    });
    ctxMenu.style.display = '';
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = 160;
    ctxMenu.style.left = (x + pw > vw ? vw - pw - 8 : x) + 'px';
    ctxMenu.style.top = (y + ctxMenu.offsetHeight > vh ? y - ctxMenu.offsetHeight : y) + 'px';
  }

  function hideCtxMenu() { ctxMenu.style.display = 'none'; }
  document.addEventListener('click', hideCtxMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCtxMenu(); });

  msgsInner.addEventListener('contextmenu', e => {
    const msgGroup = e.target.closest('.msg-group');
    e.preventDefault();
    if (msgGroup) {
      const eventId = msgGroup.dataset.eventId;
      const events = getTimeline(currentRoomId);
      const event = events.find(ev => ev.eventId === eventId);
      showCtxMenu(e.clientX, e.clientY, [
        { label: '↩ Reply', action: () => event && startReply(event) },
        {
          label: '😊 React', action: () => {
            if (!event) return;
            hideCtxMenu();
            const fakeAnchor = { getBoundingClientRect: () => ({ top: e.clientY, bottom: e.clientY, left: e.clientX }) };
            showReactionPicker(event.eventId, fakeAnchor);
          }
        },
        { label: '📋 Copy text', action: () => navigator.clipboard?.writeText(event?.body ?? '') },
        {
          label: '🔗 Copy MXC URL', action: () => {
            const mxc = event?.url?.startsWith('mxc://') ? event.url : '';
            if (mxc) navigator.clipboard?.writeText(mxc);
            else toastError('No MXC URL on this message');
          }
        },
        {
          label: '🗑 Delete', danger: true, action: async () => {
            if (!event) return;
            const myId = getState().accounts[getState().activeAccountIndex]?.userId;
            if (event.sender !== myId) { toastError('You can only delete your own messages.'); return; }
            if (!confirm('Delete this message?')) return;
            try { await sendRedaction(currentRoomId, event.eventId); }
            catch (err) { toastError(err.message ?? 'Failed to delete message'); }
          }
        },
      ]);
    } else {
      showCtxMenu(e.clientX, e.clientY, [
        { label: '📋 Copy', action: () => { const sel = window.getSelection(); if (sel?.toString()) navigator.clipboard?.writeText(sel.toString()); } },
      ]);
    }
  });

  msgsContainer.addEventListener('scroll', () => {
    isAtBottom = msgsContainer.scrollHeight - msgsContainer.scrollTop - msgsContainer.clientHeight < 60;
    if (msgsContainer.scrollTop < 80 && currentRoomId) loadMoreMessages(currentRoomId);
  });

  function getMentionQuery() {
    const val = msgInput.value;
    const pos = msgInput.selectionStart;
    const before = val.slice(0, pos);
    const match = before.match(/@([\w.:\-]*)$/);
    return match ? match[1] : null;
  }

  function showMentionPopup(query) {
    const matches = memberMap.filter(m =>
      m.displayName.toLowerCase().includes(query.toLowerCase()) ||
      m.userId.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 6);

    if (matches.length === 0) { hideMentionPopup(); return; }

    mentionPopup.style.display = '';
    mentionFocus = 0;
    mentionPopup.innerHTML = '';
    matches.forEach((m, i) => {
      const item = document.createElement('div');
      item.className = `mention-item${i === 0 ? ' focused' : ''}`;
      const avatarHtml = m.avatarUrl
        ? `<div class="mention-avatar"><img data-media-src="${escAttr(m.avatarUrl)}" data-media-w="26" data-media-h="26" alt=""/></div>`
        : `<div class="mention-avatar" style="background:${m.color}">${getInitials(m.displayName)}</div>`;
      item.innerHTML = `${avatarHtml}<span class="mention-name">${esc(m.displayName)}</span><span class="mention-id">${esc(m.userId)}</span>`;
      item.addEventListener('mousedown', e => { e.preventDefault(); insertMention(m); });
      item.addEventListener('mouseenter', () => setMentionFocus(i));
      mentionPopup.appendChild(item);
    });
    mentionPopup._matches = matches;
    hydrateMediaIn(mentionPopup);
  }

  function hideMentionPopup() {
    mentionPopup.style.display = 'none';
    mentionPopup._matches = [];
  }

  function setMentionFocus(i) {
    mentionFocus = i;
    mentionPopup.querySelectorAll('.mention-item').forEach((el, j) =>
      el.classList.toggle('focused', j === i));
  }

  function insertMention(member) {
    const val = msgInput.value;
    const pos = msgInput.selectionStart;
    const before = val.slice(0, pos);
    const after = val.slice(pos);
    const replaced = before.replace(/@[\w.:\-]*$/, `${member.userId} `);
    msgInput.value = replaced + after;
    msgInput.focus();
    hideMentionPopup();
  }

  let reactTargetEventId = null;
  const reactPopup = document.createElement('div');
  reactPopup.className = 'react-popup';
  reactPopup.style.display = 'none';
  const reactPicker = document.createElement('emoji-picker');
  reactPicker.emojiVersion = 17;
  reactPicker.dataSource = 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/emojibase/data.json';
  reactPopup.appendChild(reactPicker);
  document.body.appendChild(reactPopup);

  function showReactionPicker(eventId, anchorEl) {
    reactTargetEventId = eventId;
    reactPopup.style.display = '';
    const rect = anchorEl.getBoundingClientRect();
    const pw = 340, ph = 340;
    let top = rect.top - ph - 6;
    let left = rect.left;
    if (top < 8) top = rect.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    reactPopup.style.top = top + window.scrollY + 'px';
    reactPopup.style.left = left + window.scrollX + 'px';
  }

  function hideReactionPicker() {
    reactPopup.style.display = 'none';
    reactTargetEventId = null;
  }

  reactPicker.addEventListener('emoji-click', async e => {
    if (!reactTargetEventId || !currentRoomId) return;
    const emoji = e.detail.unicode;
    const savedRoomId = currentRoomId;
    const savedEventId = reactTargetEventId;
    hideReactionPicker();
    try {
      await sendReaction(savedRoomId, savedEventId, emoji);
      renderMessages(savedRoomId);
    } catch (err) {
      toastError(err.message);
    }
  });

  document.addEventListener('click', e => {
    if (!reactPopup.contains(e.target)) hideReactionPicker();
  });

  const picker = document.createElement('emoji-picker');
  picker.emojiVersion = 17;
  picker.dataSource = 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/emojibase/data.json';
  emojiPopup.appendChild(picker);

  emojiBtn.addEventListener('click', e => {
    e.stopPropagation();
    emojiPopup.style.display = emojiPopup.style.display === 'none' ? '' : 'none';
  });

  picker.addEventListener('emoji-click', e => {
    const emoji = e.detail.unicode;
    const start = msgInput.selectionStart;
    const end = msgInput.selectionEnd;
    msgInput.value = msgInput.value.slice(0, start) + emoji + msgInput.value.slice(end);
    msgInput.selectionStart = msgInput.selectionEnd = start + emoji.length;
    msgInput.focus();
    emojiPopup.style.display = 'none';
  });

  document.addEventListener('click', e => {
    if (!emojiPopup.contains(e.target) && e.target !== emojiBtn) {
      emojiPopup.style.display = 'none';
    }
  });

  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0] ?? null;
    fileInput.value = '';
    if (!file || !currentRoomId) return;
    sendBtn.disabled = true;
    try {
      await sendFile(currentRoomId, file);
      markRoomRead(currentRoomId);
    } catch (err) {
      toastError(err.message ?? 'Failed to send file');
    } finally {
      sendBtn.disabled = false;
    }
  });

  msgInput.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 150) + 'px';

    const query = getMentionQuery();
    if (query !== null) showMentionPopup(query);
    else hideMentionPopup();

    if (currentRoomId) {
      sendTyping(currentRoomId, true);
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => sendTyping(currentRoomId, false), 3500);
    }
  });

  msgInput.addEventListener('keydown', e => {
    if (mentionPopup.style.display !== 'none') {
      const matches = mentionPopup._matches ?? [];
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionFocus(Math.min(mentionFocus + 1, matches.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionFocus(Math.max(mentionFocus - 1, 0)); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (matches[mentionFocus]) { e.preventDefault(); insertMention(matches[mentionFocus]); return; }
      }
      if (e.key === 'Escape') { hideMentionPopup(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });

  sendBtn.addEventListener('click', doSend);

  async function doSend() {
    const text = msgInput.value.trim();
    if (!text || !currentRoomId) return;
    const replyEventId = replyingTo?.eventId ?? null;
    msgInput.value = '';
    msgInput.style.height = 'auto';
    sendBtn.disabled = true;
    hideMentionPopup();
    emojiPopup.style.display = 'none';
    cancelReply();
    playOutgoingSound();
    try {
      await sendMessage(currentRoomId, text, replyEventId);
      markRoomRead(currentRoomId);
    } catch (err) {
      toastError(err.message);
    } finally {
      sendBtn.disabled = false;
      msgInput.focus();
    }
  }

  let currentViewingUserId = undefined;

  on('state', s => {
    if (s.activeRoomId && s.activeRoomId !== currentRoomId) {
      currentViewingUserId = undefined;
      loadRoom(s.activeRoomId);
    } else if (!s.activeRoomId) {
      noRoom.style.display = 'flex';
      chatInner.style.display = 'none';
      currentRoomId = null;

      const targetUser = s.viewingUserId || null;
      if (noRoom.childElementCount === 0 || currentViewingUserId !== targetUser) {
        currentViewingUserId = targetUser;
        const newHomeHub = renderHomeHub(s.viewingUserId, s.viewingUserName, s.viewingUserAvatar);
        noRoom.innerHTML = '';
        noRoom.appendChild(newHomeHub);
      }
    }
  });

  msgsContainer.addEventListener('scroll', () => {
    isAtBottom = msgsContainer.scrollHeight - msgsContainer.scrollTop - msgsContainer.clientHeight < 80;

    if (msgsContainer.scrollTop <= 60 && currentRoomId && !isLoadingOlder) {
      isLoadingOlder = true;
      const oldScrollHeight = msgsContainer.scrollHeight;

      visibleMessageLimit += 25;
      renderMessages(currentRoomId, visibleMessageLimit);

      const newScrollHeight = msgsContainer.scrollHeight;
      msgsContainer.scrollTop = newScrollHeight - oldScrollHeight;

      loadMoreMessages(currentRoomId).finally(() => {
        setTimeout(() => { isLoadingOlder = false; }, 300);
      });
    }
  });

  let renderFrameTimer = null;
  function scheduleMessagesRender(roomId) {
    if (!roomId || roomId !== currentRoomId) return;
    if (renderFrameTimer) return;
    renderFrameTimer = requestAnimationFrame(() => {
      renderFrameTimer = null;
      if (currentRoomId === roomId) {
        memberMap = getRoomMemberMap(currentRoomId);
        renderMessages(currentRoomId, visibleMessageLimit);
        if (isAtBottom) scrollToBottom();
      }
    });
  }

  on('timeline-event', ({ event, room }) => {
    if (room.roomId !== currentRoomId) return;
    const type = event.getType();
    if (type !== 'm.room.message' && type !== 'm.reaction' && type !== 'm.room.redaction' && type !== 'm.room.encrypted') return;
    if (type === 'm.room.message') markRoomRead(currentRoomId);
    scheduleMessagesRender(currentRoomId);
  });

  on('event-decrypted', () => {
    if (currentRoomId) {
      scheduleMessagesRender(currentRoomId);
    }
  });

  on('typing-updated', ({ roomId, typers }) => {
    if (roomId !== currentRoomId) return;
    const state = getState();
    const others = typers.filter(u => u !== state.accounts[state.activeAccountIndex]?.userId);
    const ind = el.querySelector('#typing-indicator');
    if (others.length === 0) ind.textContent = '';
    else if (others.length === 1) {
      const m = memberMap.find(x => x.userId === others[0]);
      ind.textContent = `✎ ${m?.displayName ?? others[0].split(':')[0].slice(1)} is typing…`;
    } else ind.textContent = `✎ ${others.length} people are typing…`;
  });

  on('timeline-scrollback', ({ roomId }) => {
    if (roomId === currentRoomId) renderMessages(roomId);
  });

  return el;
}

function esc(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

function escapeRegExp(s) {
  return (s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
