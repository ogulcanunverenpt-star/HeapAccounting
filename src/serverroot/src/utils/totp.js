// 2FA / TOTP (Time-based One-Time Password - RFC 6238)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length = 16) {
  let secret = '';
  const randomValues = new Uint8Array(length);
  window.crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    secret += BASE32_CHARS[randomValues[i] % BASE32_CHARS.length];
  }
  return secret;
}

function base32ToBytes(base32) {
  let bits = '';
  for (let i = 0; i < base32.length; i++) {
    const val = BASE32_CHARS.indexOf(base32[i].toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substring(i * 8, (i + 1) * 8), 2);
  }
  return bytes;
}

export async function generateTotpCode(secret, timeStep = 30) {
  const keyBytes = base32ToBytes(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const timeCounter = Math.floor(epoch / timeStep);

  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, timeCounter, false);

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: { name: 'SHA-1' } },
    false,
    ['sign']
  );

  const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, buffer);
  const sigBytes = new Uint8Array(signature);

  const offset = sigBytes[sigBytes.length - 1] & 0xf;
  const binary =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export async function verifyTotpCode(secret, userCode) {
  if (!secret || !userCode || userCode.trim().length !== 6) return false;

  const codeNow = await generateTotpCode(secret);
  if (userCode.trim() === codeNow) return true;

  // Allow ±1 time window (30s clock skew)
  const epoch = Math.floor(Date.now() / 1000);
  const keyBytes = base32ToBytes(secret);

  for (const skew of [-1, 1]) {
    const timeCounter = Math.floor((epoch + skew * 30) / 30);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(4, timeCounter, false);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: { name: 'SHA-1' } },
      false,
      ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, buffer);
    const sigBytes = new Uint8Array(signature);
    const offset = sigBytes[sigBytes.length - 1] & 0xf;
    const binary =
      ((sigBytes[offset] & 0x7f) << 24) |
      ((sigBytes[offset + 1] & 0xff) << 16) |
      ((sigBytes[offset + 2] & 0xff) << 8) |
      (sigBytes[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    if (userCode.trim() === otp) return true;
  }

  return false;
}
