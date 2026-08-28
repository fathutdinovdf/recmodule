/* Справочники, которые подставляются в формы, и данные экрана «Справочники».
 *
 * Причины отказа и причины уточнения лежат разными таблицами, а не одной с
 * типом: списки живут независимо, и общий справочник пришлось бы всё время
 * фильтровать. Архивированные позиции не выдаются — их нельзя выбрать заново,
 * но в старых решениях они остаются: там хранится текст, а не ссылка.
 */

import { query } from './pool';
import { ПЛИТКИ_СТАТУСЫ } from './recommendations';

export interface Ref {
  id: number;
  name: string;
}

export async function getRejectReasons(): Promise<Ref[]> {
  const rows = await query<{ id: number; name: string }>(`
    SELECT id, name FROM rec.reject_reasons WHERE archived_at IS NULL ORDER BY sort_order
  `);
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

/* ========================== экран «Справочники» ==========================
 *
 * Счётчик использования считается по базе, а не задаётся руками: «сколько
 * рекомендаций ссылается на значение» — единственное, на чём держится вся
 * логика архивирования, и разойтись с реестром оно не имеет права.
 */

/** Строка редактируемого справочника (направления, причины). */
export interface RefRow {
  id: number;
  name: string;
  archived: boolean;
  /** Сколько раз значение использовано; null — считать не по чему
      (см. комментарии у refClarifyReasons). */
  uses: number | null;
}

export interface PriorityRow {
  code: string;
  name: string;
  hours: number;
  uses: number;
  /** Рекомендации, у которых норматив ещё идёт (статусы с shows_sla):
      правка норматива пересчитает контроль ответа именно у них. */
  open: number;
}

export interface StatusRow {
  code: string;
  n: number;
  name: string;
  tone: string;
  filled: boolean;
  tile: string;
  uses: number;
}

export interface DecisionRow {
  kind: string;
  name: string;
  next: string;
  uses: number;
}

export interface CompletenessRow {
  key: string;
  name: string;
  note: string;
  uses: number;
}

export interface FieldRow {
  fieldId: number;
  fieldName: string;
  kusts: number;
  wells: number;
  recs: number;
}

export interface RefChangeRow {
  id: number;
  /** ISO: Date не переживает границу серверного и клиентского компонента. */
  at: string;
  actorName: string;
  ref: string;
  objectName: string;
  action: 'add' | 'rename' | 'update' | 'archive' | 'restore';
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
}

const число = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

async function считать(sql: string): Promise<Map<string, number>> {
  const rows = await query<{ k: string | null; n: string }>(sql);
  const m = new Map<string, number>();
  for (const r of rows) if (r.k !== null) m.set(String(r.k), Number(r.n));
  return m;
}

async function редактируемый(
  table: 'directions' | 'reject_reasons' | 'clarify_reasons',
  uses: Map<string, number> | null,
  byId: boolean,
): Promise<RefRow[]> {
  const rows = await query<{ id: number; name: string; archived_at: string | null }>(`
    SELECT id, name, archived_at FROM rec.${table} ORDER BY sort_order, id
  `);
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    archived: r.archived_at !== null,
    uses: uses === null ? null : число(uses.get(byId ? String(r.id) : r.name)),
  }));
}

export async function refDirections(): Promise<RefRow[]> {
  const uses = await считать(`
    SELECT direction_id::text AS k, count(*) AS n
    FROM rec.recommendations WHERE deleted_at IS NULL GROUP BY 1
  `);
  return редактируемый('directions', uses, true);
}

/* Решение хранит ТЕКСТ причины, а не ссылку (rec.decisions.reason_text):
   архивированная причина остаётся в старых решениях как есть. Поэтому счётчик
   считается по совпадению текста — после переименования старые решения к
   новому названию не привяжутся, и это правда модели данных, а не дефект
   счётчика. */
export async function refRejectReasons(): Promise<RefRow[]> {
  const uses = await считать(`
    SELECT reason_text AS k, count(*) AS n
    FROM rec.decisions WHERE kind = 'reject' GROUP BY 1
  `);
  return редактируемый('reject_reasons', uses, false);
}

/* Форма уточнения пока свободный текст — причину из справочника она не
   выбирает, и считать использования не по чему. null здесь значит «нет
   данных», а не ноль: ноль утверждал бы, что причинами никто не пользуется. */
export async function refClarifyReasons(): Promise<RefRow[]> {
  return редактируемый('clarify_reasons', null, false);
}

export async function refPriorities(): Promise<PriorityRow[]> {
  const [rows, uses, open] = await Promise.all([
    query<{ code: string; name: string; response_hours: number }>(`
      SELECT code, name, response_hours FROM rec.priorities ORDER BY sort_order
    `),
    считать(`
      SELECT priority AS k, count(*) AS n
      FROM rec.recommendations WHERE deleted_at IS NULL AND priority IS NOT NULL GROUP BY 1
    `),
    считать(`
      SELECT r.priority AS k, count(*) AS n
      FROM rec.recommendations r JOIN rec.statuses s ON s.code = r.status
      WHERE r.deleted_at IS NULL AND s.shows_sla AND r.priority IS NOT NULL GROUP BY 1
    `),
  ]);
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    hours: Number(r.response_hours),
    uses: число(uses.get(r.code)),
    open: число(open.get(r.code)),
  }));
}

/* Подписи плиток реестра. Состав «какие статусы за какой плиткой» общий с
   реестром (ПЛИТКИ_СТАТУСЫ), а подписи продублированы: в реестре они живут
   внутри страницы (app/page.tsx), откуда их не забрать без лишних экспортов
   из page-модуля. Разойтись могут только словами, не составом. */
const ПЛИТКИ_ПОДПИСИ: Record<string, string> = {
  executor: 'У Исполнителя',
  customer: 'У Заказчика',
  approved: 'Согласовано',
  window: 'Окно эффекта',
  confirmed: 'Окно закрыто',
  rejected: 'Отклонено',
  cancelled: 'Отменено',
};

export async function refStatuses(): Promise<StatusRow[]> {
  const [rows, uses] = await Promise.all([
    query<{ code: string; name: string; sort_order: number; tone: string; filled: boolean }>(`
      SELECT code, name, sort_order, tone, filled FROM rec.statuses ORDER BY sort_order
    `),
    считать(`
      SELECT status AS k, count(*) AS n
      FROM rec.recommendations WHERE deleted_at IS NULL GROUP BY 1
    `),
  ]);
  return rows.map((r, i) => {
    const tileKey = Object.keys(ПЛИТКИ_СТАТУСЫ).find((k) => ПЛИТКИ_СТАТУСЫ[k].includes(r.code));
    return {
      code: r.code,
      n: i + 1,
      name: r.name,
      tone: r.tone,
      filled: r.filled,
      tile: tileKey ? ПЛИТКИ_ПОДПИСИ[tileKey] : '—',
      uses: число(uses.get(r.code)),
    };
  });
}

/* Какой статус наступает после решения Заказчика. Решение — событие, двигающее
   статус, а не отдельное поле (решение 22), поэтому список решений закрыт
   статусной моделью и не может пополняться из интерфейса. */
const РЕШЕНИЯ: { kind: string; name: string; next: string }[] = [
  { kind: 'accept', name: 'Принята', next: 'approved' },
  { kind: 'reject', name: 'Отклонена', next: 'rejected' },
  { kind: 'clarify', name: 'Требует уточнения', next: 'clarify' },
];

export async function refDecisions(): Promise<DecisionRow[]> {
  const [статусы, uses] = await Promise.all([
    query<{ code: string; name: string }>(`SELECT code, name FROM rec.statuses`),
    считать(`SELECT kind AS k, count(*) AS n FROM rec.decisions GROUP BY 1`),
  ]);
  const имя = new Map(статусы.map((s) => [s.code, s.name]));
  return РЕШЕНИЯ.map((r) => ({
    kind: r.kind,
    name: r.name,
    next: имя.get(r.next) ?? '—',
    uses: число(uses.get(r.kind)),
  }));
}

export async function refCompleteness(): Promise<CompletenessRow[]> {
  const uses = await считать(`
    SELECT completeness AS k, count(*) AS n
    FROM rec.recommendations WHERE deleted_at IS NULL AND completeness IS NOT NULL GROUP BY 1
  `);
  return [
    {
      key: 'full', name: 'Полностью',
      note: 'Значение по умолчанию в форме фиксации реализации.',
      uses: число(uses.get('full')),
    },
    {
      key: 'partial', name: 'Частично',
      note: 'Требует обязательного пояснения в форме фиксации; в шапке карточки показывается пилюлей.',
      uses: число(uses.get('partial')),
    },
  ];
}

/* Кусты и скважины считаются по справочнику объектов (rec.ref_wells — дамп со
   стенда ВМАП), а не по рекомендациям: считать по рекомендациям значило бы
   показывать «2 куста» там, где на месторождении их полторы сотни, и таблица
   врала бы про масштаб фонда. */
export async function refFields(): Promise<{ rows: FieldRow[]; updatedAt: string | null }> {
  const [rows, recs, upd] = await Promise.all([
    query<{ field_id: number; field_name: string; kusts: string; wells: string }>(`
      SELECT field_id, field_name, count(DISTINCT kust) AS kusts, count(*) AS wells
      FROM rec.ref_wells GROUP BY 1, 2 ORDER BY field_name
    `),
    считать(`
      SELECT field_id::text AS k, count(*) AS n
      FROM rec.recommendations WHERE deleted_at IS NULL AND field_id IS NOT NULL GROUP BY 1
    `),
    query<{ at: string | null }>(`SELECT max(updated_at)::text AS at FROM rec.ref_wells`),
  ]);
  return {
    rows: rows.map((r) => ({
      fieldId: Number(r.field_id),
      fieldName: r.field_name,
      kusts: Number(r.kusts),
      wells: Number(r.wells),
      recs: число(recs.get(String(r.field_id))),
    })),
    updatedAt: upd[0]?.at ?? null,
  };
}

export async function refChanges(): Promise<RefChangeRow[]> {
  const rows = await query<{
    id: number; at: Date; actor_name: string; ref: string; object_name: string;
    action: string; field: string | null; old_value: string | null; new_value: string | null;
  }>(`
    SELECT id, at, actor_name, ref, object_name, action, field, old_value, new_value
    FROM rec.ref_changes ORDER BY at DESC, id DESC
  `);
  return rows.map((r) => ({
    id: Number(r.id),
    at: new Date(r.at).toISOString(),
    actorName: r.actor_name,
    ref: r.ref,
    objectName: r.object_name,
    action: r.action as RefChangeRow['action'],
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
  }));
}
