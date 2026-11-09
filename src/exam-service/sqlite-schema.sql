CREATE TABLE IF NOT EXISTS exam_players (
  user_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL DEFAULT 100 CHECK (rating >= 0),
  qualified_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  definition TEXT NOT NULL CHECK (json_valid(definition)),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS exam_files (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  user_id TEXT NOT NULL REFERENCES exam_players(user_id),
  started_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  completed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'expired')),
  answers TEXT CHECK (answers IS NULL OR json_valid(answers)),
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  duration_ms INTEGER CHECK (duration_ms >= 0),
  rating_before INTEGER,
  rating_after INTEGER,
  UNIQUE (exam_id, user_id),
  CHECK ((status = 'active' AND completed_at IS NULL AND score IS NULL AND rating_before IS NULL AND rating_after IS NULL)
    OR (status <> 'active' AND completed_at IS NOT NULL AND score IS NOT NULL AND rating_before IS NOT NULL AND rating_after IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS exam_attempts_active_idx ON exam_attempts (started_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS exam_players_rating_idx ON exam_players (rating DESC, user_id ASC);

CREATE TABLE IF NOT EXISTS exam_assistant_leases (
  user_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  lease_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS practice_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1)
);
INSERT INTO practice_gate (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS practice_exercises (
  id TEXT PRIMARY KEY,
  definition TEXT NOT NULL CHECK (json_valid(definition)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);
CREATE TABLE IF NOT EXISTS practice_completions (
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY (user_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS prime_wallets (
  user_id TEXT PRIMARY KEY REFERENCES exam_players(user_id),
  cash_cents INTEGER NOT NULL DEFAULT 10000000 CHECK (cash_cents >= 0),
  realized_cents INTEGER NOT NULL DEFAULT 0,
  score_units INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crypto_watchlist (
  user_id TEXT NOT NULL REFERENCES prime_wallets(user_id),
  symbol TEXT NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS crypto_wallets (
  user_id TEXT PRIMARY KEY REFERENCES prime_wallets(user_id),
  cash_cents INTEGER NOT NULL DEFAULT 10000000 CHECK (cash_cents >= 0),
  realized_try_cents INTEGER NOT NULL DEFAULT 0,
  score_units INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crypto_positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES crypto_wallets(user_id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  leverage INTEGER NOT NULL CHECK (leverage BETWEEN 1 AND 10),
  margin_cents INTEGER NOT NULL CHECK (margin_cents > 0),
  entry_price TEXT NOT NULL,
  opened_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidated')),
  close_price TEXT,
  closed_ms INTEGER,
  funding_cents INTEGER,
  realized_cents INTEGER,
  try_rate TEXT,
  rating_after INTEGER
);
CREATE INDEX IF NOT EXISTS crypto_open_positions_idx ON crypto_positions (status, symbol);
CREATE INDEX IF NOT EXISTS crypto_user_positions_idx ON crypto_positions (user_id, status, opened_ms);
CREATE TABLE IF NOT EXISTS crypto_transactions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES crypto_wallets(user_id),
  position_id TEXT NOT NULL REFERENCES crypto_positions(id),
  action TEXT NOT NULL CHECK (action IN ('open', 'close', 'liquidation')),
  fingerprint TEXT NOT NULL,
  executed_ms INTEGER NOT NULL,
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS crypto_transactions_user_idx ON crypto_transactions (user_id, executed_ms DESC, id DESC);
