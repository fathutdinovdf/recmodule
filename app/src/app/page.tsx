/* Реестр рекомендаций.
 *
 * Колонки, их порядок, ширины и разметка ячеек — из макета (app.js + index.html)
 * без отступлений. Данные приходят из базы, фильтрация, сортировка и
 * пагинация считаются на сервере — состояние отбора целиком в адресе, как и
 * плитка раньше, так ссылка на отфильтрованный/отсортированный реестр
 * остаётся рабочей сама по себе.
 */

import Link from 'next/link';
import {
  listRecommendations, statusCounts,
  type FilterColumn, type SortColumn, type Period,
} from '@/db/recommendations';
import type { RecommendationRow } from '@/db/recommendations';
import { control, fmtDur, toWindow } from '@/domain/workhours';
import { Icon } from '@/components/Icons';
import { Hint } from '@/components/ui/Hint';
import { КОЛОНКИ } from './registry-columns';
import { RegistryHead } from './registry-head';
import { RegistrationLauncher } from './registration-launcher';
import { RegistryTiles } from './registry-tiles';

export const dynamic = 'force-dynamic';

const ПЛИТКИ = [
  { key: 'executor', label: 'У Исполнителя', statuses: ['draft', 'registered', 'clarify'] },
  { key: 'customer', label: 'У Заказчика', statuses: ['sent', 'review'] },
  { key: 'approved', label: 'Согласовано', statuses: ['approved'] },
  { key: 'window', label: 'Окно эффекта', statuses: ['windowOpen'] },
  { key: 'confirmed', label: 'Окно закрыто', statuses: ['windowClosed'] },
  { key: 'rejected', label: 'Отклонено', statuses: ['rejected'] },
  { key: 'cancelled', label: 'Отменено', statuses: ['cancelled'] },
];

/* Колонки-справочники, по которым в заголовке живёт чек-лист значений. */
const КОЛОНКИ_ФИЛЬТРА: FilterColumn[] = [
  'field', 'direction', 'well', 'priority', 'executor', 'status', 'control', 'decision',
];

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

function Ячейка({ r, col }: { r: RecommendationRow; col: typeof КОЛОНКИ[number] }) {
  switch (col.key) {
    case 'number':
      return r.status === 'draft'
        ? <span className="mark">черновик</span>
        : <Hint text="Открыть карточку рекомендации"><Link href={`/rec/${r.id}/summary`}>{r.number}</Link></Hint>;

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
    плитка || period || text.number || text.problem
    || Object.values(colFilters).some((v) => v?.length),
  );
  const страниц = Math.max(1, Math.ceil(total / наСтранице));

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

  return (
    <main className="content">
      <div className="pagehead">
        <h1>Реестр рекомендаций</h1>
        <div className="pagehead__actions">
          <RegistrationLauncher />
          <Hint text="Настройка колонок">
            <button className="iconbtn iconbtn--lg" type="button" aria-label="Настройка колонок"><Icon id="cols" size={20} /></button>
          </Hint>
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
          {/* Ширина таблицы — сумма колонок, как в макете: при table-layout
              fixed без неё браузер растягивает колонки по содержимому и
              заданные ширины перестают действовать. */}
          <table className="tbl" style={{ width: КОЛОНКИ.reduce((s, c) => s + c.w, 0) }}>
            <colgroup>
              {КОЛОНКИ.map((c) => <col key={c.key} style={{ width: c.w }} />)}
            </colgroup>
            <RegistryHead state={{
              sort: sort ?? null,
              period: period ?? '',
              colFilters: Object.fromEntries(КОЛОНКИ_ФИЛЬТРА.map((k) => [k, colFilters[k] ?? []])),
              text: { number: text.number ?? '', problem: text.problem ?? '' },
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
                        <Ячейка r={r} col={col} />
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
