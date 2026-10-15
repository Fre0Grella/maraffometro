-- A player who deleted their account: personal data wiped, the row kept so
-- the matches the others played with them still add up. Hidden from the
-- player list and the leaderboard; cannot be claimed.
ALTER TABLE players ADD COLUMN deleted_at TEXT;
