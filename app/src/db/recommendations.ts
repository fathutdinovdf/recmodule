/* Чтение реестра рекомендаций. */

import { query } from './pool';
import { isTypoOf } from '@/domain/textSimilarity';
import { currentUser } from '@/lib/session';
import { границаВидимости } from '@/lib/access';

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

/* ------------------------------ отбор и сортировка ------------------------------ *
 *
 * Отдельной строки фильтров в реестре нет — весь отбор живёт в заголовках
 * колонок (перенесено из макета один в один, см. макет/app.js). Колонки-
 * справочники (field, direction, well, priority, executor, status, control,
 * decision) фильтруются чек-листом значений с их количеством, текстовые
 * (number, problem) — подстрокой, дата регистрации — периодом.
 *
 * «Контроль ответа» — не колонка БД, а состояние, посчитанное из статуса и
 * срока (см. domain/workhours.control). Здесь оно продублировано как CASE:
 * бакет должен совпадать с тем, что рисует Ячейка(control) в реестре,
 * поэтому и сортировка, и фильтр, и подписи держатся в одном месте (ниже).
 */

export type FilterColumn =
  | 'field' | 'direction' | 'well' | 'priority' | 'executor'
  | 'status' | 'control' | 'decision';

export type SortColumn = FilterColumn | 'number' | 'regDate';

export type Period = '7' | '30' | 'month';

export interface ListFilter {
  statuses?: string[];
  colFilters?: Partial<Record<FilterColumn, string[]>>;
  text?: { number?: string; problem?: string };
  period?: Period;
  sort?: { key: SortColumn; dir: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

/* CTE с уже посчитанными control_kind/priority_disp и прочими производными
   полями: и список, и счётчик, и фасеты фильтров должны видеть одни и те же
   бакеты, поэтому выражение одно на файл. */
const BASE_CTE = `
  SELECT
    r.id, r.number, r.status,
    s.name AS status_name, s.tone, s.filled, s.shows_sla, s.sort_order AS status_order,
    CASE WHEN s.shows_sla THEN r.priority END AS priority_disp,
    CASE WHEN s.shows_sla THEN p.name END AS priority_name,
    CASE WHEN s.shows_sla THEN p.sort_order END AS priority_order,
    d.name AS direction, d.sort_order AS direction_order,
    r.well_id, r.well_number, r.kust, r.field_id, r.field_name,
    r.problem, r.action, r.completeness,
    r.registered_at, r.sent_at, r.due_at,
    u.full_name AS author_name,
    ex.full_name AS executor_name,
    p.response_hours AS sla_hours,
    dec.kind AS decision_kind, dec.at AS replied_at,
    (SELECT count(*) FROM rec.comments c WHERE c.rec_id = r.id AND c.deleted_at IS NULL) AS comments_count,
    EXISTS (SELECT 1 FROM rec.disputes ds WHERE ds.rec_id = r.id AND ds.state = 'open') AS has_open_dispute,
    i.window_open_at, i.window_close_at,
    CASE
      WHEN NOT s.shows_sla THEN 'hidden'
      WHEN r.status = 'registered' THEN 'pending'
      WHEN r.due_at IS NULL THEN 'none'
      WHEN dec.at IS NOT NULL THEN CASE WHEN dec.at <= r.due_at THEN 'ok' ELSE 'late' END
      WHEN now() > r.due_at THEN 'overdue'
      ELSE 'waiting'
    END AS control_kind
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
  WHERE r.deleted_at IS NULL
`;

/* Реестр в границах видимости вошедшего.
 *
 * Пользователь читается здесь, а не приходит параметром, намеренно: зона
 * ответственности — граница, а не фильтр (решение 87), и запрос в обход неё
 * не должен быть возможен вообще. Параметр можно забыть передать из новой
 * страницы, и никто этого не заметит, пока Заказчик не увидит чужой цех.
 * currentUser закэширован на запрос, лишнего обращения к базе это не стоит.
 */
async function основа(): Promise<string> {
  return `${BASE_CTE} AND ${границаВидимости(await currentUser(), 'r')}`;
}

/* Порядок «контроля ответа» — просрочки и близкие к просрочке впереди,
   тот же смысл, что CTRL_ORDER в макете. */
const CONTROL_ORDER_SQL = `CASE control_kind
  WHEN 'overdue' THEN 0 WHEN 'late' THEN 1 WHEN 'pending' THEN 2
  WHEN 'waiting' THEN 3 WHEN 'ok' THEN 4 WHEN 'none' THEN 5 ELSE 6 END`;

const SORT_EXPR: Record<SortColumn, string> = {
  number: 'number',
  regDate: 'registered_at',
  field: 'field_name',
  direction: 'direction',
  well: 'well_number',
  priority: 'priority_order',
  executor: 'executor_name',
  status: 'status_order',
  control: CONTROL_ORDER_SQL,
  decision: 'decision_kind',
};

/* Плитки над таблицей — какие статусы за какой стоят. Источник истины один:
   и сама таблица плиток в реестре (app/page.tsx), и разбор ?tile= для
   листалки по карточке (getFilteredNeighbours) берут отсюда, иначе плитка и
   декодированный из ссылки фильтр разошлись бы по составу статусов. */
export const ПЛИТКИ_СТАТУСЫ: Record<string, string[]> = {
  executor: ['draft', 'registered', 'clarify'],
  customer: ['sent', 'review'],
  approved: ['approved'],
  window: ['windowOpen'],
  confirmed: ['windowClosed'],
  rejected: ['rejected'],
  cancelled: ['cancelled'],
};

/* Разбор querystring реестра в ListFilter — один код для самого реестра и для
   листалки по карточке (см. getFilteredNeighbours), чтобы «то же самое
   отфильтровано» значило буквально то же самое, а не два похожих парсера. */
export function parseListFilterFromSearchParams(
  sp: Record<string, string | undefined>,
): Omit<ListFilter, 'limit' | 'offset'> {
  const КОЛОНКИ_ФИЛЬТРА: FilterColumn[] = [
    'field', 'direction', 'well', 'priority', 'executor', 'status', 'control', 'decision',
  ];

  const colFilters: Partial<Record<FilterColumn, string[]>> = {};
  for (const key of КОЛОНКИ_ФИЛЬТРА) {
    const raw = sp[key];
    if (raw) colFilters[key] = raw.split('|').filter(Boolean);
  }

  const text: { number?: string; problem?: string } = {
    number: sp.number || undefined,
    problem: sp.problem || undefined,
  };

  const period: Period | undefined = sp.period === '7' || sp.period === '30' || sp.period === 'month'
    ? sp.period : undefined;

  let sort: { key: SortColumn; dir: 'asc' | 'desc' } | undefined;
  if (sp.sort) {
    const [key, dir] = sp.sort.split(':');
    if (key && (dir === 'asc' || dir === 'desc')) sort = { key: key as SortColumn, dir };
  }

  return {
    statuses: sp.tile ? ПЛИТКИ_СТАТУСЫ[sp.tile] : undefined,
    colFilters, text, period, sort,
  };
}

function buildConditions(filter: ListFilter): { where: string; params: unknown[] } {
  const условия: string[] = [];
  const параметры: unknown[] = [];

  if (filter.statuses?.length) {
    параметры.push(filter.statuses);
    условия.push(`status = ANY($${параметры.length})`);
  }

  const colExpr: Record<FilterColumn, string> = {
    field: 'field_name',
    direction: 'direction',
    well: 'well_number',
    priority: `COALESCE(priority_disp, '')`,
    executor: `COALESCE(executor_name, '')`,
    status: 'status',
    control: 'control_kind',
    decision: `COALESCE(decision_kind, '')`,
  };
  for (const [key, values] of Object.entries(filter.colFilters ?? {})) {
    if (!values?.length) continue;
    параметры.push(values);
    условия.push(`${colExpr[key as FilterColumn]} = ANY($${параметры.length})`);
  }

  if (filter.text?.number) {
    параметры.push(`%${filter.text.number.trim()}%`);
    условия.push(`rec.ci(number) LIKE rec.ci($${параметры.length})`);
  }
  if (filter.text?.problem) {
    параметры.push(`%${filter.text.problem.trim()}%`);
    условия.push(`rec.ci(problem) LIKE rec.ci($${параметры.length})`);
  }

  if (filter.period === 'month') {
    условия.push(`date_trunc('month', registered_at) = date_trunc('month', now())`);
  } else if (filter.period === '7' || filter.period === '30') {
    условия.push(`registered_at >= now() - interval '${filter.period === '7' ? 7 : 30} days'`);
  }

  return { where: условия.length ? condJoin(условия) : '', params: параметры };
}

const condJoin = (parts: string[]) => `WHERE ${parts.join(' AND ')}`;

export async function listRecommendations(filter: ListFilter = {}): Promise<{
  rows: RecommendationRow[]; total: number;
}> {
  const { where, params } = buildConditions(filter);

  const [{ count }] = await query<{ count: string }>(
    `WITH base AS (${await основа()}) SELECT count(*)::text AS count FROM base ${where}`, params);

  const sort = filter.sort;
  const orderBy = sort
    ? `${SORT_EXPR[sort.key]} ${sort.dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, id DESC`
    : 'registered_at DESC NULLS FIRST, id DESC';

  const параметры = [...params];
  параметры.push(filter.limit ?? 50);
  параметры.push(filter.offset ?? 0);

  const rows = await query<Record<string, unknown>>(`
    WITH base AS (${await основа()})
    SELECT * FROM base
    ${where}
    ORDER BY ${orderBy}
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
      priority: r.priority_disp as string | null,
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

export interface Neighbours {
  prevId: number | null;
  nextId: number | null;
  pos: number;
  total: number;
}

/** Соседи по карточке в границах текущего отбора реестра — листалка в шапке
 *  карточки, открытой переходом из отфильтрованного/отсортированного
 *  реестра. Условия и порядок — те же buildConditions/SORT_EXPR, что и в
 *  listRecommendations, иначе позиция и «из скольки» разошлись бы с тем, что
 *  человек только что видел в таблице. */
export async function getFilteredNeighbours(
  id: number, filter: Omit<ListFilter, 'limit' | 'offset'>,
): Promise<Neighbours> {
  const { where, params } = buildConditions(filter);
  const sort = filter.sort;
  const orderBy = sort
    ? `${SORT_EXPR[sort.key]} ${sort.dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, id DESC`
    : 'registered_at DESC NULLS FIRST, id DESC';

  const rows = await query<Record<string, unknown>>(`
    WITH base AS (${await основа()}),
    filtered AS (SELECT * FROM base ${where}),
    ordered AS (
      SELECT id,
             lag(id)  OVER w AS prev_id,
             lead(id) OVER w AS next_id,
             row_number() OVER w AS pos,
             count(*) OVER () AS total
      FROM filtered
      WINDOW w AS (ORDER BY ${orderBy})
    )
    SELECT prev_id, next_id, pos, total FROM ordered WHERE id = $${params.length + 1}
  `, [...params, id]);

  const r = rows[0];
  if (!r) return { prevId: null, nextId: null, pos: 0, total: 0 };
  return {
    prevId: r.prev_id === null ? null : Number(r.prev_id),
    nextId: r.next_id === null ? null : Number(r.next_id),
    pos: Number(r.pos),
    total: Number(r.total),
  };
}

/** Счётчики для плиток над таблицей. */
export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await query<{ status: string; n: string }>(`
    SELECT r.status, count(*)::text AS n FROM rec.recommendations r
    WHERE r.deleted_at IS NULL AND ${границаВидимости(await currentUser(), 'r')}
    GROUP BY r.status
  `);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

/* ------------------------------ фасеты фильтров ------------------------------ */

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

const РЕШЕНИЕ_МЕТКА: Record<string, string> = {
  accept: 'Принята', reject: 'Отклонена', clarify: 'Требует уточнения',
};

const КОНТРОЛЬ_МЕТКА: Record<string, string> = {
  hidden: '—', pending: 'ожидает передачи', none: 'нет срока',
  ok: 'в срок', late: 'с опозданием', overdue: 'просрочено', waiting: 'осталось',
};

/** Список значений колонки со счётчиком — для чек-листа в поповере фильтра.
 *  Считается по всему реестру (без учёта активных фильтров), как в макете:
 *  иначе выбор в одной колонке молча менял бы счётчики в другой. */
export async function columnFacet(col: FilterColumn, search?: string): Promise<FacetOption[]> {
  const like = search ? `%${search.trim()}%` : null;

  switch (col) {
    case 'field':
    case 'well': {
      const expr = col === 'field' ? 'field_name' : 'well_number';
      const rows = await query<{ v: string; n: string }>(`
        WITH base AS (${await основа()})
        SELECT ${expr} AS v, count(*)::text AS n FROM base
        ${like ? `WHERE rec.ci(${expr}) LIKE rec.ci($1)` : ''}
        GROUP BY ${expr} ORDER BY ${expr}
      `, like ? [like] : []);
      return rows.map((r) => ({ value: r.v ?? '', label: r.v || '—', count: Number(r.n) }));
    }

    case 'direction': {
      const rows = await query<{ v: string; n: string; ord: number }>(`
        WITH base AS (${await основа()})
        SELECT direction AS v, direction_order AS ord, count(*)::text AS n FROM base
        ${like ? `WHERE direction ILIKE $1` : ''}
        GROUP BY direction, direction_order ORDER BY direction_order
      `, like ? [like] : []);
      return rows.map((r) => ({ value: r.v ?? '', label: r.v || '—', count: Number(r.n) }));
    }

    case 'executor': {
      const rows = await query<{ v: string | null; n: string }>(`
        WITH base AS (${await основа()})
        SELECT executor_name AS v, count(*)::text AS n FROM base
        ${like ? `WHERE rec.ci(COALESCE(executor_name, '—')) LIKE rec.ci($1)` : ''}
        GROUP BY executor_name ORDER BY executor_name NULLS FIRST
      `, like ? [like] : []);
      return rows.map((r) => ({ value: r.v ?? '', label: r.v ?? '—', count: Number(r.n) }));
    }

    case 'priority': {
      const rows = await query<{ v: string | null; label: string | null; ord: number | null; n: string }>(`
        WITH base AS (${await основа()})
        SELECT priority_disp AS v, priority_name AS label, priority_order AS ord, count(*)::text AS n FROM base
        ${like ? `WHERE rec.ci(COALESCE(priority_name, '—')) LIKE rec.ci($1)` : ''}
        GROUP BY priority_disp, priority_name, priority_order
        ORDER BY priority_order NULLS LAST
      `, like ? [like] : []);
      return rows.map((r) => ({ value: r.v ?? '', label: r.label ?? '—', count: Number(r.n) }));
    }

    case 'status': {
      const rows = await query<{ v: string; label: string; ord: number; n: string }>(`
        WITH base AS (${await основа()})
        SELECT status AS v, status_name AS label, status_order AS ord, count(*)::text AS n FROM base
        ${like ? `WHERE rec.ci(status_name) LIKE rec.ci($1)` : ''}
        GROUP BY status, status_name, status_order ORDER BY status_order
      `, like ? [like] : []);
      return rows.map((r) => ({ value: r.v, label: r.label, count: Number(r.n) }));
    }

    case 'control': {
      const rows = await query<{ v: string; n: string }>(`
        WITH base AS (${await основа()})
        SELECT control_kind AS v, count(*)::text AS n FROM base
        GROUP BY control_kind ORDER BY ${CONTROL_ORDER_SQL}
      `, []);
      return rows
        .map((r) => ({ value: r.v, label: КОНТРОЛЬ_МЕТКА[r.v] ?? r.v, count: Number(r.n) }))
        .filter((o) => !like || o.label.toLowerCase().includes(search!.trim().toLowerCase()));
    }

    case 'decision': {
      const rows = await query<{ v: string | null; n: string }>(`
        WITH base AS (${await основа()})
        SELECT decision_kind AS v, count(*)::text AS n FROM base
        GROUP BY decision_kind ORDER BY decision_kind NULLS FIRST
      `, []);
      return rows
        .map((r) => ({ value: r.v ?? '', label: r.v ? (РЕШЕНИЕ_МЕТКА[r.v] ?? r.v) : '—', count: Number(r.n) }))
        .filter((o) => !like || o.label.toLowerCase().includes(search!.trim().toLowerCase()));
    }

    default:
      return [];
  }
}

export type TextFacetColumn = 'number' | 'problem';

/** Подсказки для текстового поиска (номер, проблема/отклонение) — список
 *  различных значений, содержащих введённую строку, только по запросу:
 *  без него подсказывать нечего, а тянуть все проблемы реестра незачем. */
export async function textFacet(col: TextFacetColumn, search: string): Promise<FacetOption[]> {
  const q = search.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const expr = col === 'number' ? 'number' : 'problem';

  const rows = await query<{ v: string; n: string }>(`
    WITH base AS (${await основа()})
    SELECT ${expr} AS v, count(*)::text AS n FROM base
    WHERE rec.ci(${expr}) LIKE rec.ci($1)
    GROUP BY ${expr} ORDER BY ${expr}
    LIMIT 8
  `, [like]);
  if (rows.length) return rows.map((r) => ({ value: r.v ?? '', label: r.v || '—', count: Number(r.n) }));

  /* Точных подстрок нет — возможно, опечатка. Осмысленно только для
     «Проблема / отклонение»: это свободный текст, а номер рекомендации —
     код, где «похожий» не значит «тот же». */
  if (col !== 'problem') return [];

  const all = await query<{ v: string; n: string }>(`
    WITH base AS (${await основа()})
    SELECT problem AS v, count(*)::text AS n FROM base
    GROUP BY problem
    LIMIT 500
  `);
  return all
    .filter((r) => isTypoOf(q, r.v ?? ''))
    .map((r) => ({ value: r.v ?? '', label: r.v || '—', count: Number(r.n) }))
    .slice(0, 8);
}
