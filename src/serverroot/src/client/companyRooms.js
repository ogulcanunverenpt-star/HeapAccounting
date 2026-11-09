export const COMPANY_ROOM_EVENT = 'io.heapaccounting.company';
const knownRooms = new WeakMap();

function rememberRoom(client, roomId) {
  let rooms = knownRooms.get(client);
  if (!rooms) {
    rooms = new Set();
    knownRooms.set(client, rooms);
  }
  rooms.add(roomId);
}

function stateContent(room, type) {
  return room?.currentState?.getStateEvents(type, '')?.getContent() ?? null;
}

export function isCompanyRoom(room) {
  return stateContent(room, COMPANY_ROOM_EVENT)?.version === 1;
}

export function isProtectedCompanyRoom(client, roomId) {
  if (!client || !roomId) return false;
  if (isCompanyRoom(client.getRoom(roomId))) rememberRoom(client, roomId);
  return knownRooms.get(client)?.has(roomId) ?? false;
}

export function companyRoomStatus(client, room) {
  if (!client || !room || !isCompanyRoom(room)) return 'not-company-room';
  if (room.getMyMembership() !== 'join') return 'not-joined';
  if (!client.getCrypto()) return 'crypto-unavailable';
  if (!['PREPARED', 'SYNCING'].includes(client.getSyncState())) return 'sync-unavailable';
  if (stateContent(room, 'm.room.encryption')?.algorithm !== 'm.megolm.v1.aes-sha2' ||
      !client.isRoomEncrypted(room.roomId)) return 'encryption-unavailable';
  if (stateContent(room, 'm.room.join_rules')?.join_rule !== 'invite' ||
      stateContent(room, 'm.room.guest_access')?.guest_access !== 'forbidden' ||
      stateContent(room, 'm.room.history_visibility')?.history_visibility !== 'joined') {
    return 'privacy-changed';
  }
  return 'ready';
}

export async function createCompanyRoom(client) {
  if (!client) throw new Error('not-connected');
  if (!client.getCrypto()) throw new Error('crypto-unavailable');
  if (!['PREPARED', 'SYNCING'].includes(client.getSyncState())) throw new Error('sync-unavailable');

  const result = await client.createRoom({
    name: 'HeapAccounting',
    visibility: 'private',
    preset: 'private_chat',
    initial_state: [
      { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
      { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'invite' } },
      { type: 'm.room.guest_access', state_key: '', content: { guest_access: 'forbidden' } },
      { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } },
      { type: COMPANY_ROOM_EVENT, state_key: '', content: { version: 1 } },
    ],
  });
  if (!result?.room_id) throw new Error('room-id-missing');
  rememberRoom(client, result.room_id);
  return result.room_id;
}

export function listCompanyRooms(client) {
  if (!client) return [];
  return client.getRooms()
    .filter(room => room.getMyMembership() === 'join' && isProtectedCompanyRoom(client, room.roomId))
    .map(room => ({
      roomId: room.roomId,
      status: companyRoomStatus(client, room),
    }));
}
