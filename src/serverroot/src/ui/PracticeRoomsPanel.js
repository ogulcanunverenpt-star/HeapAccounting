import { getState, on } from '../store/state.js';
import { createPracticeRoom, getPracticeEvents, listPracticeRooms } from '../client/practiceRooms.js';

const translations = {
  tr: {
    title: 'Özel Matrix alıştırma odası',
    intro: 'İstersen kayıtları seçtiğin özel odaya gönder. Oyuncu ve görevli cevapları, süreyi ve denemeleri görür.',
    notice: 'Kimlikleri ve oda üyeliği Matrix meta verisidir. Oda oluşturucusu yöneticidir; cihazları doğrula ve gerçek kişisel veya finansal veri girme. Cihaz güveni ve kurtarma henüz doğrulanmadı.',
    supervisor: 'Görevlinin Matrix kimliği', placeholder: '@gorevli:matrix.org',
    create: 'Özel oda oluştur ve davet et', creating: 'Oda oluşturuluyor…',
    created: 'Oda oluşturuldu. Görevli Matrix sohbetinden daveti kabul etmeli; eşitleme bekleniyor.',
    select: 'Kayıt odası', local: 'Yerel alıştırma (Matrix’e gönderme)', rolePlayer: 'oyuncu', roleSupervisor: 'görevli',
    status: 'Oda durumu', ready: 'Hazır', 'waiting-for-supervisor': 'İki katılımcının da daveti kabul etmesi bekleniyor',
    'not-practice-room': 'Oda kimliği doğrulanamadı', 'invalid-participants': 'Katılımcılar doğrulanamadı',
    'not-joined': 'Odaya katılmadınız', 'crypto-unavailable': 'Şifreleme hazır değil',
    'sync-unavailable': 'Matrix eşitlemesi hazır değil', 'encryption-unavailable': 'Oda şifrelemesi doğrulanamadı',
    'privacy-changed': 'Oda gizlilik veya yetki ayarları değişti', 'unexpected-member': 'Beklenmeyen katılımcı veya davet var',
    'not-connected': 'Matrix bağlantısı yok', 'room-id-missing': 'Sunucu oda kimliği döndürmedi', 'not-player': 'Bu odada yalnızca oyuncu alıştırma kaydedebilir',
    'invalid-event': 'Geçersiz alıştırma kaydı', failed: 'Matrix işlemi başarısız', loading: 'Geçmiş yükleniyor…',
    history: 'Yüklenmiş etkinlikler', historyHint: 'Yalnızca eşitlenmiş ve çözülebilmiş kayıtlar gösterilir; eski kayıtlar için geçmişi yükleyin.',
    older: 'Daha eski kayıtları yükle', empty: 'Gösterilecek kayıt yok.', started: 'Görev başladı', abandoned: 'Alıştırma bırakıldı',
    submitted: 'Cevap gönderildi', correct: 'doğru', incorrect: 'yanlış', unbalanced: 'dengesiz',
    duration: 'Süre', mistakes: 'Yanlış', presence: 'Çevrimiçi durumu (Matrix bildirimi)',
    online: 'çevrimiçi', unavailable: 'uzakta', offline: 'çevrimdışı', unknown: 'bilinmiyor',
    localNote: 'Yerel modda kayıt gönderilmez. Matrix modunda kayıtlar katılımcılarla paylaşılır; sonuç ve süre istemci beyanıdır, sıralama değildir.',
  },
  en: {
    title: 'Private Matrix practice room',
    intro: 'Optionally send practice records to a selected private room. The player and supervisor can see answers, time and attempts.',
    notice: 'Identities and membership are Matrix metadata. The creator is a room administrator; verify devices and do not enter real personal or financial data. Device trust and recovery have not been verified.',
    supervisor: 'Supervisor Matrix ID', placeholder: '@supervisor:matrix.org',
    create: 'Create private room and invite', creating: 'Creating room…',
    created: 'Room created. The supervisor must accept the invitation in Matrix chat; waiting for sync.',
    select: 'Recording room', local: 'Local practice (do not send to Matrix)', rolePlayer: 'player', roleSupervisor: 'supervisor',
    status: 'Room status', ready: 'Ready', 'waiting-for-supervisor': 'Waiting for both participants to join',
    'not-practice-room': 'Room identity could not be verified', 'invalid-participants': 'Participants could not be verified',
    'not-joined': 'You have not joined this room', 'crypto-unavailable': 'Encryption is not ready',
    'sync-unavailable': 'Matrix sync is not ready', 'encryption-unavailable': 'Room encryption could not be verified',
    'privacy-changed': 'Room privacy or permissions changed', 'unexpected-member': 'Unexpected participant or invitation',
    'not-connected': 'Matrix is not connected', 'room-id-missing': 'Server did not return a room ID', 'not-player': 'Only the player can record practice in this room',
    'invalid-event': 'Invalid practice record', failed: 'Matrix operation failed', loading: 'Loading history…',
    history: 'Loaded activity', historyHint: 'Only synced and decrypted records are shown; load older history to see more.',
    older: 'Load older records', empty: 'No records to display.', started: 'Challenge started', abandoned: 'Practice abandoned',
    submitted: 'Answer submitted', correct: 'correct', incorrect: 'incorrect', unbalanced: 'unbalanced',
    duration: 'Time', mistakes: 'Mistakes', presence: 'Presence (reported by Matrix)',
    online: 'online', unavailable: 'away', offline: 'offline', unknown: 'unknown',
    localNote: 'Local mode sends no records. Matrix mode shares records with participants; results and times are client-reported, not rankings.',
  },
};

function readableTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function renderPracticeRoomsPanel(lang) {
  const text = translations[lang];
  const element = document.createElement('section');
  element.className = 'game-card practice-panel';
  element.innerHTML = `
    <h2>${text.title}</h2><p class="game-hint">${text.intro}</p>
    <p class="game-hint">${text.notice}</p>
    <label class="practice-label">${text.supervisor}<input class="practice-supervisor" placeholder="${text.placeholder}" autocomplete="off"></label>
    <button type="button" class="game-chat practice-create">${text.create}</button>
    <p class="practice-message" role="status" aria-live="polite"></p>
    <label class="practice-label">${text.select}<select class="practice-select"><option value="">${text.local}</option></select></label>
    <p class="practice-status" aria-live="polite"></p>
    <p class="practice-presence"></p>
    <h3>${text.history}</h3><p class="game-hint">${text.historyHint}</p>
    <ul class="practice-events"></ul>
    <button type="button" class="game-chat practice-older" hidden>${text.older}</button>
    <p class="game-hint">${text.localNote}</p>`;
  const select = element.querySelector('.practice-select');
  const create = element.querySelector('.practice-create');
  const message = element.querySelector('.practice-message');
  const statusEl = element.querySelector('.practice-status');
  const presence = element.querySelector('.practice-presence');
  const list = element.querySelector('.practice-events');
  const older = element.querySelector('.practice-older');
  let busy = false;
  let destroyed = false;
  let visibleEvents = 30;

  function showError(err) {
    const reason = err instanceof Error ? err.message : String(err);
    message.textContent = `${text.failed}: ${text[reason] || reason}`;
    message.classList.add('is-error');
  }

  function refresh() {
    if (destroyed) return;
    const client = getState().client;
    const roomId = select.value;
    const rooms = listPracticeRooms(client);
    const room = rooms.find(item => item.roomId === roomId);
    select.replaceChildren(new Option(text.local, ''));
    for (const entry of rooms) {
      const role = entry.player === client.getUserId() ? text.rolePlayer : text.roleSupervisor;
      select.add(new Option(`${entry.roomId} (${role})`, entry.roomId));
    }
    if (roomId && !room) select.add(new Option(`${roomId} (${text['not-practice-room']})`, roomId));
    select.value = roomId;
    list.replaceChildren();
    older.hidden = !room;
    presence.textContent = '';
    statusEl.textContent = room ? `${text.status}: ${text[room.status] || room.status}` : roomId ? `${text.status}: ${text['not-practice-room']}` : '';
    if (!room || room.status !== 'ready') return;
    const participants = [room.player, room.supervisor].map(id => {
      const state = client.getUser(id)?.presence;
      return `${id}: ${text[state] || text.unknown}`;
    });
    presence.textContent = `${text.presence}: ${participants.join(' · ')}`;
    const events = getPracticeEvents(client, room.roomId);
    if (!events.length) {
      const li = document.createElement('li');
      li.textContent = text.empty;
      list.appendChild(li);
    }
    for (const event of events.slice(-visibleEvents).reverse()) {
      const li = document.createElement('li');
      const date = Number.isFinite(event.timestamp) && Math.abs(event.timestamp) <= 8640000000000000 ? new Date(event.timestamp).toLocaleString(lang) : '';
      let detail = event.action === 'started' ? text.started : event.action === 'abandoned' ? text.abandoned : text.submitted;
      const questionTitle = event.question?.[lang]?.title;
      if (event.action === 'started' && typeof questionTitle === 'string') detail += ` · ${questionTitle.slice(0, 100)}`;
      const questionStory = event.question?.[lang]?.story;
      const questionObjective = event.question?.[lang]?.objective;
      if (event.action === 'started' && typeof questionStory === 'string') detail += ` · ${questionStory.slice(0, 500)}`;
      if (event.action === 'started' && typeof questionObjective === 'string') detail += ` · ${questionObjective.slice(0, 500)}`;
      if (event.action === 'submitted') {
        const time = Number.isSafeInteger(event.elapsedMs) && event.elapsedMs >= 0 ? readableTime(event.elapsedMs) : '?';
        const mistakes = Number.isSafeInteger(event.mistakes) && event.mistakes >= 0 ? event.mistakes : '?';
        const result = ['correct', 'incorrect', 'unbalanced'].includes(event.result) ? text[event.result] : '?';
        detail += ` · ${result} · ${text.duration}: ${time} · ${text.mistakes}: ${mistakes}`;
        if (Array.isArray(event.rows)) {
          const answers = event.rows.slice(0, 3).map(row => `${String(row?.accountCode ?? '').slice(0, 20)} ${String(row?.side ?? '').slice(0, 20)} ${String(row?.amount ?? '').slice(0, 20)}`).join(' | ');
          detail += ` · ${answers}`;
        }
      }
      li.textContent = `${date} — ${detail}`;
      list.appendChild(li);
    }
  }

  create.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    create.disabled = true;
    message.classList.remove('is-error');
    message.textContent = text.creating;
    try {
      await createPracticeRoom(getState().client, element.querySelector('.practice-supervisor').value.trim());
      message.textContent = text.created;
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      busy = false;
      create.disabled = false;
    }
  });
  select.addEventListener('change', () => { visibleEvents = 30; refresh(); });
  older.addEventListener('click', async () => {
    const client = getState().client;
    const room = client?.getRoom(select.value);
    if (!room || practiceStatus() !== 'ready') return;
    older.disabled = true;
    message.textContent = text.loading;
    try {
      await client.scrollback(room, 50);
      message.textContent = '';
      if (select.value === room.roomId) visibleEvents += 50;
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      older.disabled = false;
    }
  });
  function practiceStatus() {
    return listPracticeRooms(getState().client).find(room => room.roomId === select.value)?.status;
  }
  const unsubscribe = [
    on('state', refresh), on('rooms-updated', refresh), on('timeline-event', refresh), on('event-decrypted', refresh), on('presence-updated', refresh),
  ];
  refresh();

  return {
    element,
    selection: () => select.value ? { client: getState().client, roomId: select.value } : null,
    setLocked: locked => { select.disabled = locked; },
    refresh,
    destroy: () => { destroyed = true; unsubscribe.forEach(unsub => unsub()); },
  };
}
