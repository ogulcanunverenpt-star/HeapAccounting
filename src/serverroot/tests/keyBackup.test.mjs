import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRecoveryReadiness, restoreMatrixKeyBackup } from '../src/client/keyBackup.js';

test('restores a cached backup key or legacy passphrase using the crypto SDK', async () => {
  const calls = [];
  const crypto = {
    restoreKeyBackup: async () => { calls.push('cached'); return { total: 3, imported: 2 }; },
    restoreKeyBackupWithPassphrase: async value => { calls.push(value); return { total: 1, imported: 1 }; },
  };
  const client = { getCrypto: () => crypto };
  assert.deepEqual(await restoreMatrixKeyBackup(client), { total: 3, imported: 2 });
  assert.deepEqual(await restoreMatrixKeyBackup(client, 'test-passphrase'), { total: 1, imported: 1 });
  assert.deepEqual(calls, ['cached', 'test-passphrase']);
});

test('fails explicitly when crypto is unavailable, restore fails or response is invalid', async () => {
  await assert.rejects(restoreMatrixKeyBackup(null), /hazır değil/);
  await assert.rejects(restoreMatrixKeyBackup({ getCrypto: () => null }), /hazır değil/);
  const client = { getCrypto: () => ({ restoreKeyBackup: async () => { throw new Error('restore failed'); } }) };
  await assert.rejects(restoreMatrixKeyBackup(client), /restore failed/);
  await assert.rejects(restoreMatrixKeyBackup(client, ''), /boş olamaz/);
  client.getCrypto = () => ({ restoreKeyBackup: async () => ({ total: 1, imported: 2 }) });
  await assert.rejects(restoreMatrixKeyBackup(client), /geçersiz/);
});

test('reports individual device and recovery prerequisites without claiming recovery', async () => {
  const crypto = {
    isCrossSigningReady: async () => true,
    isSecretStorageReady: async () => true,
    getActiveSessionBackupVersion: async () => '1',
    getSessionBackupPrivateKey: async () => new Uint8Array([1]),
    getDeviceVerificationStatus: async () => ({ isVerified: () => true }),
    getKeyBackupInfo: async () => ({ version: '1' }),
    isKeyBackupTrusted: async () => ({ trusted: true, matchesDecryptionKey: true }),
  };
  const client = { getCrypto: () => crypto, getUserId: () => '@example:test', getDeviceId: () => 'TEST' };
  assert.deepEqual(await inspectRecoveryReadiness(client), {
    deviceVerified: true, crossSigning: true, secretStorage: true,
    backupActive: true, backupKeyAvailable: true, backupTrusted: true,
  });
  crypto.getActiveSessionBackupVersion = async () => '2';
  crypto.getSessionBackupPrivateKey = async () => null;
  crypto.getDeviceVerificationStatus = async () => null;
  crypto.isKeyBackupTrusted = async () => ({ trusted: true, matchesDecryptionKey: false });
  const failed = await inspectRecoveryReadiness(client);
  assert.equal(failed.deviceVerified, false);
  assert.equal(failed.backupActive, false);
  assert.equal(failed.backupKeyAvailable, false);
  assert.equal(failed.backupTrusted, false);
  crypto.getKeyBackupInfo = async () => { throw new Error('network error'); };
  await assert.rejects(inspectRecoveryReadiness(client), /network error/);
});
