/* Чтение инбокса руководителя Заказчика.
 *
 * Отдельный файл рядом с db/inbox.ts, а не правка его: над инбоксами других
 * ролей идут параллельные ветки, и общий файл превратился бы в поле конфликтов.
 * CTE — тот же, что у реестра (`основа()` из recommendations.ts): граница
 * видимости и control_kind посчитаны в одном месте, и числа инбокса сходятся
 * с реестром после перехода по ссылке. Пересчитывать контроль ответа здесь
 * своим выражением было бы вторым источником истины.
 *
 * Черновики исключены явно: у руководителя Заказчика граница видимости пустая
 * («все объекты»), и без фильтра в сводку попадала бы внутренняя кухня
 * Исполнителя — черновик не имеет ни номера, ни даты регистрации и Заказчика
 * не касается вовсе.
 */

import { query } from './pool';
import { основа } from './recommendations';
import type { InboxRow } from './inbox';

/** Строка блока «Просроченные ответы»: к общей строке инбокса добавляется
 *  момент открытия карточки — «карточку открыли, решения нет» и «карточка ещё
 *  не открыта» для руководителя разные степени тревоги. */
export interface СтрокаПросрочки extends InboxRow {
  openedAt: Date | null;
}

/** Строка «Сводки по объектам»: объект × счётчики прохождения.
 *  Свод по объектам, а не по людям: ответственный Заказчика в модуле
 *  появляется только после открытия карточки, а до открытия рекомендация уже
 *  висит на объекте и уже тратит норматив. */
export interface СводкаОбъекта {
  объект: string;
  ждутРешения: number;
  просрочено: number;
  просроченоI: number;
  согласовано: number;
  оконОткрыто: number;
  /** Не колонка таблицы: из сумм по объектам собираются плитка «Срок ещё
      идёт» и значок блока — чтобы плитки и таблица считались по одному срезу. */
  срокИдёт: number;
  всего: number;
}

export interface ДанныеРуководителяЗаказчика {
  просроченные: СтрокаПросрочки[];
  сводка: СводкаОбъекта[];
}

export async function данныеРуководителяЗаказчика(): Promise<ДанныеРуководителяЗаказчика> {
  const base = await основа();

  /* Два запроса, не шесть: полные строки нужны только просроченным (их и
     показываем списком), остальное на экране — счётчики, и тянуть ради них
     строки значило бы гонять CTE по разу на плитку. Сортировка — «сначала
     горит»: самая давняя просрочка сверху, а рабочие часы монотонны по
     календарю, поэтому порядок по due_at совпадает с порядком по величине
     просрочки. */
  const [строки, объекты] = await Promise.all([
    query<Record<string, unknown>>(`
      WITH base AS (${base})
      SELECT base.*, r.created_at
      FROM base
      JOIN rec.recommendations r ON r.id = base.id
      WHERE base.control_kind = 'overdue'
      ORDER BY base.due_at
    `),
    query<Record<string, unknown>>(`
      WITH base AS (${base})
      SELECT
        base.field_name,
        count(*) FILTER (WHERE base.status IN ('sent', 'review'))    AS waiting_decision,
        count(*) FILTER (WHERE base.control_kind = 'overdue')        AS overdue,
        count(*) FILTER (WHERE base.control_kind = 'overdue'
                           AND base.priority_disp = 'I')             AS overdue_i,
        count(*) FILTER (WHERE base.status = 'approved')             AS approved,
        count(*) FILTER (WHERE base.status = 'windowOpen')           AS window_open,
        count(*) FILTER (WHERE base.control_kind = 'waiting')        AS waiting,
        count(*)                                                     AS total
      FROM base
      WHERE base.status <> 'draft'
      GROUP BY base.field_name
      ORDER BY overdue DESC, waiting_decision DESC, base.field_name
    `),
  ]);

  return {
    просроченные: строки.map((r) => ({
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
      /* Спора здесь быть не может: блок собирает только просроченные ответы,
         а спор о дате приходит уже после решения. Поля нужны лишь для формы
         InboxRow — строку рисует общий компонент страницы. */
      disputeOpenedAt: null,
      disputeProposedDate: null,
      openedAt: r.opened_at as Date | null,
    })),
    сводка: объекты.map((r) => ({
      объект: r.field_name as string,
      ждутРешения: Number(r.waiting_decision),
      просрочено: Number(r.overdue),
      просроченоI: Number(r.overdue_i),
      согласовано: Number(r.approved),
      оконОткрыто: Number(r.window_open),
      срокИдёт: Number(r.waiting),
      всего: Number(r.total),
    })),
  };
}
