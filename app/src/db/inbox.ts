/* Чтение инбокса «Мои задачи».
 *
 * Один запрос на весь экран, а не по запросу на блок: инбокс эксперта ограничен
 * его собственными рекомендациями (граница видимости с onlyOwn), это десятки
 * строк, и делить их на шесть обращений к базе значило бы шесть раз погонять
 * один и тот же CTE. Раскладку по блокам и сортировку внутри блока делает
 * страница — это правила экрана, а не данных.
 *
 * CTE — тот же, что у реестра (`основа()` из recommendations.ts): граница
 * видимости и control_kind посчитаны в одном месте, и число задач в инбоксе
 * сходится с тем, что человек увидит в реестре после перехода по ссылке.
 * Пересчитывать контроль ответа здесь своим выражением было бы вторым
 * источником истины (перенесено из макета, см. комментарий в макет/inbox.js).
 */

import { query } from './pool';
import { основа } from './recommendations';

export interface InboxRow {
  id: number;
  number: string | null;
  status: string;
  statusName: string;
  tone: string;
  filled: boolean;
  showsSla: boolean;
  priority: string | null;
  slaHours: number | null;
  direction: string;
  wellNumber: string;
  kust: string | null;
  fieldName: string;
  problem: string;
  executorName: string | null;
  /** Кто со стороны Заказчика принял последнее решение (для «Заказчик: …» в уточнении). */
  customerName: string | null;
  /** Момент создания записи — у черновика это единственная дата вообще. */
  createdAt: Date;
  registeredAt: Date | null;
  sentAt: Date | null;
  dueAt: Date | null;
  /** Момент последнего решения Заказчика: запрос уточнения, согласование. */
  repliedAt: Date | null;
  controlKind: string;
  factDate: Date | null;
  windowCloseAt: Date | null;
  /** Открытый спор именно о дате реализации (has_open_dispute из CTE шире —
      он считает и спор о базе, а блок инбокса — только про дату). */
  disputeOpenedAt: Date | null;
  disputeProposedDate: Date | null;
}

/* Статусы, из которых собираются блоки эксперта. Спор о дате приходит поверх
   любого статуса (чаще windowOpen), поэтому он в условии отдельной веткой. */
const СТАТУСЫ_ЭКСПЕРТА = ['clarify', 'draft', 'registered', 'approved', 'windowOpen'];

export async function строкиИнбокса(): Promise<InboxRow[]> {
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
    WHERE base.status = ANY($1) OR dsp.opened_at IS NOT NULL
  `, [СТАТУСЫ_ЭКСПЕРТА]);

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
  }));
}

/* Роли, у которых в page.tsx есть билдер инбокса. Значок навигации показываем
   только им: у роли без собранного инбокса число не значило бы ничего, а у
   администратора инбокса нет вовсе (решение 82). */
const РОЛИ_С_ИНБОКСОМ = ['expert'];

/** Число на значке «Мои задачи» в левой навигации. Считаются только блоки
 *  «ход за мной» (hot/warn): уточнения, открытые споры о дате, черновики —
 *  наблюдательные блоки в значок не входят, иначе он показывал бы объём
 *  ведения, а не число дел на сегодня (см. макет/inbox.js). Отдельный COUNT,
 *  а не строкиИнбокса(): значок стоит на каждой странице, тянуть ради него
 *  полные строки всех блоков — лишнее. */
export async function счётчикИнбокса(role: string): Promise<number | null> {
  if (!РОЛИ_С_ИНБОКСОМ.includes(role)) return null;
  const rows = await query<{ n: string }>(`
    WITH base AS (${await основа()})
    SELECT count(*) AS n
    FROM base
    WHERE base.status IN ('clarify', 'draft')
       OR EXISTS (
         SELECT 1 FROM rec.disputes d
         WHERE d.rec_id = base.id AND d.state = 'open' AND d.subject = 'fact_date'
       )
  `);
  return Number(rows[0].n);
}

/** Значение из справочника «Параметры модуля» (решение 81): пороги тревоги —
 *  настройка, а не константа в коде. Отсутствующий ключ — ошибка развёртывания,
 *  и молчаливое умолчание её бы прятало, поэтому падаем. */
export async function параметрМодуля(key: string): Promise<number> {
  const rows = await query<{ value: string }>(
    'SELECT value FROM rec.module_params WHERE key = $1', [key],
  );
  if (!rows.length) throw new Error(`В rec.module_params нет ключа «${key}»`);
  return Number(rows[0].value);
}
