-- Deleting a match is a vote: a registered player of the match proposes it,
-- and it goes through only if a majority of the match's registered players
-- say yes. Guests have no account, so no vote.
CREATE TABLE deletion_proposals (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  proposed_by TEXT NOT NULL REFERENCES players(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);
-- At most one proposal under way per match.
CREATE UNIQUE INDEX deletion_proposals_one_open ON deletion_proposals (match_id) WHERE status = 'open';

-- One row per voter, written when the proposal opens: vote stays NULL until
-- they answer, so the electorate is fixed at that moment.
CREATE TABLE deletion_votes (
  proposal_id TEXT NOT NULL REFERENCES deletion_proposals(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  vote TEXT CHECK (vote IN ('yes', 'no')),
  voted_at TEXT,
  PRIMARY KEY (proposal_id, player_id)
);

-- What the bell shows. Read by polling a plain GET; no push.
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deletion_proposed', 'match_deleted', 'deletion_rejected')),
  match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT
);
CREATE INDEX notifications_player ON notifications (player_id, created_at);
