export const PRACTICE_ROOM_EVENT = 'io.heapaccounting.practice.room';
export const PRACTICE_DATA = 'io.heapaccounting.practice';
const USER_ID = /^@[^:\s]+:[^\s]+$/;
const knownRooms = new WeakMap();

function remember(client, id) {
  if (!knownRooms.has(client)) knownRooms.set(client, new Set());
  knownRooms.get(client).add(id);
}

function stateEvent(room, type) {
  return room?.currentState?.getStateEvents(type, '') ?? null;
}

export function isPracticeRoom(room) {
  return stateEvent(room, PRACTICE_ROOM_EVENT)?.getContent()?.version === 1;
}

export function isProtectedPracticeRoom(client, roomId) {
  if (!client || !roomId) return false;
  if (isPracticeRoom(client.getRoom(roomId))) remember(client, roomId);
  return knownRooms.get(client)?.has(roomId) ?? false;
}

export function practiceRoomStatus(client, room) {
  if (!client || !room || !isPracticeRoom(room)) return 'not-practice-room';
  const marker = stateEvent(room, PRACTICE_ROOM_EVENT);
  const { player, supervisor } = marker.getContent();
  const me = client.getUserId();
  if (!USER_ID.test(player ?? '') || !USER_ID.test(supervisor ?? '') || player.length > 255 || supervisor.length > 255 || player === supervisor ||
      marker.getSender() !== player || ![player, supervisor].includes(me)) return 'invalid-participants';
  if (room.getMyMembership() !== 'join') return 'not-joined';
  if (!client.getCrypto()) return 'crypto-unavailable';
  if (!['PREPARED', 'SYNCING'].includes(client.getSyncState())) return 'sync-unavailable';
  if (stateEvent(room, 'm.room.encryption')?.getContent()?.algorithm !== 'm.megolm.v1.aes-sha2' ||
      !client.isRoomEncrypted(room.roomId)) return 'encryption-unavailable';
  if (stateEvent(room, 'm.room.join_rules')?.getContent()?.join_rule !== 'invite' ||
      stateEvent(room, 'm.room.guest_access')?.getContent()?.guest_access !== 'forbidden' ||
      stateEvent(room, 'm.room.history_visibility')?.getContent()?.history_visibility !== 'joined') return 'privacy-changed';
  const powers = stateEvent(room, 'm.room.power_levels')?.getContent();
  if (!powers || (powers.invite ?? 0) < 100 || (powers.state_default ?? 50) < 100 ||
      (powers.users?.[player] ?? powers.users_default ?? 0) < 100 ||
      (powers.users?.[supervisor] ?? powers.users_default ?? 0) >= 100) return 'privacy-changed';
  for (const type of [PRACTICE_ROOM_EVENT, 'm.room.encryption', 'm.room.join_rules', 'm.room.guest_access', 'm.room.history_visibility', 'm.room.power_levels']) {
    if ((powers.events?.[type] ?? powers.state_default ?? 50) < 100) return 'privacy-changed';
  }
  const members = room.getMembers().filter(member => ['join', 'invite'].includes(member.membership));
  if (members.some(member => ![player, supervisor].includes(member.userId))) return 'unexpected-member';
  if (![player, supervisor].every(id => members.some(member => member.userId === id && member.membership === 'join'))) {
    return 'waiting-for-supervisor';
  }
  return 'ready';
}

export async function createPracticeRoom(client, supervisor) {
  if (!client) throw new Error('not-connected');
  if (!client.getCrypto()) throw new Error('crypto-unavailable');
  if (!['PREPARED', 'SYNCING'].includes(client.getSyncState())) throw new Error('sync-unavailable');
  const player = client.getUserId();
  if (!USER_ID.test(player ?? '') || !USER_ID.test(supervisor ?? '') || player.length > 255 || supervisor.length > 255 || player === supervisor) {
    throw new Error('invalid-participants');
  }
  const result = await client.createRoom({
    name: 'HeapAccounting practice',
    visibility: 'private',
    preset: 'private_chat',
    invite: [supervisor],
    power_level_content_override: { invite: 100, state_default: 100 },
    initial_state: [
      { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
      { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'invite' } },
      { type: 'm.room.guest_access', state_key: '', content: { guest_access: 'forbidden' } },
      { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } },
      { type: PRACTICE_ROOM_EVENT, state_key: '', content: { version: 1, player, supervisor } },
    ],
  });
  if (!result?.room_id) throw new Error('room-id-missing');
  remember(client, result.room_id);
  return result.room_id;
}

export function listPracticeRooms(client) {
  if (!client) return [];
  return client.getRooms()
    .filter(room => room.getMyMembership() === 'join' && isProtectedPracticeRoom(client, room.roomId))
    .map(room => ({
      roomId: room.roomId,
      status: practiceRoomStatus(client, room),
      player: stateEvent(room, PRACTICE_ROOM_EVENT)?.getContent()?.player,
      supervisor: stateEvent(room, PRACTICE_ROOM_EVENT)?.getContent()?.supervisor,
    }));
}

export async function sendPracticeEvent(client, roomId, data, transactionId) {
  const room = client?.getRoom(roomId);
  const status = practiceRoomStatus(client, room);
  if (status !== 'ready') throw new Error(status);
  if (stateEvent(room, PRACTICE_ROOM_EVENT).getContent().player !== client.getUserId()) throw new Error('not-player');
  if (!transactionId || !data || data.version !== 1 || data.questionId !== 'cash-sale-v1' ||
      !['started', 'submitted', 'abandoned'].includes(data.action)) throw new Error('invalid-event');
  return client.sendEvent(roomId, 'm.room.message', {
    msgtype: 'm.text',
    body: 'HeapAccounting practice activity',
    [PRACTICE_DATA]: data,
  }, transactionId);
}

export function getPracticeEvents(client, roomId) {
  const room = client?.getRoom(roomId);
  const status = practiceRoomStatus(client, room);
  if (status !== 'ready') throw new Error(status);
  const { player } = stateEvent(room, PRACTICE_ROOM_EVENT).getContent();
  return room.getLiveTimeline().getEvents().flatMap(event => {
    const data = event.getContent()?.[PRACTICE_DATA];
    if (!event.isEncrypted() || event.status !== null || event.getType() !== 'm.room.message' || event.getSender() !== player ||
        data?.version !== 1 || data.questionId !== 'cash-sale-v1' ||
        !['started', 'submitted', 'abandoned'].includes(data.action)) return [];
    return [{ ...data, id: event.getId(), timestamp: event.getTs() }];
  });
}
