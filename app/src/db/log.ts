/* Хронология рекомендации: события и реплики одной лентой.
 *
 * Отдельно от card.ts намеренно. Карточке лента не нужна ни на одной другой
 * вкладке — там берут последнее состояние, а не путь к нему, — и тянуть
 * десятки строк истории в каждый рендер сводки незачем.
 *
 * Почему одна лента, а не две вкладки. Спорная ситуация по разделу 10
 * договора разбирается по одной хронологии: важно не только что произошло,
 * но и что стороны при этом писали. Разложенные по разным спискам, эти два
 * ряда пришлось бы сшивать глазами по времени.
 *
 * Внутренних заметок нет: всё, что здесь написано, видят обе стороны.
 */

import { query } from './pool';

/** Сторона автора записи. `system` — то, что сделал не человек, а регламент. */
export type LogSide = 'executor' | 'customer' | 'system';

export interface LogAttachment {
  id: number;
  fileName: string;
  sizeBytes: number | null;
}

export interface LogEntry {
  /** Составной ключ: id уникален внутри своей таблицы, но не между ними. */
  key: string;
  at: Date;
  /** `talk` — реплика человека, остальное — событие процесса. */
  kind: 'talk' | 'status' | 'decision' | 'fact' | 'dispute' | 'link' | 'opened' | string;
  actorName: string;
  side: LogSide;
  text: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  /** Имя статуса из справочника — для события смены статуса. */
  toStatusName: string | null;
  /** Своя ли это запись: по ней подсвечивается только что отправленная реплика. */
  own: boolean;
  /** Файлы при реплике. У событий пусто. */
  attachments: LogAttachment[];
  /** Кого упомянули: имена подсвечиваются в тексте реплики. */
  mentions: string[];
}

/**
 * Лента рекомендации по возрастанию времени.
 *
 * Сторона берётся из `rec.users`, а не из текста события: автор мог сменить
 * должность, но сторона договора у записи та, что была в момент действия —
 * пользователей между сторонами не переводят.
 *
 * События без автора (их пишет регламент — открытие окна, автопередача)
 * приходят стороной `system`: подписывать их живым именем было бы неправдой.
 */
/* Вложения и упоминания подтягиваются к реплике агрегатами, а не отдельными
   запросами: реплик в ленте десятки, и цикл по ним дал бы столько же походов
   в базу ради двух коротких списков. */
const РЕПЛИКА = `
  SELECT 'c' || c.id      AS key,
         c.at             AS at,
         'talk'           AS kind,
         c.author_name    AS actor_name,
         u.side           AS side,
         c.text           AS text,
         NULL             AS from_status,
         NULL             AS to_status,
         NULL             AS to_status_name,
         (c.author_id = $2) AS own,
         COALESCE((SELECT json_agg(json_build_object(
                     'id', a.id, 'fileName', a.file_name, 'sizeBytes', a.size_bytes)
                     ORDER BY a.id)
                     FROM rec.attachments a WHERE a.comment_id = c.id), '[]'::json) AS attachments,
         COALESCE((SELECT json_agg(mu.full_name ORDER BY mu.full_name)
                     FROM rec.comment_mentions m
                     JOIN rec.users mu ON mu.id = m.user_id
                    WHERE m.comment_id = c.id), '[]'::json) AS mentions
    FROM rec.comments c
    JOIN rec.users u ON u.id = c.author_id
   WHERE c.deleted_at IS NULL`;

export async function getLog(recId: number, viewerId: number | null): Promise<LogEntry[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT 'e' || e.id            AS key,
           e.at                   AS at,
           e.kind                 AS kind,
           e.actor_name           AS actor_name,
           u.side                 AS side,
           e.text                 AS text,
           e.from_status          AS from_status,
           e.to_status            AS to_status,
           s.name                 AS to_status_name,
           (e.actor_id = $2)      AS own,
           '[]'::json             AS attachments,
           '[]'::json             AS mentions
      FROM rec.recommendation_events e
      LEFT JOIN rec.users u    ON u.id = e.actor_id
      LEFT JOIN rec.statuses s ON s.code = e.to_status
     WHERE e.rec_id = $1

    UNION ALL
    ${РЕПЛИКА} AND c.rec_id = $1

     ORDER BY at, key
  `, [recId, viewerId]);

  return rows.map(разобрать);
}

/**
 * Одна реплика — для живой ленты: SSE приносит только её номер, текст
 * подписчик перечитывает сам (почему так — в миграции 006).
 */
export async function getComment(commentId: number, viewerId: number | null): Promise<LogEntry | null> {
  const rows = await query<Record<string, unknown>>(
    `${РЕПЛИКА} AND c.id = $1`, [commentId, viewerId]);
  return rows[0] ? разобрать(rows[0]) : null;
}

/* Ветка реплики в UNION идёт без псевдонимов колонок — их задаёт первая
   ветка, — поэтому разбор один на оба случая и по позициям не гадает. */
function разобрать(r: Record<string, unknown>): LogEntry {
  return {
    key: r.key as string,
    at: r.at as Date,
    kind: r.kind as LogEntry['kind'],
    actorName: r.actor_name as string,
    side: (r.side as LogSide | null) ?? 'system',
    text: r.text as string | null,
    fromStatus: r.from_status as string | null,
    toStatus: r.to_status as string | null,
    toStatusName: r.to_status_name as string | null,
    own: r.own === true,
    attachments: (r.attachments as LogAttachment[] | null) ?? [],
    mentions: (r.mentions as string[] | null) ?? [],
  };
}
