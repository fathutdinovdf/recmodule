/* Реестр рекомендаций.
 *
 * Колонки, их порядок, ширины и разметка ячеек — из макета (app.js + index.html)
 * без отступлений. Данные приходят из базы, фильтрация и пагинация считаются
 * на сервере.
 */

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { listRecommendations, statusCounts } from '@/db/recommendations';
import type { RecommendationRow } from '@/db/recommendations';
import { control, fmtDur, toWindow } from '@/domain/workhours';
import { Icon } from '@/components/Icons';

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

/* Ширины и признаки — те же, что в COLS макета. sort у всех, search у номера
   и текстовых, funnel у фильтруемых, period у даты регистрации. */
const КОЛОНКИ = [
  { key: 'number', label: '№', w: 100, search: true },
  { key: 'regDate', label: 'Дата регистрации', w: 136, period: true },
  { key: 'field', label: 'Месторождение', w: 172, filter: true },
  { key: 'direction', label: 'Направление', w: 152, filter: true },
  { key: 'well', label: 'Скважина', w: 110, filter: true },
  { key: 'problem', label: 'Проблема / отклонение', w: 230, text: true },
  { key: 'priority', label: 'Приоритет', w: 114, filter: true },
  { key: 'executor', label: 'Ответственный Исполнителя', w: 94, filter: true },
  { key: 'status', label: 'Текущий статус', w: 150, filter: true },
  { key: 'control', label: 'Контроль ответа', w: 148, filter: true },
  { key: 'decision', label: 'Решение Заказчика', w: 130, filter: true },
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
        : <Link href={`/rec/${r.id}`} title="Открыть карточку рекомендации">{r.number}</Link>;

    case 'regDate':
      return <span className="cell-date">{дт(r.registeredAt)}</span>;

    case 'field':
      return <div className="clip1" title={r.fieldName}>{r.fieldName}</div>;

    case 'direction':
      return <div className="clip1" title={r.direction}>{r.direction}</div>;

    case 'well':
      return <>{r.wellNumber}</>;

    case 'problem':
      return (
        <div className="clip" title={r.problem}>
          {r.problem}
          {r.hasOpenDispute && <span className="note-flag" title="Есть незакрытый спор: расчёт эффекта предварительный">*</span>}
        </div>
      );

    /* Приоритет и контроль ответа теряют смысл, как только вопрос ответа
       Заказчика закрыт, — см. shows_sla в справочнике статусов. */
    case 'priority':
      if (!r.showsSla || !r.priority) return <span className="mark">—</span>;
      return (
        <span className={`prio prio--${r.priority}`} title={`Приоритет ${r.priority}`}>
          {r.priority}<i>{r.slaHours} ч</i>
        </span>
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
          <span className="tag tag--pending" title="Заказчику уйдёт с началом рабочего дня">
            передача {уйдёт ? дт(уйдёт).slice(0, 5) + ' ' + дт(уйдёт).slice(11) : '—'}
          </span>
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
  const поиск = sp.q ?? '';
  const страница = Math.max(1, Number(sp.page ?? 1));
  const наСтранице = Number(sp.size ?? 50);
  const выбранная = ПЛИТКИ.find((t) => t.key === плитка);

  const [{ rows, total }, счётчики] = await Promise.all([
    listRecommendations({
      statuses: выбранная?.statuses,
      search: поиск || undefined,
      limit: наСтранице,
      offset: (страница - 1) * наСтранице,
    }),
    statusCounts(),
  ]);

  const всего = Object.values(счётчики).reduce((a, b) => a + b, 0);
  const фильтрВключён = Boolean(плитка || поиск);
  const страниц = Math.max(1, Math.ceil(total / наСтранице));

  const ссылка = (изм: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const т: Record<string, string | undefined> = {
      tile: плитка, q: поиск || undefined,
      page: страница > 1 ? String(страница) : undefined,
      size: наСтранице !== 50 ? String(наСтранице) : undefined,
      ...изм,
    };
    for (const [k, v] of Object.entries(т)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : '/';
  };

  return (
    <AppShell>
      <main className="content">
        <div className="pagehead">
          <h1>Реестр рекомендаций</h1>
          <span className="pagehead__zone">
            {фильтрВключён ? `показано ${total} из ${всего}` : `всего ${всего}`}
          </span>
          <div className="pagehead__actions">
            <a className="btn btn--accent" href="#"><Icon id="plus" />Создать рекомендацию</a>
            <button className="iconbtn iconbtn--lg" title="Настройка колонок"><Icon id="cols" size={20} /></button>
            <button className="iconbtn iconbtn--lg" title="Экспорт"><Icon id="export" size={20} /></button>
          </div>
        </div>

        <section className="tiles">
          {ПЛИТКИ.map((t) => {
            const n = t.statuses.reduce((a, s) => a + (счётчики[s] ?? 0), 0);
            const включена = плитка === t.key;
            return (
              <Link key={t.key} className={`tile ${включена ? 'is-on' : ''}`}
                    href={ссылка({ tile: включена ? undefined : t.key, page: undefined })}>
                <span className="tile__n">{n}</span>
                <span className="tile__l">{t.label}</span>
              </Link>
            );
          })}
        </section>

        <section className="panel">
          <div className="tablewrap">
            {/* Ширина таблицы — сумма колонок, как в макете: при table-layout
                fixed без неё браузер растягивает колонки по содержимому и
                заданные ширины перестают действовать. */}
            <table className="tbl" style={{ width: КОЛОНКИ.reduce((s, c) => s + c.w, 0) }}>
              <colgroup>
                {КОЛОНКИ.map((c) => <col key={c.key} style={{ width: c.w }} />)}
              </colgroup>
              <thead>
                <tr>
                  {КОЛОНКИ.map((c) => (
                    <th key={c.key} data-col={c.key}>
                      <span className="th">
                        <span className="th__t" title={`${c.label} — сортировать`}>
                          <span className="th__label">{c.label}</span>
                        </span>
                        {(c.search || c.text) && (
                          <span className="th__i" title={c.search ? 'Поиск по номеру' : 'Поиск по тексту'}>
                            <svg className="ic-th"><use href="#i-search" /></svg>
                          </span>
                        )}
                        {c.filter && (
                          <span className="th__i" title="Фильтр">
                            <svg className="ic-th"><use href="#i-funnel" /></svg>
                          </span>
                        )}
                        {c.period && (
                          <span className="th__i" title="Период">
                            <svg className="ic-th"><use href="#i-funnel" /></svg>
                          </span>
                        )}
                      </span>
                      <span className="resizer" />
                    </th>
                  ))}
                </tr>
              </thead>
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
    </AppShell>
  );
}
