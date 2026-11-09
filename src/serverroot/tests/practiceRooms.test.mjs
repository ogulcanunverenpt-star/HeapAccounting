import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRACTICE_DATA, PRACTICE_ROOM_EVENT, createPracticeRoom, getPracticeEvents,
  isProtectedPracticeRoom, listPracticeRooms, practiceRoomStatus, sendPracticeEvent,
} from '../src/client/practiceRooms.js';
import { inviteToRoom, sendFile, sendMessage, updateRoomProfile } from '../src/client/matrix.js';
import { setState } from '../src/store/state.js';

function fixture() {
  const player = '@player:example.org';
  const supervisor = '@supervisor:example.org';
  const content = {
    [PRACTICE_ROOM_EVENT]: { version: 1, player, supervisor },
    'm.room.encryption': { algorithm: 'm.megolm.v1.aes-sha2' },
    'm.room.join_rules': { join_rule: 'invite' },
    'm.room.guest_access': { guest_access: 'forbidden' },
    'm.room.history_visibility': { history_visibility: 'joined' },
    'm.room.power_levels': { invite: 100, state_default: 100, users: { [player]: 100 }, users_default: 0 },
  };
  const members = [{ userId: player, membership: 'join' }, { userId: supervisor, membership: 'join' }];
  const events = [];
  const room = {
    roomId: '!practice:example.org',
    getMyMembership: () => 'join',
    getMembers: () => members,
    currentState: { getStateEvents: type => content[type] ? { getContent: () => content[type], getSender: () => player } : null },
    getLiveTimeline: () => ({ getEvents: () => events }),
  };
  const client = {
    getUserId: () => player, getRoom: id => id === room.roomId ? room : null, getRooms: () => [room],
    getCrypto: () => ({}), getSyncState: () => 'SYNCING', isRoomEncrypted: () => true,
  };
  return { player, supervisor, content, members, events, room, client };
}

test('creates an encrypted invite-only room with a player and supervisor', async () => {
  const { client, player, supervisor } = fixture();
  let request;
  client.createRoom = async options => { request = options; return { room_id: '!new:example.org' }; };
  assert.equal(await createPracticeRoom(client, supervisor), '!new:example.org');
  assert.equal(request.visibility, 'private');
  assert.deepEqual(request.invite, [supervisor]);
  assert.deepEqual(request.power_level_content_override, { invite: 100, state_default: 100 });
  const state = Object.fromEntries(request.initial_state.map(event => [event.type, event.content]));
  assert.deepEqual(state[PRACTICE_ROOM_EVENT], { version: 1, player, supervisor });
  assert.equal(state['m.room.encryption'].algorithm, 'm.megolm.v1.aes-sha2');
  assert.equal(state['m.room.history_visibility'].history_visibility, 'joined');
  await assert.rejects(createPracticeRoom(client, player), /invalid-participants/);
  await assert.rejects(createPracticeRoom(client, 'bad-id'), /invalid-participants/);
  client.getCrypto = () => null;
  await assert.rejects(createPracticeRoom(client, supervisor), /crypto-unavailable/);
});

test('checks membership, permissions, encryption and sync before allowing a room', () => {
  const { client, room, content, members, player } = fixture();
  assert.equal(practiceRoomStatus(client, room), 'ready');
  assert.equal(listPracticeRooms(client)[0].status, 'ready');
  members[1].membership = 'invite';
  assert.equal(practiceRoomStatus(client, room), 'waiting-for-supervisor');
  members[1].membership = 'join';
  members.push({ userId: '@third:example.org', membership: 'invite' });
  assert.equal(practiceRoomStatus(client, room), 'unexpected-member');
  members.pop();
  content['m.room.power_levels'].events = { [PRACTICE_ROOM_EVENT]: 0 };
  assert.equal(practiceRoomStatus(client, room), 'privacy-changed');
  delete content['m.room.power_levels'].events;
  content['m.room.power_levels'].users[player] = 50;
  assert.equal(practiceRoomStatus(client, room), 'privacy-changed');
  content['m.room.power_levels'].users[player] = 100;
  content['m.room.join_rules'].join_rule = 'public';
  assert.equal(practiceRoomStatus(client, room), 'privacy-changed');
  content['m.room.join_rules'].join_rule = 'invite';
  client.isRoomEncrypted = () => false;
  assert.equal(practiceRoomStatus(client, room), 'encryption-unavailable');
  client.isRoomEncrypted = () => true;
  client.getSyncState = () => 'ERROR';
  assert.equal(practiceRoomStatus(client, room), 'sync-unavailable');
  delete content[PRACTICE_ROOM_EVENT];
  assert.equal(practiceRoomStatus(client, room), 'not-practice-room');
  assert.equal(isProtectedPracticeRoom(client, room.roomId), true);
});

test('sends a structured encrypted-room message only for the player in a ready room', async () => {
  const { client, room, members, supervisor } = fixture();
  const data = { version: 1, questionId: 'cash-sale-v1', action: 'started' };
  let sent;
  client.sendEvent = async (...args) => { sent = args; return { event_id: '$ok' }; };
  await sendPracticeEvent(client, room.roomId, data, 'stable-txn');
  assert.deepEqual(sent, [room.roomId, 'm.room.message', {
    msgtype: 'm.text', body: 'HeapAccounting practice activity', [PRACTICE_DATA]: data,
  }, 'stable-txn']);
  members[1].membership = 'invite';
  await assert.rejects(sendPracticeEvent(client, room.roomId, data, 'txn'), /waiting-for-supervisor/);
  members[1].membership = 'join';
  client.getUserId = () => supervisor;
  await assert.rejects(sendPracticeEvent(client, room.roomId, data, 'txn'), /not-player/);
  client.getUserId = () => '@player:example.org';
  await assert.rejects(sendPracticeEvent(client, room.roomId, data, ''), /invalid-event/);
  client.sendEvent = async () => { throw new Error('network-failed'); };
  await assert.rejects(sendPracticeEvent(client, room.roomId, data, 'txn'), /network-failed/);
});

test('only reads confirmed encrypted events from the room player', () => {
  const { client, room, events, player, supervisor } = fixture();
  const makeEvent = (sender, encrypted = true, status = null) => ({
    getType: () => 'm.room.message', getSender: () => sender, isEncrypted: () => encrypted,
    status, getId: () => '$event', getTs: () => 1,
    getContent: () => ({ [PRACTICE_DATA]: { version: 1, questionId: 'cash-sale-v1', action: 'started' } }),
  });
  events.push(makeEvent(player), makeEvent(supervisor), makeEvent(player, false), makeEvent(player, true, 'sending'));
  assert.equal(getPracticeEvents(client, room.roomId).length, 1);
});

test('ordinary chat cannot invite outsiders or bypass protected room checks', async () => {
  const { client, room, members, supervisor } = fixture();
  const invited = [];
  client.invite = async (id, user) => invited.push([id, user]);
  client.sendEvent = async () => {};
  setState({ client });
  try {
    await assert.rejects(inviteToRoom(room.roomId, '@outsider:example.org'), /designated supervisor/);
    await inviteToRoom(room.roomId, supervisor);
    assert.deepEqual(invited, [[room.roomId, supervisor]]);
    await assert.rejects(sendFile(room.roomId, { name: 'file.txt' }), /disabled/);
    await assert.rejects(updateRoomProfile(room.roomId, { name: 'new' }), /cannot be edited/);
    members.push({ userId: '@outsider:example.org', membership: 'invite' });
    await assert.rejects(sendMessage(room.roomId, 'sample'), /security checks failed/);
    await assert.rejects(inviteToRoom(room.roomId, supervisor), /designated supervisor/);
  } finally {
    setState({ client: null });
  }
});
