/* Чтение инбокса руководителя экспертов Исполнителя.
 *
 * Отдельный файл, а не расширение db/inbox.ts: над инбоксом идут параллельные
 * ветки по ролям, и общий файл эксперта в них не правится — иначе три сессии
 * толкались бы в одном месте. Основная сессия при желании сольёт запросы в один.
 *
 * Почему запрос свой, а не строкиИнбокса(): у руководителя другая выборка.
 * Эксперту хватает пяти «своих» статусов, руководителю нужен весь реестр в его
 * границе видимости — сводка по команде считает и sent/review («У Заказчика»),
 * а значок блока «Сводка» показывает общее число рекомендаций, как в макете.
 * CTE тот же (`основа()`), поэтому control_kind и граница видимости не
 * пересчитываются вторым источником и числа сходятся с реестром.
 */

import { query } from './pool';
import { основа } from './recommendations';
import type { InboxRow } from './inbox';

export interface СтрокаИнбоксаРуководителя extends InboxRow {
  /** Когда Заказчик открыл карточку — для «карточку открыли …, решения нет»
      в блоке просроченных ответов. Эксперту это поле не нужно, поэтому его
      нет в InboxRow. */
  openedAt: Date | null;
}

export async function строкиИнбоксаРуководителя(): Promise<СтрокаИнбоксаРуководителя[]> {
  /* Без фильтра по статусам: закрытые и отклонённые тоже входят в общее число
     на значке «Сводки по команде». Спор о дате — той же LATERAL-веткой, что в
     db/inbox.ts: блок возражений — только про дату реализации, has_open_dispute
     из CTE шире (он считает и спор о базе). */
  const rows = await query<Record<string, unknown>>(`
    WITH base AS (${await основа()})
    SELECT base.*, r.created_at,
           dsp.opened_at AS dispute_opened_at,
           dsp.proposed_date AS dispute_proposed_date
    FROM base
    JOIN rec.recommendations r ON r.id = base.id
    LEFT JOIN LATERAL (
      SELECT d.opened_at, d.proposed_date FROM rec.disputes d
      WHERE d.rec_id = base.id AND d.state = 'open' AND d.subject = 'fact_date'
      ORDER BY d.opened_at DESC LIMIT 1
    ) dsp ON true
  `);

  return rows.map((r) => ({
    id: Number(r.id),
    number: r.number as string | null,
    status: r.status as string,
    statusName: r.status_name as string,
    tone: r.tone as string,
    filled: r.filled as boolean,
    showsSla: r.shows_sla as boolean,
    priority: r.priority_disp as string | null,
    slaHours: r.sla_hours === null ? null : Number(r.sla_hours),
    direction: r.direction as string,
    wellNumber: r.well_number as string,
    kust: r.kust as string | null,
    fieldName: r.field_name as string,
    problem: r.problem as string,
    executorName: r.executor_name as string | null,
    customerName: r.customer_name as string | null,
    createdAt: r.created_at as Date,
    registeredAt: r.registered_at as Date | null,
    sentAt: r.sent_at as Date | null,
    dueAt: r.due_at as Date | null,
    repliedAt: r.replied_at as Date | null,
    controlKind: r.control_kind as string,
    factDate: r.fact_date as Date | null,
    windowCloseAt: r.window_close_at as Date | null,
    disputeOpenedAt: r.dispute_opened_at as Date | null,
    disputeProposedDate: r.dispute_proposed_date as Date | null,
    openedAt: r.opened_at as Date | null,
  }));
}
