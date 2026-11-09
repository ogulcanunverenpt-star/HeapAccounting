export async function restoreMatrixKeyBackup(client, passphrase) {
  if (!client) throw new Error('Matrix istemcisi hazır değil.');
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Matrix şifreleme altyapısı hazır değil.');

  if (passphrase !== undefined && (typeof passphrase !== 'string' || passphrase.length === 0)) {
    throw new TypeError('Yedek parolası boş olamaz.');
  }
  const result = passphrase === undefined
    ? await crypto.restoreKeyBackup()
    : await crypto.restoreKeyBackupWithPassphrase(passphrase);
  if (!result || !Number.isInteger(result.total) || !Number.isInteger(result.imported) ||
      result.total < 0 || result.imported < 0 || result.imported > result.total) {
    throw new Error('Anahtar yedeği geri yükleme sonucu geçersiz.');
  }
  return result;
}

export async function inspectRecoveryReadiness(client) {
  if (!client) throw new Error('Matrix istemcisi hazır değil.');
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Matrix şifreleme altyapısı hazır değil.');
  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  if (!userId || !deviceId) throw new Error('Matrix kullanıcı veya cihaz kimliği bulunamadı.');

  const [crossSigning, secretStorage, backupVersion, backupKey, device, backupInfo] = await Promise.all([
    crypto.isCrossSigningReady(),
    crypto.isSecretStorageReady(),
    crypto.getActiveSessionBackupVersion(),
    crypto.getSessionBackupPrivateKey(),
    crypto.getDeviceVerificationStatus(userId, deviceId),
    crypto.getKeyBackupInfo(),
  ]);
  const backupTrust = backupInfo ? await crypto.isKeyBackupTrusted(backupInfo) : null;
  return {
    deviceVerified: device?.isVerified() === true,
    crossSigning: crossSigning === true,
    secretStorage: secretStorage === true,
    backupActive: !!backupVersion && backupVersion === backupInfo?.version,
    backupKeyAvailable: !!backupKey && backupKey.length > 0,
    backupTrusted: backupTrust?.trusted === true && backupTrust.matchesDecryptionKey === true,
  };
}
