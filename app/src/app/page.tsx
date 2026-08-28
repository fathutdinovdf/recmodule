/* Реестр рекомендаций.
 *
 * Колонки, их порядок, ширины и разметка ячеек — из макета (app.js + index.html)
 * без отступлений. Данные приходят из базы, фильтрация, сортировка и
 * пагинация считаются на сервере — состояние отбора целиком в адресе, как и
 * плитка раньше, так ссылка на отфильтрованный/отсортированный реестр
 * остаётся рабочей сама по себе.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  listRecommendations, statusCounts, ПЛИТКИ_СТАТУСЫ,
  type FilterColumn, type SortColumn, type Period, type TextFacetColumn,
} from '@/db/recommendations';
import type { RecommendationRow } from '@/db/recommendations';
import { control, fmtDur, toWindow } from '@/domain/workhours';
import { Icon } from '@/components/Icons';
import { Hint } from '@/components/ui/Hint';
import {
  видимыеКолонки, ГРУППЫ_КОЛОНОК, КОЛОНКИ_ВСЕ, КОЛОНКИ_ПО_УМОЛЧАНИЮ, type ColDef,
} from './registry-columns';
import { RegistryHead } from './registry-head';
import { RegistrationLauncher } from './registration-launcher';
import { RegistryTiles } from './registry-tiles';
import { ColumnsPanel } from './registry-columns-panel';
import { ВИДИМЫЕ_КОЛОНКИ_COOKIE } from './registry-columns-cookie';

export const dynamic = 'force-dynamic';

const ПЛИТКИ = [
  { key: 'executor', label: 'У Исполнителя' },
  { key: 'customer', label: 'У Заказчика' },
  { key: 'approved', label: 'Согласовано' },
  { key: 'window', label: 'Окно эффекта' },
  { key: 'confirmed', label: 'Окно закрыто' },
  { key: 'rejected', label: 'Отклонено' },
  { key: 'cancelled', label: 'Отменено' },
].map((t) => ({ ...t, statuses: ПЛИТКИ_СТАТУСЫ[t.key] }));

/* Колонки-справочники, по которым в заголовке живёт чек-лист значений. */
const КОЛОНКИ_ФИЛЬТРА: FilterColumn[] = [
  'field', 'direction', 'well', 'kust', 'priority', 'executor', 'status', 'control', 'decision',
  'customer', 'completeness',
];

/* Колонки свободного текста — поиск подстрокой в заголовке. */
const КОЛОНКИ_ТЕКСТА: TextFacetColumn[] = ['number', 'problem', 'action', 'rationale', 'rejectReason'];

const РЕШЕНИЕ: Record<string, { label: string; kind: string }> = {
  accept: { label: 'Принята', kind: 'ok' },
  reject: { label: 'Отклонена', kind: 'late' },
  clarify: { label: 'Требует уточнения', kind: 'warning' },
};

const дт = (d: Date | null) => (d
  ? new Date(d).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', '')
  : '—');

const дата = (d: Date | null) => (d
  ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—');

const число = (n: number | null, dp = 1) => (n === null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: dp }));

const ПОЛНОТА_МЕТКА: Record<string, string> = { full: 'Полностью', partial: 'Частично' };

function Ячейка({
  r, col, ссылкаНаКарточку,
}: {
  r: RecommendationRow; col: ColDef; ссылкаНаКарточку: string;
}) {
  switch (col.key) {
    case 'number':
      return r.status === 'draft'
        ? <span className="mark">черновик</span>
        : <Hint text="Открыть карточку рекомендации"><Link href={ссылкаНаКарточку}>{r.number}</Link></Hint>;

    case 'regDate':
      return <span className="cell-date">{дт(r.registeredAt)}</span>;

    case 'field':
      return <Hint text={r.fieldName}><div className="clip1">{r.fieldName}</div></Hint>;

    case 'direction':
      return <Hint text={r.direction}><div className="clip1">{r.direction}</div></Hint>;

    case 'well':
      return <>{r.wellNumber}</>;

    case 'problem':
      return (
        <div className="clip">
          {/* Подсказка только на тексте: если завести её и на всю ячейку целиком,
             наведение на звёздочку показывает сразу два тултипа друг над другом. */}
          <Hint text={r.problem}><span>{r.problem}</span></Hint>
          {r.hasOpenDispute && (
            <Hint text="Есть незакрытый спор: расчёт эффекта предварительный">
              <span className="note-flag">*</span>
            </Hint>
          )}
        </div>
      );

    /* Приоритет и контроль ответа теряют смысл, как только вопрос ответа
       Заказчика закрыт, — см. shows_sla в справочнике статусов. */
    case 'priority':
      if (!r.showsSla || !r.priority) return <span className="mark">—</span>;
      return (
        <Hint text={`Приоритет ${r.priority}`}>
          <span className={`prio prio--${r.priority}`}>
            {r.priority}<i>{r.slaHours} ч</i>
          </span>
        </Hint>
      );

    case 'executor':
      return <div className="clip1">{r.executorName ?? '—'}</div>;

    case 'status':
      return (
        <span className="status">
          <i className={`status__d status__d--${r.tone} ${r.filled ? '' : 'is-hollow'}`} />
          {r.statusName}
        </span>
      );

    case 'control': {
      if (!r.showsSla) return <span className="mark">—</span>;
      const c = control({
        status: r.status, sentAt: r.sentAt, dueAt: r.dueAt, repliedAt: r.repliedAt,
      });
      if (c.kind === 'none') return <span className="tag tag--default">нет срока</span>;
      if (c.kind === 'pending') {
        /* Зарегистрированная рекомендация ещё не передана: она уйдёт Заказчику
           с открытием рабочего окна. Показываем этот момент, а не прочерк, —
           иначе непонятно, чего ждать. */
        const уйдёт = r.sentAt ?? (r.registeredAt ? toWindow(new Date(r.registeredAt)) : null);
        return (
          <Hint text="Заказчику уйдёт с началом рабочего дня">
            <span className="tag tag--pending">
              передача {уйдёт ? дт(уйдёт).slice(0, 5) + ' ' + дт(уйдёт).slice(11) : '—'}
            </span>
          </Hint>
        );
      }
      const подпись = { ok: 'в срок', late: 'с опозданием', overdue: 'просрочено', waiting: 'осталось' }[c.kind];
      return (
        <span className={`tag tag--${c.kind}`}>
          {подпись}{c.kind === 'ok' ? '' : ` ${fmtDur(c.hours)}`}
        </span>
      );
    }

    case 'decision': {
      const d = r.decisionKind ? РЕШЕНИЕ[r.decisionKind] : null;
      return d
        ? <span className={`tag tag--${d.kind}`}>{d.label}</span>
        : <span className="mark">—</span>;
    }

    case 'formDate':
      return <span className="cell-date">{дт(r.registeredAt)}</span>;

    case 'kust':
      return <>{r.kust ?? '—'}</>;

    case 'action':
      return <div className="clip"><Hint text={r.action}><span>{r.action}</span></Hint></div>;

    case 'rationale':
      return r.rationale
        ? <div className="clip"><Hint text={r.rationale}><span>{r.rationale}</span></Hint></div>
        : <span className="mark">—</span>;

    case 'sentAt':
      return <span className="cell-date">{дт(r.sentAt)}</span>;

    case 'openedAt':
      return <span className="cell-date">{дт(r.openedAt)}</span>;

    case 'dueAt':
      return <span className="cell-date">{дт(r.dueAt)}</span>;

    case 'repliedAt':
      return <span className="cell-date">{дт(r.repliedAt)}</span>;

    case 'rejectReason':
      return r.decisionComment
        ? <div className="clip"><Hint text={r.decisionComment}><span>{r.decisionComment}</span></Hint></div>
        : <span className="mark">—</span>;

    case 'customer':
      return <div className="clip1">{r.customerName ?? '—'}</div>;

    case 'factDate':
      return <span className="cell-date">{дата(r.factDate)}</span>;

    case 'completeness':
      return r.completeness
        ? <>{ПОЛНОТА_МЕТКА[r.completeness] ?? r.completeness}</>
        : <span className="mark">—</span>;

    case 'windowOpenAt':
      return <span className="cell-date">{дата(r.windowOpenAt)}</span>;

    case 'windowCloseAt':
      return <span className="cell-date">{дата(r.windowCloseAt)}</span>;

    case 'commentsCount':
      return <>{r.commentsCount}</>;

    case 'attachmentsCount':
      return <>{r.attachmentsCount}</>;

    case 'expectQzh':
      return <>{число(r.expectQzh)}</>;

    case 'expectQn':
      return <>{число(r.expectQn)}</>;

    case 'expectEe':
      return <>{число(r.expectEe)}</>;

    default:
      return null;
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const плитка = sp.tile;
  const страница = Math.max(1, Number(sp.page ?? 1));
  const наСтранице = Number(sp.size ?? 50);
  const выбранная = ПЛИТКИ.find((t) => t.key === плитка);

  const colFilters: Partial<Record<FilterColumn, string[]>> = {};
  for (const key of КОЛОНКИ_ФИЛЬТРА) {
    const raw = sp[key];
    if (raw) colFilters[key] = raw.split('|').filter(Boolean);
  }

  const text: Partial<Record<TextFacetColumn, string>> = {};
  for (const key of КОЛОНКИ_ТЕКСТА) if (sp[key]) text[key] = sp[key];

  const period: Period | undefined = sp.period === '7' || sp.period === '30' || sp.period === 'month'
    ? sp.period : undefined;

  let sort: { key: SortColumn; dir: 'asc' | 'desc' } | undefined;
  if (sp.sort) {
    const [key, dir] = sp.sort.split(':');
    if (key && (dir === 'asc' || dir === 'desc')) sort = { key: key as SortColumn, dir };
  }

  const [{ rows, total }, счётчики] = await Promise.all([
    listRecommendations({
      statuses: выбранная?.statuses,
      colFilters, text, period, sort,
      limit: наСтранице,
      offset: (страница - 1) * наСтранице,
    }),
    statusCounts(),
  ]);

  const фильтрВключён = Boolean(
    плитка || period || Object.values(text).some(Boolean)
    || Object.values(colFilters).some((v) => v?.length),
  );
  const страниц = Math.max(1, Math.ceil(total / наСтранице));

  /* Querystring текущего отбора для листалки в шапке карточки: страница и
     размер страницы туда не идут — позиция и «из скольки» у листалки не о
     пагинации таблицы, а обо всём отфильтрованном списке целиком. */
  const отбор = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== 'page' && k !== 'size') p.set(k, v);
    return p.toString();
  })();
  const ссылкаНаКарточку = (id: number) => (фильтрВключён ? `/rec/${id}/summary?from=${encodeURIComponent(отбор)}` : `/rec/${id}/summary`);

  /* Ссылка сохраняет весь текущий отбор (фильтры, сортировку, период) и
     переопределяет только то, что явно передано, — иначе переход по
     странице пагинации или клик по плитке сбрасывал бы фильтры колонок. */
  const ссылка = (изм: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(изм)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return s ? `/?${s}` : '/';
  };

  /* Видимость колонок — в cookie, а не в URL: это личная настройка
     наблюдения за реестром, а не часть отфильтрованной выборки, и не должна
     ехать в ссылке, которой делятся ради самого отбора (решение 24/56). */
  const cookieКолонок = (await cookies()).get(ВИДИМЫЕ_КОЛОНКИ_COOKIE)?.value;
  const видимые = cookieКолонок ? new Set(cookieКолонок.split(',').filter(Boolean)) : null;
  const КОЛОНКИ = видимыеКолонки(видимые);
  const суммаКолонок = КОЛОНКИ.reduce((s, c) => s + c.w, 0);

  return (
    <main className="content">
      <div className="pagehead">
        <h1>Реестр рекомендаций</h1>
        <div className="pagehead__actions">
          <RegistrationLauncher />
          <ColumnsPanel groups={ГРУППЫ_КОЛОНОК} all={КОЛОНКИ_ВСЕ} visible={видимые ?? КОЛОНКИ_ПО_УМОЛЧАНИЮ} />
          <Hint text="Экспорт">
            <button className="iconbtn iconbtn--lg" type="button" aria-label="Экспорт"><Icon id="export" size={20} /></button>
          </Hint>
        </div>
      </div>

      <RegistryTiles active={плитка ?? null} items={ПЛИТКИ.map((t) => ({
        key: t.key,
        label: t.label,
        n: t.statuses.reduce((a, s) => a + (счётчики[s] ?? 0), 0),
        href: ссылка({ tile: плитка === t.key ? undefined : t.key, page: undefined }),
      }))} />

      <section className="panel">
        <div className="tablewrap">
          {/* Сумма колонок — нижняя граница ширины (min-width), а не сама ширина:
              при урезанном составе колонок (настройка видимости) сумма меньше
              контейнера, и таблица с жёсткой шириной оставляла бы справа пустую
              полосу. width:100% дотягивает её до правого края, min-width при
              полном составе оставляет горизонтальную прокрутку как раньше.
              Ширины <col> — в процентах от суммы, а не в px: излишек ширины
              браузер при table-layout:fixed делит между px-колонками поровну,
              и узкие колонки («Куст») распухали бы наравне с широкими
              («Мероприятие»); проценты делят его пропорционально. При таблице
              ровно в min-width процент даёт те же px, что в макете. */}
          <table className="tbl" style={{ width: '100%', minWidth: суммаКолонок }}>
            <colgroup>
              {КОЛОНКИ.map((c) => <col key={c.key} style={{ width: `${(c.w / суммаКолонок) * 100}%` }} />)}
            </colgroup>
            <RegistryHead
              columns={КОЛОНКИ}
              state={{
                sort: sort ?? null,
                period: period ?? '',
                colFilters: Object.fromEntries(КОЛОНКИ_ФИЛЬТРА.map((k) => [k, colFilters[k] ?? []])),
                text: Object.fromEntries(КОЛОНКИ_ТЕКСТА.map((k) => [k, text[k] ?? ''])),
              }}
            />
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={КОЛОНКИ.length} style={{
                    padding: 'var(--section-padding-extra-wide)',
                    textAlign: 'center', color: 'var(--text-tertiary)',
                  }}>
                    По заданным условиям рекомендаций нет.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const c = r.showsSla
                  ? control({ status: r.status, sentAt: r.sentAt, dueAt: r.dueAt, repliedAt: r.repliedAt })
                  : { kind: 'none' as const, hours: 0 };
                return (
                  <tr key={r.id} className={c.kind === 'overdue' ? 'row-overdue' : ''}>
                    {КОЛОНКИ.map((col) => (
                      <td key={col.key} className={col.key === 'number' ? 'cell-num' : ''}>
                        <Ячейка r={r} col={col} ссылкаНаКарточку={ссылкаНаКарточку(r.id)} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <div className="pager__info">
            {total === 0 ? 'Ничего не найдено'
              : `${(страница - 1) * наСтранице + 1}–${Math.min(страница * наСтранице, total)} из ${total}`}
          </div>
          {фильтрВключён && <a className="btn btn--ghost btn--small" href="/">Сбросить фильтры</a>}
          <div className="pager__pages">
            {страниц > 1 && (
              <>
                <Link className="pgbtn" href={ссылка({ page: String(Math.max(1, страница - 1)) })}>‹</Link>
                {Array.from({ length: страниц }, (_, i) => i + 1).map((n) => (
                  <Link key={n} className={`pgbtn ${n === страница ? 'is-on' : ''}`}
                        href={ссылка({ page: String(n) })}>{n}</Link>
                ))}
                <Link className="pgbtn" href={ссылка({ page: String(Math.min(страниц, страница + 1)) })}>›</Link>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
