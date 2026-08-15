/* Чтение карточки рекомендации.
 *
 * Отдельно от recommendations.ts: реестру нужна одна строка на рекомендацию и
 * ничего сверх, а карточке — всё, что к ней прицеплено (реализация, база,
 * споры). Один запрос «на все случаи» кормил бы реестр пятью JOIN-ами ради
 * данных, которые в таблице не показываются.
 */

import { cache } from 'react';
import { query } from './pool';

export interface CardImplementation {
  factDate: Date;
  fixedAt: Date;
  fixedByName: string;
  note: string | null;
  windowOpenAt: Date;
  windowCloseAt: Date;
  closedAt: Date | null;
  closedEarly: boolean;
}

export interface CardBaseline {
  id: number;
  baseQzh: number | null;
  baseQn: number | null;
  baseEe: number | null;
  source: 'manual' | 'measured' | 'disputed';
  periodFrom: Date | null;
  periodTo: Date | null;
  status: 'accepted' | 'proposed' | 'rejected' | 'superseded';
  createdAt: Date;
  authorName: string;
  note: string | null;
}

export interface CardDispute {
  id: number;
  subject: 'fact_date' | 'baseline';
  openedAt: Date;
  openedByName: string;
  reason: string;
  proposedDate: Date | null;
  proposedBaselineId: number | null;
  state: 'open' | 'accepted' | 'rejected';
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export interface CardDecision {
  kind: 'accept' | 'reject' | 'clarify';
  at: Date;
  actorName: string;
  /** Причина отказа из справочника; у принятия и уточнения пустая. */
  reasonText: string | null;
  /** Свободный текст: обоснование отказа, вопрос уточнения, комментарий к принятию. */
  comment: string | null;
  plannedAt: Date | null;
  /** Израсходовано рабочих часов норматива к моменту ответа. */
  slaSpent: number | null;
}

export interface Card {
  id: number;
  number: string | null;
  status: string;
  statusName: string;
  tone: string;
  filled: boolean;
  showsSla: boolean;
  priority: string | null;
  priorityName: string | null;
  slaHours: number | null;
  direction: string;
  wellId: number | null;
  wellNumber: string;
  kust: string | null;
  fieldId: number | null;
  fieldName: string;
  problem: string;
  action: string;
  rationale: string | null;
  expectQzh: number | null;
  expectQn: number | null;
  expectEe: number | null;
  completeness: 'full' | 'partial' | null;
  completenessNote: string | null;
  authorName: string;
  executorName: string | null;
  /* Ответственный Заказчика — это тот, кто принял решение последнего круга:
     отдельного поля у рекомендации нет и быть не должно, ответственным
     становятся действием, а не назначением. */
  customerName: string | null;
  registeredAt: Date | null;
  sentAt: Date | null;
  dueAt: Date | null;
  /** Остаток норматива после запроса уточнения: таймер продолжается, а не начинается заново. */
  slaHoursLeft: number | null;
  /* Момент, когда Заказчик впервые открыл карточку. Фиксируется отдельно от
     ответа: договорный норматив меряет ответ, но по разрыву между открытием и
     ответом видно, читали рекомендацию или подписали не глядя. */
  openedAt: Date | null;
  repliedAt: Date | null;
  decision: CardDecision | null;
  commentsCount: number;
  attachmentsCount: number;
  implementation: CardImplementation | null;
  /** Действующая база — последняя принятая версия. */
  baseline: CardBaseline | null;
  /* Все версии базы, новые сверху: замещённые и отклонённые нужны, чтобы
     показать разобранный спор — что было до него и что стало после. Список
     короткий (обычно одна-две записи), и он уже прочитан ради действующей. */
  baselines: CardBaseline[];
  disputes: CardDispute[];
}

const число = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/* Обёрнуто в cache(): карточку читают и оболочка, и страница вкладки, а это
   один и тот же запрос в одном и том же рендере. Без обёртки он уходил бы в
   базу дважды на каждое открытие. */
export const getCard = cache(async (id: number): Promise<Card | null> => {
  const rows = await query<Record<string, unknown>>(`
    SELECT r.id, r.number, r.status, s.name AS status_name, s.tone, s.filled, s.shows_sla,
           r.priority, p.name AS priority_name, p.response_hours AS sla_hours,
           d.name AS direction,
           r.well_id, r.well_number, r.kust, r.field_id, r.field_name,
           r.problem, r.action, r.rationale,
           r.expect_qzh, r.expect_qn, r.expect_ee,
           r.completeness, r.completeness_note,
           u.full_name AS author_name, ex.full_name AS executor_name,
           r.registered_at, r.sent_at, r.due_at, r.sla_hours_left,
           dec.kind AS decision_kind, dec.at AS replied_at, dec.actor_name AS customer_name,
           dec.reason_text, dec.comment, dec.planned_at, dec.sla_spent,
           (SELECT min(e.at) FROM rec.recommendation_events e
             WHERE e.rec_id = r.id AND e.kind = 'opened') AS opened_at,
           (SELECT count(*) FROM rec.comments c WHERE c.rec_id = r.id AND c.deleted_at IS NULL) AS comments_count,
           (SELECT count(*) FROM rec.attachments a WHERE a.rec_id = r.id) AS attachments_count
    FROM rec.recommendations r
    JOIN rec.statuses s   ON s.code = r.status
    JOIN rec.directions d ON d.id = r.direction_id
    JOIN rec.users u      ON u.id = r.author_id
    LEFT JOIN rec.users ex     ON ex.id = r.executor_id
    LEFT JOIN rec.priorities p ON p.code = r.priority
    LEFT JOIN LATERAL (
      SELECT d2.kind, d2.at, d2.actor_name, d2.reason_text, d2.comment,
             d2.planned_at, d2.sla_spent
      FROM rec.decisions d2
      WHERE d2.rec_id = r.id ORDER BY d2.at DESC LIMIT 1
    ) dec ON true
    WHERE r.id = $1 AND r.deleted_at IS NULL
  `, [id]);

  const r = rows[0];
  if (!r) return null;

  const [impl, baselines, disputes] = await Promise.all([
    query<Record<string, unknown>>(`
      SELECT fact_date, fixed_at, fixed_by_name, note,
             window_open_at, window_close_at, closed_at, closed_early
      FROM rec.implementations WHERE rec_id = $1
    `, [id]),
    query<Record<string, unknown>>(`
      SELECT id, base_qzh, base_qn, base_ee, source, period_from, period_to,
             status, created_at, author_name, note
      FROM rec.baselines WHERE rec_id = $1 ORDER BY created_at DESC, id DESC
    `, [id]),
    query<Record<string, unknown>>(`
      SELECT id, subject, opened_at, opened_by_name, reason, proposed_date,
             proposed_baseline_id, state, resolved_at, resolution_note
      FROM rec.disputes WHERE rec_id = $1 ORDER BY opened_at DESC
    `, [id]),
  ]);

  const базы = baselines.map(разобратьБазу);

  return {
    id: Number(r.id),
    number: r.number as string | null,
    status: r.status as string,
    statusName: r.status_name as string,
    tone: r.tone as string,
    filled: r.filled as boolean,
    showsSla: r.shows_sla as boolean,
    priority: r.priority as string | null,
    priorityName: r.priority_name as string | null,
    slaHours: число(r.sla_hours),
    direction: r.direction as string,
    wellId: число(r.well_id),
    wellNumber: r.well_number as string,
    kust: r.kust as string | null,
    fieldId: число(r.field_id),
    fieldName: r.field_name as string,
    problem: r.problem as string,
    action: r.action as string,
    rationale: r.rationale as string | null,
    expectQzh: число(r.expect_qzh),
    expectQn: число(r.expect_qn),
    expectEe: число(r.expect_ee),
    completeness: r.completeness as 'full' | 'partial' | null,
    completenessNote: r.completeness_note as string | null,
    authorName: r.author_name as string,
    executorName: r.executor_name as string | null,
    customerName: r.customer_name as string | null,
    registeredAt: r.registered_at as Date | null,
    sentAt: r.sent_at as Date | null,
    dueAt: r.due_at as Date | null,
    slaHoursLeft: число(r.sla_hours_left),
    openedAt: r.opened_at as Date | null,
    repliedAt: r.replied_at as Date | null,
    decision: r.decision_kind ? {
      kind: r.decision_kind as CardDecision['kind'],
      at: r.replied_at as Date,
      actorName: r.customer_name as string,
      reasonText: r.reason_text as string | null,
      comment: r.comment as string | null,
      plannedAt: r.planned_at as Date | null,
      slaSpent: число(r.sla_spent),
    } : null,
    commentsCount: Number(r.comments_count),
    attachmentsCount: Number(r.attachments_count),
    implementation: impl[0] ? {
      factDate: impl[0].fact_date as Date,
      fixedAt: impl[0].fixed_at as Date,
      fixedByName: impl[0].fixed_by_name as string,
      note: impl[0].note as string | null,
      windowOpenAt: impl[0].window_open_at as Date,
      windowCloseAt: impl[0].window_close_at as Date,
      closedAt: impl[0].closed_at as Date | null,
      closedEarly: impl[0].closed_early as boolean,
    } : null,
    /* Действующей считается последняя принятая версия. Предложенные в споре
       версии лежат в том же списке, но расчёт по ним не идёт, пока спор открыт. */
    baseline: базы.find((b) => b.status === 'accepted') ?? null,
    baselines: базы,
    disputes: disputes.map((d) => ({
      id: Number(d.id),
      subject: d.subject as 'fact_date' | 'baseline',
      openedAt: d.opened_at as Date,
      openedByName: d.opened_by_name as string,
      reason: d.reason as string,
      proposedDate: d.proposed_date as Date | null,
      proposedBaselineId: число(d.proposed_baseline_id),
      state: d.state as 'open' | 'accepted' | 'rejected',
      resolvedAt: d.resolved_at as Date | null,
      resolutionNote: d.resolution_note as string | null,
    })),
  };
});

function разобратьБазу(b: Record<string, unknown>): CardBaseline {
  return {
    id: Number(b.id),
    baseQzh: число(b.base_qzh),
    baseQn: число(b.base_qn),
    baseEe: число(b.base_ee),
    source: b.source as CardBaseline['source'],
    periodFrom: b.period_from as Date | null,
    periodTo: b.period_to as Date | null,
    status: b.status as CardBaseline['status'],
    createdAt: b.created_at as Date,
    authorName: b.author_name as string,
    note: b.note as string | null,
  };
}

/** Одна версия базы по идентификатору — нужна, чтобы показать предложенную в споре. */
export async function getBaseline(id: number): Promise<CardBaseline | null> {
  const rows = await query<Record<string, unknown>>(`
    SELECT id, base_qzh, base_qn, base_ee, source, period_from, period_to,
           status, created_at, author_name, note
    FROM rec.baselines WHERE id = $1
  `, [id]);
  return rows[0] ? разобратьБазу(rows[0]) : null;
}

export interface Neighbours {
  prevId: number | null;
  nextId: number | null;
  pos: number;
  total: number;
}

/**
 * Соседи по реестру для листалки в шапке.
 *
 * Порядок — тот же, что в реестре по умолчанию: новые сверху. Фильтры и
 * сортировка экрана сюда пока не доходят — ссылка из реестра их не несёт;
 * когда понесёт, выборка подставится вместо этого запроса, а разметка шапки
 * не изменится.
 */
export async function getNeighbours(id: number): Promise<Neighbours> {
  const rows = await query<Record<string, unknown>>(`
    WITH ordered AS (
      SELECT id,
             lag(id)  OVER w AS prev_id,
             lead(id) OVER w AS next_id,
             row_number() OVER w AS pos,
             count(*) OVER () AS total
      FROM rec.recommendations
      WHERE deleted_at IS NULL
      WINDOW w AS (ORDER BY registered_at DESC NULLS FIRST, id DESC)
    )
    SELECT prev_id, next_id, pos, total FROM ordered WHERE id = $1
  `, [id]);

  const r = rows[0];
  if (!r) return { prevId: null, nextId: null, pos: 0, total: 0 };
  return {
    prevId: число(r.prev_id),
    nextId: число(r.next_id),
    pos: Number(r.pos),
    total: Number(r.total),
  };
}

export interface WellHistoryItem {
  id: number;
  number: string | null;
  statusName: string;
  registeredAt: Date | null;
  problem: string;
}

/**
 * Ранее по этой скважине — история объекта для правой колонки.
 *
 * Черновики не попадают: у черновика нет ни номера, ни даты регистрации, и в
 * реестре его видит только автор.
 */
export async function getWellHistory(wellNumber: string, fieldId: number | null, exceptId: number): Promise<{
  items: WellHistoryItem[]; total: number;
}> {
  const rows = await query<Record<string, unknown>>(`
    SELECT r.id, r.number, s.name AS status_name, r.registered_at, r.problem,
           count(*) OVER () AS total
    FROM rec.recommendations r
    JOIN rec.statuses s ON s.code = r.status
    WHERE r.deleted_at IS NULL AND r.status <> 'draft'
      AND r.well_number = $1 AND r.field_id IS NOT DISTINCT FROM $2 AND r.id <> $3
    ORDER BY r.registered_at DESC NULLS LAST
    LIMIT 5
  `, [wellNumber, fieldId, exceptId]);

  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    items: rows.map((r) => ({
      id: Number(r.id),
      number: r.number as string | null,
      statusName: r.status_name as string,
      registeredAt: r.registered_at as Date | null,
      problem: r.problem as string,
    })),
  };
}
