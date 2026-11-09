import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_ROOM_EVENT, companyRoomStatus, createCompanyRoom, isCompanyRoom, listCompanyRooms } from '../src/client/companyRooms.js';
import { sendFile, sendMessage, updateRoomProfile } from '../src/client/matrix.js';
import { setState } from '../src/store/state.js';

function fixture() {
  const contents = {
    [COMPANY_ROOM_EVENT]: { version: 1 },
    'm.room.encryption': { algorithm: 'm.megolm.v1.aes-sha2' },
    'm.room.join_rules': { join_rule: 'invite' },
    'm.room.guest_access': { guest_access: 'forbidden' },
    'm.room.history_visibility': { history_visibility: 'joined' },
  };
  const room = {
    roomId: '!company:example.test',
    getMyMembership: () => 'join',
    currentState: { getStateEvents: type => contents[type] ? { getContent: () => contents[type] } : null },
  };
  const client = {
    getCrypto: () => ({}),
    getSyncState: () => 'SYNCING',
    isRoomEncrypted: () => true,
    getRoom: () => room,
    getRooms: () => [room],
  };
  return { client, room, contents };
}

test('creates an invite-only encrypted company room with non-sensitive marker', async () => {
  const { client } = fixture();
  let request;
  client.createRoom = async options => { request = options; return { room_id: '!new:example.test' }; };
  assert.equal(await createCompanyRoom(client), '!new:example.test');
  assert.equal(request.visibility, 'private');
  assert.equal(request.preset, 'private_chat');
  const state = Object.fromEntries(request.initial_state.map(event => [event.type, event.content]));
  assert.deepEqual(state[COMPANY_ROOM_EVENT], { version: 1 });
  assert.equal(state['m.room.encryption'].algorithm, 'm.megolm.v1.aes-sha2');
  assert.equal(state['m.room.join_rules'].join_rule, 'invite');
  assert.equal(state['m.room.guest_access'].guest_access, 'forbidden');
  assert.equal(state['m.room.history_visibility'].history_visibility, 'joined');
});

test('creation fails closed when crypto or sync is unavailable', async () => {
  const { client } = fixture();
  let called = false;
  client.createRoom = () => { called = true; };
  await assert.rejects(createCompanyRoom(null), /not-connected/);
  client.getCrypto = () => undefined;
  await assert.rejects(createCompanyRoom(client), /crypto-unavailable/);
  client.getCrypto = () => ({});
  client.getSyncState = () => 'ERROR';
  await assert.rejects(createCompanyRoom(client), /sync-unavailable/);
  assert.equal(called, false);
});

test('room checks fail closed when security settings or session change', () => {
  const { client, room, contents } = fixture();
  assert.equal(companyRoomStatus(client, room), 'ready');
  assert.deepEqual(listCompanyRooms(client), [{ roomId: room.roomId, status: 'ready' }]);
  client.getCrypto = () => undefined;
  assert.equal(companyRoomStatus(client, room), 'crypto-unavailable');
  client.getCrypto = () => ({});
  client.getSyncState = () => 'ERROR';
  assert.equal(companyRoomStatus(client, room), 'sync-unavailable');
  client.getSyncState = () => 'SYNCING';
  client.isRoomEncrypted = () => false;
  assert.equal(companyRoomStatus(client, room), 'encryption-unavailable');
  client.isRoomEncrypted = () => true;
  contents['m.room.encryption'].algorithm = 'unknown';
  assert.equal(companyRoomStatus(client, room), 'encryption-unavailable');
  contents['m.room.encryption'].algorithm = 'm.megolm.v1.aes-sha2';
  for (const [type, field, invalid, valid] of [
    ['m.room.join_rules', 'join_rule', 'public', 'invite'],
    ['m.room.guest_access', 'guest_access', 'can_join', 'forbidden'],
    ['m.room.history_visibility', 'history_visibility', 'world_readable', 'joined'],
  ]) {
    contents[type][field] = invalid;
    assert.equal(companyRoomStatus(client, room), 'privacy-changed');
    contents[type][field] = valid;
  }
  room.getMyMembership = () => 'leave';
  assert.equal(companyRoomStatus(client, room), 'not-joined');
  assert.deepEqual(listCompanyRooms(client), []);
  delete contents[COMPANY_ROOM_EVENT];
  assert.equal(isCompanyRoom(room), false);
  assert.equal(companyRoomStatus(client, room), 'not-company-room');
  room.getMyMembership = () => 'join';
  assert.deepEqual(listCompanyRooms(client), [{ roomId: room.roomId, status: 'not-company-room' }]);
});

test('missing room identifier and server errors are surfaced', async () => {
  const { client } = fixture();
  client.createRoom = async () => ({});
  await assert.rejects(createCompanyRoom(client), /room-id-missing/);
  client.createRoom = async () => { throw new Error('server error'); };
  await assert.rejects(createCompanyRoom(client), /server error/);
});

test('company room sends fail closed and files or metadata are blocked', async () => {
  const { client, room, contents } = fixture();
  let sends = 0;
  let uploads = 0;
  client.getRoom = () => room;
  client.sendEvent = async () => { sends++; };
  client.uploadContent = async () => { uploads++; };
  setState({ client });
  client.getCrypto = () => undefined;
  await assert.rejects(sendMessage(room.roomId, 'sample'), /security checks failed/);
  assert.equal(sends, 0);
  client.getCrypto = () => ({});
  await sendMessage(room.roomId, 'sample');
  assert.equal(sends, 1);
  await assert.rejects(sendFile(room.roomId, { name: 'sample.txt' }), /disabled/);
  await assert.rejects(updateRoomProfile(room.roomId, { avatarFile: { name: 'sample.png' } }), /cannot be edited/);
  assert.equal(uploads, 0);
  delete contents[COMPANY_ROOM_EVENT];
  await assert.rejects(sendMessage(room.roomId, 'sample'), /security checks failed/);
  await assert.rejects(sendFile(room.roomId, { name: 'sample.txt' }), /disabled/);
  assert.equal(sends, 1);
  assert.equal(uploads, 0);
  setState({ client: null });
});
