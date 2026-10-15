/**
 * The bell. Notifications are rows the app reads with a plain GET, polled; a
 * player sees their own and marks them read.
 */
import type { NotificationDTO, NotificationType, NotificationsDTO } from "@maraffometro/shared";
import { playersById, toPlayerDTO } from "./players";

/** One statement that notifies every player in `to`, for use inside a batch. */
export function notify(
  db: D1Database,
  to: string[],
  type: NotificationType,
  matchId: string | null,
  actorId: string | null,
): D1PreparedStatement {
  const rows = to.map((player) => ({ id: crypto.randomUUID(), player }));
  return db
    .prepare(
      `INSERT INTO notifications (id, player_id, type, match_id, actor_id)
       SELECT json_extract(value, '$.id'), json_extract(value, '$.player'), ?1, ?2, ?3 FROM json_each(?4)`,
    )
    .bind(type, matchId, actorId, JSON.stringify(rows));
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  match_id: string | null;
  actor_id: string | null;
  created_at: string;
  read_at: string | null;
  played_at: string | null;
}

export async function listNotifications(db: D1Database, playerId: string, limit = 50): Promise<NotificationsDTO> {
  const [rows, unread] = await db.batch([
    db
      .prepare(
        `SELECT n.id, n.type, n.match_id, n.actor_id, n.created_at, n.read_at, m.played_at
           FROM notifications n LEFT JOIN matches m ON m.id = n.match_id
          WHERE n.player_id = ? ORDER BY n.created_at DESC LIMIT ?`,
      )
      .bind(playerId, limit),
    db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE player_id = ? AND read_at IS NULL").bind(playerId),
  ]);
  const items = rows!.results as NotificationRow[];
  const actors = await playersById(
    db,
    items.map((n) => n.actor_id).filter((id): id is string => id !== null),
  );
  return {
    unread: (unread!.results[0] as { n: number }).n,
    items: items.map(
      (n): NotificationDTO => ({
        id: n.id,
        type: n.type,
        createdAt: n.created_at,
        read: n.read_at !== null,
        actor: n.actor_id && actors.has(n.actor_id) ? toPlayerDTO(actors.get(n.actor_id)!) : null,
        match: n.match_id && n.played_at ? { id: n.match_id, playedAt: n.played_at } : null,
      }),
    ),
  };
}

/** Marks the given notifications read, or all of them when `ids` is omitted. */
export async function markRead(db: D1Database, playerId: string, ids?: string[]): Promise<void> {
  const now = new Date().toISOString();
  if (!ids) {
    await db
      .prepare("UPDATE notifications SET read_at = ? WHERE player_id = ? AND read_at IS NULL")
      .bind(now, playerId)
      .run();
    return;
  }
  if (ids.length === 0) return;
  await db
    .prepare(
      `UPDATE notifications SET read_at = ?1
        WHERE player_id = ?2 AND read_at IS NULL AND id IN (SELECT value FROM json_each(?3))`,
    )
    .bind(now, playerId, JSON.stringify(ids))
    .run();
}
