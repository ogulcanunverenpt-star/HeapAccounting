# HeapAccounting

An accounting game in development, with an existing Matrix client.

The first playable challenge is a fictional cash-sale journal entry based on
Türkiye's uniform chart of accounts. The stated VAT rate is a scenario
assumption, and the separate cost-of-goods entry is outside the exercise.
Players enter three journal lines and the separate exam service verifies the
practice answer before admitting them to the leaderboard at 100 rating.
Administrators can upload bilingual JSON exams with PDF/CSV question files.
The exam admin panel offers downloadable JSON exam/question and CSV
supplementary-data examples. Edit the JSON to define graded questions and
answer keys, then upload it with optional PDF/CSV attachments, or create the
exam in the designer and attach files there. Attachments are shown to exam
participants and are not automatically graded: do not include answer keys or
personal data in them. Practice exercises do not support attachments.
The PostgreSQL- or SQLite-backed service records one attempt, server timing, score and
rating, and serves the answer key after completion. This implementation has
not yet been verified with a real Matrix server or independently deployed
PostgreSQL. See [the exam service documentation](../exam-service/README.md)
for setup, rules, security limitations and an example exam.

Admins can also create exams and mandatory practice exercises in the quest
designer. Prime Crypto uses Binance mark prices for a virtual isolated-margin
simulation and displays a separate TradingView chart. The chart is not a
source of server-side execution prices. The separate Trades page shows
server-calculated live position P/L, closed positions, and transaction history.
See the service documentation for the
simulation rules and its market-data, liquidation and clock limitations.

The new exam flow does not use the older optional supervisor-room prototype.
Exams and results are not yet mirrored to Matrix rooms. An optional
server-configured Ollama/Gemini help panel is available outside active scored
exams; it is not a Matrix bot. Client-side practice timing is not used for
competitive scoring. See the service documentation for privacy and provider
configuration.
This is educational material, not professional advice or a guarantee of
regulatory compliance. Do not enter real financial data.

Existing Matrix chat remains available from the game screen. The client is
built with vanilla JS and Vite.

### Legacy private practice prototype limitations

The old optional supervisor-room UI is no longer mounted in the game screen.
Its code remains as an experimental prototype and its records are not exam
results. Room membership, the two Matrix IDs and
other state/metadata are visible to the homeserver and may be visible to
other room participants. Messages are sent only after checking encryption,
invite-only access, joined-only history, permissions and the expected two
joined participants; checks run again before each practice event. An app-side
check is not a security guarantee: room administrators or other clients can
change room state, and membership can change between checks and sending.
Devices and their trust, key recovery, room history and real-server behavior
have not been independently verified. Do not use this prototype for sensitive
answers or real examinations. Files are disabled in these rooms because this
client's existing file upload does not encrypt attachments.

The activity list initially shows up to 30 loaded, decrypted, confirmed practice events.
Use **Load older records** to paginate the Matrix timeline; missing keys,
server retention or joined-only history may prevent recovery. Presence is
provided by Matrix and can be stale or unavailable. The player controls the
data they send, including activity, answers, elapsed time and results; it is
not evidence of an honest attempt. A disconnected session may leave only a
start event. Failed sends are reported and retries reuse the
transaction ID for the same attempt, but retry state does not survive a page
reload. Back up keys and independently test recovery before relying on
records. A trusted service is still required for real exams, trusted timing,
scoring and rankings.

## Features

- Multi-account support
- Spaces and DMs
- End-to-end encryption status
- Emoji reactions (Emoji 17.0)
- File attachments
- Reply threading
- Member profiles
- Typing indicators
- Mention autocomplete (@user)
- Message deletion (redaction)
- Desktop notifications with sound
- Persistent settings (appearance, notifications, privacy)

## Settings

### Appearance
- Compact message layout
- Member list visibility
- Accent colour theme (purple, blue, green, orange, red)

### Notifications
- Desktop notifications — system-level popups for new messages (browser permission required)
- Notify on @mention only — limit notifications to messages that mention you
- Notification sound — plays a sound when a notification fires

### Privacy
- Read receipts
- Typing indicators
- Online presence

## Requirements

- Node.js 22+
- Clang with the `wasm32` target and lld (`wasm-ld`); set `WASM_CC` if
  the compiler is not on PATH
- A Matrix account (matrix.org or any homeserver)

## Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Production build

```bash
npm run build
```

Outputs static files to `dist/`. Deploy to any static host (Netlify, Vercel, Cloudflare Pages, nginx, etc.).

The app must be served over HTTPS in production — the Matrix SDK requires a secure context.

## Company-room and C bridge prototype

After signing in, use **Company rooms** in the top navigation to create a room.
The client requires initialized Matrix crypto and an active sync, requests an
invite-only Megolm room with joined-only history and guests disabled, and
checks those settings before opening it or sending a message. The room uses a
generic name and a version-only Matrix state marker; neither contains company
data. File uploads and editing the room's metadata through this client are
disabled for these rooms.

This is not accounting storage or proof of regulatory compliance. Do not enter
real financial data. Matrix room state, room IDs, membership and other metadata
are not end-to-end encrypted. Device verification, key backup and recovery,
membership administration, server trust, durability, and cross-device behavior
still need a full design and real-server testing. The checks are not a security
audit and do not establish device trust. Room administrators or other clients
can change room state; the client blocks use when its checks detect changed
settings. Recognition of a room whose marker is later removed is only kept in
memory for the current client session; it is not guaranteed after a restart.

The company-room dialog can report whether the current device, cross-signing,
secret storage and key backup appear ready. These checks do not prove that
keys can be recovered or that all room events are available. Settings can
restore a backup using a locally cached backup key or a legacy backup
passphrase; modern recovery-key setup is not implemented here. Use a
Matrix client that supports setting up and testing recovery, and keep recovery
material outside this application.
The optional browser-local TOTP check is not server-side Matrix 2FA and can
be bypassed outside this browser. Earlier versions sent its setup secret to
an external QR-code service; if you used that setup, disable the local
control and replace that authenticator secret. Use your Matrix provider's
server-enforced authentication for account security.

`src/accounting/ledger.js` provides an initial, standalone chart, balanced
voucher validator and trial-balance calculation. Monetary amounts are
non-negative integer strings representing kuruş; arithmetic uses `BigInt`.
The code does not create official books, maintain audit history, persist or
sync vouchers to Matrix, provide e-Defter/berat, or validate the complete
Tekdüzen Hesap Planı. It must not be used as evidence of legal compliance.
Production use requires independently verified retention, key recovery,
complete encrypted history, access control, e-Defter integration and review
by a qualified Turkish accounting professional. See the [GİB e-Defter portal](https://www.edefter.gov.tr/anasayfa.html)
for official guidance and current announcements.

`src/wasm/bridge.c` is compiled by `npm run dev`, `npm run build`, and
`npm test` into a generated (untracked) WebAssembly module. The company-room
dialog includes a sample button that calls the C export through JavaScript.
For example:

```js
import { addMinorUnits } from './wasm/bridge.js';

button.addEventListener('click', async () => {
  const result = await addMinorUnits(120, 30); // 150n
  console.log(result);
});
```

The bridge accepts signed 32-bit integer inputs and returns a `BigInt`; it is a
demonstration, not a financial calculation engine. Run `npm test` for the
mocked room-security and compiled-C tests.

### nginx example

```nginx
server {
    listen 443 ssl;
    root /var/www/trinity/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Tech stack

- [Vite](https://vitejs.dev/) — build tool
- [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) — Matrix client SDK
- [emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element) — emoji picker
