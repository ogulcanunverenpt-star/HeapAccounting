# Exam service

The exam service is a separate Node.js 22.15+ process backed by PostgreSQL
or SQLite (using Node's built-in `node:sqlite`). It
verifies each Matrix access token against the configured homeserver's `whoami`
endpoint. It never accepts a user ID supplied by the browser as proof of
identity. Only Matrix IDs listed in `EXAM_ADMIN_IDS` can publish exams.

## Status and limitations

This is an initial implementation, not a production security audit. It has
not been tested against a real Matrix homeserver, an independently deployed
PostgreSQL server, or Docker in this environment. Integration tests use
PGlite (a PostgreSQL engine in-process) and a mock Matrix homeserver; they do
not establish cross-process concurrency or Matrix encryption/recovery.

The authoritative exam definitions, answer keys, attachments, attempts,
results, elapsed time and ratings are in the selected database. **They are not yet
mirrored to Matrix rooms.** The previous optional supervisor-room prototype
is not used by the new exam flow. The optional assistant is not a Matrix
bot; encrypted Matrix bot key management and durable Matrix publication are
not implemented.
Do not treat this as the complete requested Matrix-backed production system.
Do not upload real personal or financial data.

## Practice, exam authoring and Prime

The admin IDs in `.env` can use the quest designer on the Exams page to
publish multiple-choice and journal questions in Turkish and English as exams
or mandatory practice exercises. Practice definitions can be activated or
deactivated in that panel; to change a definition, deactivate it and
publish a replacement. They are immutable so previously completed answers
do not silently change. New players must complete the original cash-sale
exercise and every active required practice exercise with all answers correct.
Progress is stored server-side. Existing qualified players keep their rating
and access when additional exercises are published. After a successful login,
already qualified players are taken to the exams view rather than being asked
to start practice again. Initial database startup inserts the example exam
once, with a fixed identifier; it does not overwrite existing results.

Administrators can download an example JSON exam definition containing both
question types and their answers, edit it and upload it in the exam panel.
The same panel offers an example CSV supplementary question-data file. PDF/CSV
attachments can also be added when publishing an exam with the visual designer;
they are available to participants and are not graded or parsed as questions.
Keep answer keys in the JSON definition, never in attachments. Up to five
nonempty PDF/CSV files are allowed, at most 5 MiB each and 10 MiB total;
filenames may contain ASCII letters, numbers, dots, underscores and hyphens.
Practice exercises do not support attachments.

Prime unlocks permanently at 500 Elo. Prime Crypto provides a separate
100,000 USDT virtual wallet, a watchlist, isolated long/short positions up to
10x, personal and public transaction history, and a TradingView chart. Public
history exposes the player's Matrix ID and trade details to logged-in users.
The BIST UI and
HTTP endpoints have been removed; old database records are retained.

**This is a game, not Binance futures or investment advice.** The notional is
the chosen margin times leverage. Profit/loss is the proportional movement of
the Binance mark price against entry, reversed for short positions. There is
no order book, commission, slippage, tax or partial position close. Each
position pays a simulated 0.01% of its initial notional for each complete
eight-hour period after opening, for both long and short. Funding is calculated
on observation or settlement, truncated to USDT cents, and charged at
settlement. Equity is margin plus unrealized P/L minus accrued funding.
The sampled position is liquidated if equity is at or below 0.5% of its initial
notional. Loss is limited to the isolated margin; remaining equity is returned.

The service receives Binance mark prices through a shared one-second WebSocket
stream with REST fallback. The browser refreshes approximately every two
seconds; the server checks open positions approximately every two seconds.
The Trades page calculates live mark-to-market P/L and funding on the server
using the same rules as settlement; unavailable or stale quotes are shown as
unavailable instead of being included in totals.
If valuation fails, the Trades page reports the error and still lists stored
open positions without prices or P/L. Closing asks for confirmation and still
requires fresh server-side market and USDT/TRY prices. A missing valuation API
can mean the running exam service needs to be restarted after an update.
Liquidation
uses only observed mark prices; moves between polls, during downtime, after
restart, or while Binance is unavailable can be missed. Monitoring can be
delayed by network/database work, and cannot guarantee real Binance
liquidation behavior. Opening, closing and liquidation also require a USDT/TRY trade
no older than 15 seconds; when it is unavailable settlement waits for a valid
quote. Quotes older than 15 seconds or over one second ahead of the service
clock are rejected; ensure the service host's UTC clock is synchronized.

At settlement, net USDT P/L is converted at that USDT/TRY trade price and
truncated to TRY cents. Every whole 1,000 TL of cumulative net crypto P/L adds
or subtracts 10 Elo; fractional thresholds carry forward and Elo is bounded
between 0 and 100,000. Funding is included in P/L. The service uses
idempotency keys and never accepts execution prices from the browser. The
TradingView embed is independent and can display a different price.

These features have not been verified against a real Matrix server, independent
PostgreSQL, an external chart, or a full live Binance trade flow. Market-data
distribution rights, observability, load testing, uptime and outage behavior
need review before any competitive deployment. No real Binance orders are sent.

## Guided launch

- Windows: run `src\start-all.cmd`. Node.js 22.15+, npm, MSYS2,
  GCC/make and Clang/lld are required; missing tools may be installed after
  confirmation where supported. Restart the terminal if a newly installed
  Node.js is not found. The launcher creates the service `.env` only if it
  does not already exist, builds the application and opens the local site.
- Linux: run `sh src/start-all.sh`. Install Node.js 22.15+ and npm first;
  supported package managers can install missing C and WebAssembly tools with
  confirmation. Keep the terminal open; Ctrl+C stops the launched processes.
- Docker: install and start Docker Desktop or Docker Engine with Compose,
  then run `src\start-docker.cmd` on Windows or `sh src/start-docker.sh`
  on Linux. Confirm the build and provide a Matrix homeserver, admin ID and
  PostgreSQL password. Keep the same password for an existing database volume.
  Compose uses PostgreSQL, independently of the local `DB_DRIVER`; the site
  listens at `http://localhost:8080`. Existing project containers may be
  recreated. Docker itself is not installed by these launchers.

The local launchers default to web port 3490 and API port 3491. `WEB_PORT`
changes the C server port; service `PORT` changes the API port. The launchers
connect the C proxy to the configured API port, reject a conflicting
`EXAM_API_PORT`, and do not stop existing services. Service `HOST` must be
reachable on loopback. Existing `.env` files and database contents are kept.
Docker and the Linux launchers have not been tested end-to-end here.

## Local setup

Copy the example configuration and edit `.env` in `src\exam-service`:

```powershell
cd src\exam-service
npm.cmd ci
Copy-Item .env.example .env
# Edit .env and set EXAM_ADMIN_IDS to your Matrix user ID.
npm.cmd start
```

For SQLite set `DB_DRIVER=sqlite` and `SQLITE_PATH=data/exams.sqlite`.
The service creates the directory and database if needed. Relative SQLite
paths are resolved from `src\exam-service`, not the launching directory.
SQLite uses a local file, WAL mode and serialized write transactions; use a
local filesystem and prefer PostgreSQL for high-concurrency or multi-host
deployments. Back up the database using SQLite's backup facilities, including
any active WAL state. Restrict access to the database, WAL and shared-memory
files: they contain answer keys and player data.

For PostgreSQL set `DB_DRIVER=postgres` and `DATABASE_URL`, or set all of
`PGHOST`, `PGUSER`, `PGDATABASE` and `PGPASSWORD` (and optionally `PGPORT`).
Create the PostgreSQL database and a dedicated user with permission to create
and modify tables. If `DB_DRIVER` is not set, the existing PostgreSQL behavior
is retained. Selecting a different database does **not** migrate data between
them.

The service loads its `.env` automatically, regardless of the current
directory. Existing process environment variables override `.env`. Never
commit `.env`, passwords, or SQLite database files. `MATRIX_URL` and
`EXAM_ADMIN_IDS` are required for both databases; the admin value is a
comma-separated list of Matrix user IDs. The configured Matrix URL must match
the resolved base URL used by the player's Matrix client; a different
homeserver is deliberately rejected. Use HTTPS except for a loopback
development homeserver. The API initializes its tables on startup.

In another terminal, run the frontend from `src\serverroot` with
`npm.cmd run dev`. Vite proxies `/api` to `127.0.0.1:3491`. Alternatively,
build and run the C server, then open `http://localhost:3490`: its `/api/`
proxy forwards local browser requests to `127.0.0.1:3491`. Rebuild and restart
the C server after updating it. If the API uses a different port, set
`EXAM_API_PORT` in the C server's process environment to match `PORT` in this
service. The C proxy only accepts loopback clients and does not provide TLS.
The root `compose.yaml` adds an nginx gateway, C static server, PostgreSQL and
exam service; this Compose configuration selects PostgreSQL. Set
`POSTGRES_PASSWORD`, `MATRIX_URL` and `EXAM_ADMIN_IDS` in
your shell before `docker compose up --build`; the gateway binds only to
`127.0.0.1:8080`. Compose has not been tested here. For network deployment,
provide a correctly configured HTTPS reverse proxy and secure PostgreSQL,
credentials, access control, backups, retention and monitoring; do not expose
the development gateway or API directly to untrusted networks.

## Optional AI helper

Edit `src\exam-service\.env` and restart the service:

```dotenv
AI_PROVIDER=ollama
AI_MODEL=your-installed-model
OLLAMA_URL=http://127.0.0.1:11434
```

Install/start Ollama and pull the chosen model separately. Ollama must use an
HTTP loopback URL. Alternatively choose `AI_PROVIDER=gemini`, specify a
supported `AI_MODEL`, and set `GEMINI_API_KEY` in the same file. The key stays
on the server. Gemini messages and up to four previous chat messages are sent
to Google only after the player checks the consent box. Ollama receives the
same conversation locally. Do not enter real personal or financial data.
History is held only in the current browser session and is cleared on account
change. The assistant is educational and may be incorrect.

The assistant is blocked by the server while a scored exam is active; a new
exam cannot start while an AI response is being generated. After an interrupted
request, this lock can last up to 60 seconds. Rate limiting is process-local,
not shared across multiple service instances.

The Docker launcher uses the service `.env` for Compose variable
interpolation when that file exists; otherwise Compose uses its normal root
`.env` lookup. Shell environment variables override the file. The Compose
configuration currently passes Gemini settings only: Docker-host Ollama is
not supported because a container's loopback is not the host's loopback.
Real Ollama and Gemini connections have not been tested here.

`npm.cmd test` runs SQLite, PGlite, configuration and HTTP tests. Frontend tests run with
`npm.cmd test` in `src\serverroot`. PGlite is a development dependency, not
the production database.

## Exam format

The admin uploads a UTF-8 JSON definition and optionally up to five PDF/CSV
question-data files, each at most 5 MiB and 10 MiB total. JSON is limited to
1 MiB by the browser. Files are stored in the selected database and can be downloaded
only by users who started that exam. These files are not encrypted Matrix
attachments. Downloaded files are not malware-scanned.

See `examples\exam.json` for the supported format. It includes a multiple
choice question and a journal-entry question. Both Turkish and English text
are required. The sum of `points` must be exactly 100. Journal answers use
positive TL amounts with at most two decimal places, `debit`/`credit`, and
balanced entries; line order is irrelevant. Other question formats and
manually graded answers are not supported. Tests and examples are educational,
not proof of Turkish regulatory compliance.

### Player answer files

After starting an attempt, download the CSV or XLSX answer template, fill it
in and select it before submission. A selected file replaces all answers
entered on screen; the server still grades the submitted answers. Blank
questions receive no points. Keep every template row and these columns:
`question_id,line,choice,account_code,side,amount`. For a choice enter the
option code shown next to the option. For a journal entry leave `choice`
empty and use one line per entry, `debit` or `credit`, and a positive amount
with at most two decimal places. For example, using a Turkish CSV delimiter:

```text
question_id;line;choice;account_code;side;amount
q1;1;a;;;
q2;1;;100;debit;1200,00
q2;2;;600;credit;1200,00
```

Turkish templates use semicolons and English templates commas. The importer
accepts either; quote comma-containing fields in comma-separated CSV. XLSX
must have one worksheet and plain text/numeric cells, without formulas.
Files are limited to 1 MiB compressed; this does not limit the expanded size
of an XLSX archive. Only open trusted answer files to avoid excessive browser
memory consumption. Templates do not contain answer keys.

The correct answer key is kept server-side until the player's attempt is
finished or expires. It is then shown to that player. This does not prevent
a player from sharing the solution with another account; use controlled
question distribution before relying on competitive integrity.

## Rules

The existing cash-sale practice is checked again by the service. First
successful completion creates a player at 100 rating; later completions do
not reset it. A player has one attempt per exam, including abandoned or
expired attempts. Starting creates the attempt and starts the server clock.
Expired attempts score zero. Submission and expiration lock the attempt and
player, update the score and rating in the same database transaction, and
return an already-completed result on retry without applying Elo twice.

For a score `S` in `[0, 100]`, current rating `R`, exam difficulty rating `D`,
and `K=32`: `E = 1 / (1 + 10 ** ((D - R) / 400))`;
`newRating = max(0, round(R + 32 * (S / 100 - E)))`.
Time is recorded but does not independently modify the score. Admins set
`difficultyRating` in `[0, 4000]` and a time limit of 60–86400 seconds.
The timeout worker processes up to 100 expired attempts every 10 seconds;
an expired attempt is also finalized when opened or submitted.

This setup does not prevent account sharing, answer sharing, automated clients
or a dishonest administrator. It has no rate limiting or independent exam
content review and is not suitable for high-stakes exams without further
security and operational work.
