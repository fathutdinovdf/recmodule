/* Дочитка инбокса инженера Заказчика: рекомендации на решении (sent/review).
 *
 * Отдельный файл, а не правка db/inbox.ts: над инбоксами других ролей идут
 * параллельные ветки, и общий файл превратил бы их в конфликт. Запрос —
 * поверх той же `основа()` из recommendations.ts, что и реестр с инбоксом
 * эксперта: граница видимости и control_kind посчитаны в одном месте, и числа
 * блоков сходятся с реестром по построению, а не по договорённости.
 *
 * Почему дочитка вообще нужна: строкиИнбокса() собраны под эксперта и статусы
 * sent/review не возвращают — а у инженера именно они и есть «ход за мной»
 * (норматив ответа тикает только на них). Плюс блоку просрочки нужен момент
 * открытия карточки (opened_at из CTE), которого в InboxRow нет: «карточку
 * открыли, решения нет» и «карточка ещё не открыта» — разные упрёки.
 */

import { query } from './pool';
import { основа } from './recommendations';
import type { InboxRow } from './inbox';

export interface СтрокаНаРешении extends InboxRow {
  /** Когда Заказчик впервые открыл карточку; null — ещё не открывал. */
  openedAt: Date | null;
}

export async function строкиНаРешении(): Promise<СтрокаНаРешении[]> {
  /* created_at в CTE нет (реестру он не нужен), а InboxRow его требует —
     поэтому JOIN на саму таблицу, тем же приёмом, что в строкиИнбокса(). */
  const rows = await query<Record<string, unknown>>(`
    WITH base AS (${await основа()})
    SELECT base.*, r.created_at
    FROM base
    JOIN rec.recommendations r ON r.id = base.id
    WHERE base.status IN ('sent', 'review')
  `);

  /* Раскладка полей повторяет строкиИнбокса(): маппер там не экспортирован,
     а расширять общий файл из параллельной ветки нельзя (см. шапку). */
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
    /* Спор о дате в блоках инженера не участвует (это ход Исполнителя),
       поля оставлены пустыми ради совместимости с InboxRow. */
    disputeOpenedAt: null,
    disputeProposedDate: null,
    openedAt: r.opened_at as Date | null,
  }));
}
