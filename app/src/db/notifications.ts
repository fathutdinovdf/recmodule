/* Уведомления: колокольчик и персистентный бейдж «непрочитано».
 *
 * Смена статуса рождает запись триггером (миграция 018) — здесь только чтение
 * и отметка «прочитано». Комментарий и упоминание вставляются отсюда явно, из
 * приёмника реплики: на момент вставки самого комментария список упомянутых
 * ещё не в базе (comment_mentions пишется отдельным запросом следом), а
 * разводить comment/mention по получателям надо сразу, одним взглядом на оба
 * списка — так проще, чем гадать в триггере, что вставилось раньше.
 */

import type { PoolClient } from 'pg';
import { query } from './pool';

export type NotificationType = 'mention' | 'comment' | 'status_change';

export interface NotificationRow {
  id: number;
  recId: number;
  recNumber: string | null;
  wellNumber: string | null;
  type: NotificationType;
  actorName: string;
  text: string | null;
  createdAt: Date;
  readAt: Date | null;
}

const РЯД = (r: Record<string, unknown>): NotificationRow => ({
  id: Number(r.id),
  recId: Number(r.rec_id),
  recNumber: r.rec_number as string | null,
  wellNumber: r.well_number as string | null,
  type: r.type as NotificationType,
  actorName: r.actor_name as string,
  text: r.text as string | null,
  createdAt: r.created_at as Date,
  readAt: r.read_at as Date | null,
});

/** Последние уведомления пользователя, свежие сверху — для колокольчика. */
export async function listNotifications(userId: number, limit = 50): Promise<NotificationRow[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT n.id, n.rec_id, r.number AS rec_number, r.well_number, n.type,
           n.actor_name, n.text, n.created_at, n.read_at
      FROM rec.notifications n
      JOIN rec.recommendations r ON r.id = n.rec_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2
  `, [userId, limit]);
  return rows.map(РЯД);
}

/** Сколько непрочитанного всего — число на самом колокольчике. */
export async function getUnreadCount(userId: number): Promise<number> {
  const rows = await query<{ n: string }>(`
    SELECT count(*)::text AS n FROM rec.notifications WHERE user_id = $1 AND read_at IS NULL
  `, [userId]);
  return Number(rows[0]?.n ?? 0);
}

/** Непрочитанное по одной рекомендации — для бейджа вкладки «Обсуждение». */
export async function getUnreadCountForRec(userId: number, recId: number): Promise<number> {
  const rows = await query<{ n: string }>(`
    SELECT count(*)::text AS n
      FROM rec.notifications
     WHERE user_id = $1 AND rec_id = $2 AND read_at IS NULL
  `, [userId, recId]);
  return Number(rows[0]?.n ?? 0);
}

export async function markRead(userId: number, id: number): Promise<void> {
  await query(`
    UPDATE rec.notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL
  `, [id, userId]);
}

export async function markAllRead(userId: number): Promise<void> {
  await query(`
    UPDATE rec.notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL
  `, [userId]);
}

/** Открыли вкладку «Обсуждение» — гасит непрочитанное по этой рекомендации. */
export async function markRecRead(userId: number, recId: number): Promise<void> {
  await query(`
    UPDATE rec.notifications
       SET read_at = now()
     WHERE user_id = $1 AND rec_id = $2 AND read_at IS NULL
  `, [userId, recId]);
}

/**
 * Уведомления по новой реплике: mention — точно упомянутым, comment — всем
 * остальным заинтересованным (см. правило получателей в миграции 018).
 * Вызывается из той же транзакции, что вставляет саму реплику и
 * comment_mentions, поэтому принимает клиента, а не берёт пул сама.
 */
export async function insertCommentNotifications(client: PoolClient, args: {
  recId: number;
  commentId: number;
  authorId: number;
  authorName: string;
  text: string;
  mentionedUserIds: number[];
}): Promise<void> {
  const { recId, commentId, authorId, authorName, text, mentionedUserIds } = args;

  if (mentionedUserIds.length) {
    await client.query(`
      INSERT INTO rec.notifications (user_id, rec_id, comment_id, type, actor_id, actor_name, text)
      SELECT u.id, $1, $2, 'mention', $3, $4, $5
        FROM rec.users u
       WHERE u.id = ANY($6::bigint[]) AND u.id <> $3
    `, [recId, commentId, authorId, authorName, text, mentionedUserIds]);
  }

  /* Заинтересованные минус автор и минус уже уведомлённые mention-ом: тем, кого
     упомянули, «упомянули вас» важнее общего «есть новый комментарий», и вторая
     запись о той же реплике была бы просто дублем. */
  await client.query(`
    INSERT INTO rec.notifications (user_id, rec_id, comment_id, type, actor_id, actor_name, text)
    SELECT u.id, $1, $2, 'comment', $3, $4, $5
      FROM rec.users u
     WHERE u.is_active
       AND u.id <> $3
       AND NOT (u.id = ANY($6::bigint[]))
       AND (
             u.role_key IN ('expert', 'expertLead')
          OR EXISTS (SELECT 1 FROM rec.comments c WHERE c.rec_id = $1 AND c.author_id = u.id)
       )
  `, [recId, commentId, authorId, authorName, text, mentionedUserIds]);
}
