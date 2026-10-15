/**
 * Deleting a match by vote. A registered player of the match proposes it; the
 * electorate is the match's registered players at that moment (guests have no
 * account, so no say); a strict majority of yes deletes it, and enough no that
 * yes can no longer get there rejects it. Every voter is told how it ended.
 *
 * Deleting means voiding: the match stays in the database, out of the ratings
 * and the stats. The rating changes recorded for later matches are history
 * and stay as they were; only the current ratings are refitted without it.
 */
import type { DeletionProposalDTO, Vote } from "@maraffometro/shared";
import { getMatchRow } from "./matches";
import { notify } from "./notifications";
import { getPlayer, toPlayerDTO } from "./players";
import { recomputeRatings } from "./ratings";

export type DeletionError = "match_not_found" | "match_deleted" | "not_a_voter" | "proposal_open" | "no_open_proposal";

interface ProposalRow {
  id: string;
  match_id: string;
  proposed_by: string;
  status: "open" | "approved" | "rejected";
  created_at: string;
}

interface VoteRow {
  player_id: string;
  vote: Vote | null;
}

/** Yes votes needed out of `eligible`: more than half. */
export function majority(eligible: number): number {
  return Math.floor(eligible / 2) + 1;
}

/** Registered, not deleted, players seated in the match. */
export async function eligibleVoters(db: D1Database, matchId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT mp.player_id FROM match_players mp JOIN players p ON p.id = mp.player_id
        WHERE mp.match_id = ? AND p.google_sub IS NOT NULL AND p.deleted_at IS NULL`,
    )
    .bind(matchId)
    .all<{ player_id: string }>();
  return results.map((r) => r.player_id);
}

async function openProposal(db: D1Database, matchId: string): Promise<ProposalRow | null> {
  return db
    .prepare("SELECT * FROM deletion_proposals WHERE match_id = ? AND status = 'open'")
    .bind(matchId)
    .first<ProposalRow>();
}

async function votesOf(db: D1Database, proposalId: string): Promise<VoteRow[]> {
  const { results } = await db
    .prepare("SELECT player_id, vote FROM deletion_votes WHERE proposal_id = ?")
    .bind(proposalId)
    .all<VoteRow>();
  return results;
}

/** Settles the proposal if the votes so far decide it; otherwise leaves it open. */
async function settle(db: D1Database, proposal: ProposalRow): Promise<ProposalRow["status"]> {
  const votes = await votesOf(db, proposal.id);
  const needed = majority(votes.length);
  const yes = votes.filter((v) => v.vote === "yes").length;
  const no = votes.filter((v) => v.vote === "no").length;
  const voters = votes.map((v) => v.player_id);
  const now = new Date().toISOString();

  if (yes >= needed) {
    await db.batch([
      db.prepare("UPDATE deletion_proposals SET status = 'approved', resolved_at = ? WHERE id = ?").bind(now, proposal.id),
      db
        .prepare("UPDATE matches SET voided_at = ?, voided_by = ? WHERE id = ? AND voided_at IS NULL")
        .bind(now, proposal.proposed_by, proposal.match_id),
      notify(db, voters, "match_deleted", proposal.match_id, null),
    ]);
    await recomputeRatings(db);
    return "approved";
  }
  if (no > votes.length - needed) {
    await db.batch([
      db.prepare("UPDATE deletion_proposals SET status = 'rejected', resolved_at = ? WHERE id = ?").bind(now, proposal.id),
      notify(db, voters, "deletion_rejected", proposal.match_id, null),
    ]);
    return "rejected";
  }
  return "open";
}

export async function proposeDeletion(
  db: D1Database,
  matchId: string,
  proposerId: string,
): Promise<{ ok: true; status: ProposalRow["status"] } | { ok: false; error: DeletionError }> {
  const match = await getMatchRow(db, matchId);
  if (!match) return { ok: false, error: "match_not_found" };
  if (match.voided_at) return { ok: false, error: "match_deleted" };
  const voters = await eligibleVoters(db, matchId);
  if (!voters.includes(proposerId)) return { ok: false, error: "not_a_voter" };
  if (await openProposal(db, matchId)) return { ok: false, error: "proposal_open" };

  const proposal: ProposalRow = {
    id: crypto.randomUUID(),
    match_id: matchId,
    proposed_by: proposerId,
    status: "open",
    created_at: new Date().toISOString(),
  };
  // The proposer votes yes by proposing; everyone else is asked.
  const ballots = voters.map((id) => ({ id, vote: id === proposerId ? "yes" : null }));
  const others = voters.filter((id) => id !== proposerId);
  const stmts: D1PreparedStatement[] = [
    db
      .prepare("INSERT INTO deletion_proposals (id, match_id, proposed_by, created_at) VALUES (?, ?, ?, ?)")
      .bind(proposal.id, matchId, proposerId, proposal.created_at),
    db
      .prepare(
        `INSERT INTO deletion_votes (proposal_id, player_id, vote, voted_at)
         SELECT ?1, json_extract(value, '$.id'), json_extract(value, '$.vote'),
                CASE WHEN json_extract(value, '$.vote') IS NULL THEN NULL ELSE ?2 END
           FROM json_each(?3)`,
      )
      .bind(proposal.id, proposal.created_at, JSON.stringify(ballots)),
  ];
  if (others.length) stmts.push(notify(db, others, "deletion_proposed", matchId, proposerId));
  await db.batch(stmts);
  return { ok: true, status: await settle(db, proposal) };
}

export async function castVote(
  db: D1Database,
  matchId: string,
  voterId: string,
  vote: Vote,
): Promise<{ ok: true; status: ProposalRow["status"] } | { ok: false; error: DeletionError }> {
  const proposal = await openProposal(db, matchId);
  if (!proposal) return { ok: false, error: "no_open_proposal" };
  if (!(await votesOf(db, proposal.id)).some((v) => v.player_id === voterId)) {
    return { ok: false, error: "not_a_voter" };
  }
  // A voter may change their mind while the proposal is open.
  await db
    .prepare("UPDATE deletion_votes SET vote = ?, voted_at = ? WHERE proposal_id = ? AND player_id = ?")
    .bind(vote, new Date().toISOString(), proposal.id, voterId)
    .run();
  return { ok: true, status: await settle(db, proposal) };
}

/** The latest proposal for a match as the viewer sees it, or null if there never was one. */
export async function latestProposal(
  db: D1Database,
  matchId: string,
  viewerId: string | null,
): Promise<DeletionProposalDTO | null> {
  const p = await db
    .prepare("SELECT * FROM deletion_proposals WHERE match_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(matchId)
    .first<ProposalRow>();
  if (!p) return null;
  const votes = await votesOf(db, p.id);
  const mine = votes.find((v) => v.player_id === viewerId);
  const proposer = await getPlayer(db, p.proposed_by);
  return {
    id: p.id,
    status: p.status,
    proposedBy: toPlayerDTO(proposer!),
    createdAt: p.created_at,
    yes: votes.filter((v) => v.vote === "yes").length,
    no: votes.filter((v) => v.vote === "no").length,
    eligible: votes.length,
    needed: majority(votes.length),
    myVote: mine?.vote ?? null,
    canVote: p.status === "open" && mine !== undefined,
  };
}
