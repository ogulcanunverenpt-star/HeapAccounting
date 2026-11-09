CREATE TABLE IF NOT EXISTS exam_players (
  user_id text PRIMARY KEY,
  rating integer NOT NULL DEFAULT 100 CHECK (rating >= 0),
  qualified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY,
  definition jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS exam_files (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES exams(id),
  filename text NOT NULL,
  content_type text NOT NULL,
  content bytea NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES exams(id),
  user_id text NOT NULL REFERENCES exam_players(user_id),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'expired')),
  answers jsonb,
  score integer CHECK (score BETWEEN 0 AND 100),
  duration_ms bigint CHECK (duration_ms >= 0),
  rating_before integer,
  rating_after integer,
  UNIQUE (exam_id, user_id),
  CHECK ((status = 'active' AND completed_at IS NULL AND score IS NULL AND rating_before IS NULL AND rating_after IS NULL)
    OR (status <> 'active' AND completed_at IS NOT NULL AND score IS NOT NULL AND rating_before IS NOT NULL AND rating_after IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS exam_attempts_active_idx ON exam_attempts (started_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS exam_players_rating_idx ON exam_players (rating DESC, user_id ASC);

CREATE TABLE IF NOT EXISTS exam_assistant_leases (
  user_id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  lease_id text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS practice_gate (
  id integer PRIMARY KEY CHECK (id = 1)
);
INSERT INTO practice_gate (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS practice_exercises (
  id uuid PRIMARY KEY,
  definition jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS practice_completions (
  user_id text NOT NULL,
  exercise_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS prime_wallets (
  user_id text PRIMARY KEY REFERENCES exam_players(user_id),
  cash_cents bigint NOT NULL DEFAULT 10000000 CHECK (cash_cents >= 0),
  realized_cents bigint NOT NULL DEFAULT 0,
  score_units bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crypto_watchlist (
  user_id text NOT NULL REFERENCES prime_wallets(user_id),
  symbol text NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS crypto_wallets (
  user_id text PRIMARY KEY REFERENCES prime_wallets(user_id),
  cash_cents bigint NOT NULL DEFAULT 10000000 CHECK (cash_cents >= 0),
  realized_try_cents bigint NOT NULL DEFAULT 0,
  score_units bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crypto_positions (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES crypto_wallets(user_id),
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('long', 'short')),
  leverage integer NOT NULL CHECK (leverage BETWEEN 1 AND 10),
  margin_cents bigint NOT NULL CHECK (margin_cents > 0),
  entry_price text NOT NULL,
  opened_ms bigint NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidated')),
  close_price text,
  closed_ms bigint,
  funding_cents bigint,
  realized_cents bigint,
  try_rate text,
  rating_after integer
);
CREATE INDEX IF NOT EXISTS crypto_open_positions_idx ON crypto_positions (status, symbol);
CREATE INDEX IF NOT EXISTS crypto_user_positions_idx ON crypto_positions (user_id, status, opened_ms);
CREATE TABLE IF NOT EXISTS crypto_transactions (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  user_id text NOT NULL REFERENCES crypto_wallets(user_id),
  position_id uuid NOT NULL REFERENCES crypto_positions(id),
  action text NOT NULL CHECK (action IN ('open', 'close', 'liquidation')),
  fingerprint text NOT NULL,
  executed_ms bigint NOT NULL,
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS crypto_transactions_user_idx ON crypto_transactions (user_id, executed_ms DESC, id DESC);
