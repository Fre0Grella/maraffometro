-- Players: everyone who can sit at the table. A signed-in player has a
-- google_sub; a guest (added by a friend, not signed in yet) has none and can
-- be claimed later with a claim code.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  picture_url TEXT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🃏',
  color TEXT NOT NULL DEFAULT '#b4442c',
  motto TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES players(id) ON DELETE SET NULL,
  claim_code TEXT UNIQUE,
  claim_code_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A match: one sitting of four players, one or more sets. The id is generated
-- by the app so a retried submission is recognised.
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  played_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES players(id),
  sets_won_a INTEGER NOT NULL,
  sets_won_b INTEGER NOT NULL,
  winner_team INTEGER CHECK (winner_team IN (0, 1)),
  voided_at TEXT,
  voided_by TEXT REFERENCES players(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX matches_played_at ON matches (played_at);

-- Seats are numbered in playing order; partners sit opposite, so the team is
-- seat % 2 (0 = team A, 1 = team B).
CREATE TABLE match_players (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3),
  team INTEGER NOT NULL CHECK (team = seat % 2),
  player_id TEXT NOT NULL REFERENCES players(id),
  PRIMARY KEY (match_id, seat),
  UNIQUE (match_id, player_id)
);
CREATE INDEX match_players_player ON match_players (player_id);

-- winner_team is NULL for a set left unfinished when the match stopped.
CREATE TABLE match_sets (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  set_index INTEGER NOT NULL,
  target INTEGER NOT NULL CHECK (target IN (31, 41, 51)),
  score_a INTEGER NOT NULL,
  score_b INTEGER NOT NULL,
  winner_team INTEGER CHECK (winner_team IN (0, 1)),
  PRIMARY KEY (match_id, set_index)
);

-- Card points per team (maraffa bonus excluded) and who led the hand. Kept per
-- hand because the "di mano / fuori mano" averages are per hand.
CREATE TABLE hands (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  set_index INTEGER NOT NULL,
  hand_index INTEGER NOT NULL,
  mano_seat INTEGER NOT NULL CHECK (mano_seat BETWEEN 0 AND 3),
  points_a INTEGER NOT NULL CHECK (points_a BETWEEN 0 AND 11),
  points_b INTEGER NOT NULL CHECK (points_b BETWEEN 0 AND 11),
  -- Declared by the player di mano, the only one who can: they call trumps.
  maraffa INTEGER NOT NULL DEFAULT 0 CHECK (maraffa IN (0, 1)),
  PRIMARY KEY (match_id, set_index, hand_index)
);

-- The current fit, rewritten whole whenever a match is recorded or voided, so
-- the leaderboard is a plain read.
CREATE TABLE ratings (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  theta REAL NOT NULL,
  rating REAL NOT NULL,
  uncertainty REAL NOT NULL,
  sets_rated INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- What each player's rating was just before and after a match was recorded.
CREATE TABLE rating_changes (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rating_before REAL NOT NULL,
  rating_after REAL NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
