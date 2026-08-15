/* Чтение реестра рекомендаций. */

import { query } from './pool';

export interface StatusRef {
  code: string;
  name: string;
  tone: string;
  filled: boolean;
  showsSla: boolean;
  sortOrder: number;
}

export interface RecommendationRow {
  id: number;
  number: string | null;
  status: string;
  statusName: string;
  tone: string;
  filled: boolean;
  showsSla: boolean;
  priority: string | null;
  direction: string;
  wellId: number | null;
  wellNumber: string;
  kust: string | null;
  fieldId: number | null;
  fieldName: string;
  problem: string;
  action: string;
  completeness: string | null;
  registeredAt: Date | null;
  sentAt: Date | null;
  dueAt: Date | null;
  authorName: string;
  executorName: string | null;
  /** Решение Заказчика последнего круга и когда оно принято. */
  decisionKind: string | null;
  repliedAt: Date | null;
  slaHours: number | null;
  commentsCount: number;
  /* Есть ли незакрытый спор — по нему в реестре ставится пометка: расчёт
     эффекта по такой рекомендации считается предварительным. */
  hasOpenDispute: boolean;
  windowOpenAt: Date | null;
  windowCloseAt: Date | null;
}

export interface AnalogRecommendation {
  id: number;
  number: string;
  statusName: string;
  tone: string;
  filled: boolean;
  wellNumber: string;
  fieldName: string;
  problem: string;
  completeness: 'full' | 'partial' | null;
  registeredAt: Date;
}

/** Последний опыт по тому же направлению на других скважинах (решение 88). */
export async function listAnalogs(recId: number, limit = 5): Promise<AnalogRecommendation[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT r.id, r.number, s.name AS status_name, s.tone, s.filled,
           r.well_number, r.field_name, r.problem, r.completeness, r.registered_at
    FROM rec.recommendations r
    JOIN rec.statuses s ON s.code = r.status
    JOIN rec.recommendations current ON current.id = $1
    WHERE r.deleted_at IS NULL
      AND r.status <> 'draft'
      AND r.registered_at IS NOT NULL
      AND r.direction_id = current.direction_id
      AND NOT (
        r.well_number = current.well_number
        AND r.field_id IS NOT DISTINCT FROM current.field_id
      )
    ORDER BY r.registered_at DESC, r.id DESC
    LIMIT $2
  `, [recId, limit]);

  return rows.map((r) => ({
    id: Number(r.id),
    number: r.number as string,
    statusName: r.status_name as string,
    tone: r.tone as string,
    filled: r.filled as boolean,
    wellNumber: r.well_number as string,
    fieldName: r.field_name as string,
    problem: r.problem as string,
    completeness: r.completeness as 'full' | 'partial' | null,
    registeredAt: r.registered_at as Date,
  }));
}

export async function listStatuses(): Promise<StatusRef[]> {
  const rows = await query<{
    code: string; name: string; tone: string; filled: boolean;
    shows_sla: boolean; sort_order: number;
  }>('SELECT code, name, tone, filled, shows_sla, sort_order FROM rec.statuses ORDER BY sort_order');
  return rows.map((r) => ({
    code: r.code, name: r.name, tone: r.tone, filled: r.filled,
    showsSla: r.shows_sla, sortOrder: r.sort_order,
  }));
}

export interface ListFilter {
  statuses?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listRecommendations(filter: ListFilter = {}): Promise<{
  rows: RecommendationRow[]; total: number;
}> {
  const условия: string[] = ['r.deleted_at IS NULL'];
  const параметры: unknown[] = [];

  if (filter.statuses?.length) {
    параметры.push(filter.statuses);
    условия.push(`r.status = ANY($${параметры.length})`);
  }
  if (filter.search) {
    параметры.push(`%${filter.search.trim()}%`);
    const i = параметры.length;
    /* Ищем по номеру, скважине и месторождению: именно этими тремя способами
       рекомендацию называют в переписке и на планёрке. */
    условия.push(`(r.number ILIKE $${i} OR r.well_number ILIKE $${i} OR r.field_name ILIKE $${i})`);
  }

  const где = условия.join(' AND ');

  const [{ count }] = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM rec.recommendations r WHERE ${где}`, параметры);

  параметры.push(filter.limit ?? 50);
  параметры.push(filter.offset ?? 0);

  const rows = await query<Record<string, unknown>>(`
    SELECT r.id, r.number, r.status, s.name AS status_name, s.tone, s.filled,
           s.shows_sla, r.priority, d.name AS direction,
           r.well_id, r.well_number, r.kust, r.field_id, r.field_name,
           r.problem, r.action, r.completeness,
           r.registered_at, r.sent_at, r.due_at,
           u.full_name AS author_name,
           ex.full_name AS executor_name,
           p.response_hours AS sla_hours,
           dec.kind AS decision_kind, dec.at AS replied_at,
           (SELECT count(*) FROM rec.comments c WHERE c.rec_id = r.id AND c.deleted_at IS NULL) AS comments_count,
           EXISTS (SELECT 1 FROM rec.disputes ds WHERE ds.rec_id = r.id AND ds.state = 'open') AS has_open_dispute,
           i.window_open_at, i.window_close_at
    FROM rec.recommendations r
    JOIN rec.statuses s   ON s.code = r.status
    JOIN rec.directions d ON d.id = r.direction_id
    JOIN rec.users u      ON u.id = r.author_id
    LEFT JOIN rec.users ex ON ex.id = r.executor_id
    LEFT JOIN rec.priorities p ON p.code = r.priority
    LEFT JOIN rec.implementations i ON i.rec_id = r.id
    LEFT JOIN LATERAL (
      SELECT d2.kind, d2.at FROM rec.decisions d2
      WHERE d2.rec_id = r.id ORDER BY d2.at DESC LIMIT 1
    ) dec ON true
    WHERE ${где}
    ORDER BY r.registered_at DESC NULLS FIRST, r.id DESC
    LIMIT $${параметры.length - 1} OFFSET $${параметры.length}
  `, параметры);

  return {
    total: Number(count),
    rows: rows.map((r) => ({
      id: Number(r.id),
      number: r.number as string | null,
      status: r.status as string,
      statusName: r.status_name as string,
      tone: r.tone as string,
      filled: r.filled as boolean,
      showsSla: r.shows_sla as boolean,
      priority: r.priority as string | null,
      direction: r.direction as string,
      wellId: r.well_id === null ? null : Number(r.well_id),
      wellNumber: r.well_number as string,
      kust: r.kust as string | null,
      fieldId: r.field_id === null ? null : Number(r.field_id),
      fieldName: r.field_name as string,
      problem: r.problem as string,
      action: r.action as string,
      completeness: r.completeness as string | null,
      registeredAt: r.registered_at as Date | null,
      sentAt: r.sent_at as Date | null,
      dueAt: r.due_at as Date | null,
      authorName: r.author_name as string,
      executorName: r.executor_name as string | null,
      decisionKind: r.decision_kind as string | null,
      repliedAt: r.replied_at as Date | null,
      slaHours: r.sla_hours === null ? null : Number(r.sla_hours),
      commentsCount: Number(r.comments_count),
      hasOpenDispute: r.has_open_dispute as boolean,
      windowOpenAt: r.window_open_at as Date | null,
      windowCloseAt: r.window_close_at as Date | null,
    })),
  };
}

/** Счётчики для плиток над таблицей. */
export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await query<{ status: string; n: string }>(`
    SELECT status, count(*)::text AS n FROM rec.recommendations
    WHERE deleted_at IS NULL GROUP BY status
  `);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}
