/* Оболочка карточки рекомендации: шапка, полоса прогноза, вкладки и правая
 * колонка. Разметка и классы — из макета (card.html + card.js), CSS взят
 * оттуда файлом и не правился.
 *
 * Почему оболочка живёт в layout, а вкладки — в страницах под ней. Вкладка
 * стоит сегментом адреса: карточку пересылают друг другу, и адрес вкладки
 * ценен сам по себе. При этом шапка и правая колонка грузятся один раз на всю
 * карточку, а тяжёлый расчёт эффекта изолирован в своей странице и не тормозит
 * открытие остальных вкладок.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icons';
import { Hint } from '@/components/ui/Hint';
import { getCard, getNeighbours, getWellHistory } from '@/db/card';
import { getWellEconomy } from '@/db/economy';
import { getWell, getMeasurementsWithLookback, PARAM, РУЧНОЙ_ИСТОЧНИК } from '@/db/wells-data';
import { вкладкиДля } from './tabs-def';
import { dailySeries, dayStart } from '@/domain/measurements';
import { forecastTotal } from '@/domain/effect';
import { control, fmtDur } from '@/domain/workhours';
import { WINDOW_DAYS } from '@/services/effect-store';
import { дата, число, прирост, рубли } from '@/lib/format';
import { currentUser } from '@/lib/session';
import { Tabs } from './tabs';
import { CardActionsMenu } from './card-actions-menu';
import '../../card.css';
import '../../card-extra.css';

export const dynamic = 'force-dynamic';

const СПОСОБ_ЭКСПЛУАТАЦИИ: Record<number, string> = {
  0: 'ЭЦН', 1: 'ШГН', 2: 'Фонтан', 3: 'ЭВН', 4: 'Газлифт',
};

const РЕШЕНИЕ: Record<string, { label: string; kind: string }> = {
  accept: { label: 'Принята', kind: 'ok' },
  reject: { label: 'Отклонена', kind: 'late' },
  clarify: { label: 'Требует уточнения', kind: 'warning' },
};

export default async function CardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getCard(Number(id));
  if (!card) notFound();

  const [пользователь, соседи, история, econ, скважина] = await Promise.all([
    currentUser(),
    getNeighbours(card.id),
    getWellHistory(card.wellNumber, card.fieldId, card.id),
    card.fieldId === null ? null : getWellEconomy(card.fieldId, card.wellNumber),
    /* Скважина из ВМАП читается один раз на карточку: она нужна и правой
       колонке, и прогнозу — плотности переводят ожидаемый прирост жидкости из
       кубометров в тонны. Стенд чужой и бывает недоступен, поэтому вся выборка
       в try: без неё карточка теряет правую колонку и рубли прогноза, но
       открывается. */
    читатьСкважину(card.wellId),
  ]);

  const прогноз = forecastTotal(econ, card.expectQzh, card.expectQn,
    скважина.well?.oilDensity ?? null, скважина.well?.waterDensity ?? null, WINDOW_DAYS);

  const c = card.showsSla
    ? control({ status: card.status, sentAt: card.sentAt, dueAt: card.dueAt, repliedAt: card.repliedAt })
    : { kind: 'none' as const, hours: 0 };

  const спорОДате = card.disputes.find((d) => d.subject === 'fact_date' && d.state === 'open');
  const спорОБазе = card.disputes.find((d) => d.subject === 'baseline' && d.state === 'open');
  const решение = card.decision ? РЕШЕНИЕ[card.decision.kind] : null;

  return (
    <main className="content content--card">
      <div className="cardhead">
        <div className="cardhead__top">
          <Hint text="К реестру">
            <Link className="cnbtn" href="/" aria-label="К реестру"><Icon id="back" size={20} /></Link>
          </Hint>
          <span className="cardhead__num">{card.number ?? 'Черновик'}</span>
          <span className="headstatus">
            <i className={`status__d status__d--${card.tone} ${card.filled ? '' : 'is-hollow'}`} />
            {card.statusName}
          </span>

          {card.showsSla && card.priority && (
            <>
              <span className={`prio prio--${card.priority} prio--pill`} title={card.priorityName ?? ''}>
                <Icon id="clock" />{card.slaHours} ч
              </span>
              <КонтрольОтвета kind={c.kind} hours={c.hours} sentAt={card.sentAt} />
            </>
          )}

          {card.completeness === 'partial' && (
            <span className="tag tag--warning">реализовано частично</span>
          )}
          {спорОДате && <span className="tag tag--late">дата реализации оспорена</span>}
          {спорОБазе && <span className="tag tag--late">база оспорена</span>}

          <div className="cardhead__trailing">
            <div className="pager">
              <Hint text="Предыдущая рекомендация">
                {соседи.prevId
                  ? <Link className="cnbtn" href={`/rec/${соседи.prevId}`} aria-label="Предыдущая рекомендация"><Icon id="prev" /></Link>
                  : <span className="cnbtn is-off" aria-label="Предыдущей рекомендации нет"><Icon id="prev" /></span>}
              </Hint>
              <span className="pager__pos" title="Позиция в реестре">
                {соседи.pos} из {соседи.total}
              </span>
              <Hint text="Следующая рекомендация">
                {соседи.nextId
                  ? <Link className="cnbtn" href={`/rec/${соседи.nextId}`} aria-label="Следующая рекомендация"><Icon id="next" /></Link>
                  : <span className="cnbtn is-off" aria-label="Следующей рекомендации нет"><Icon id="next" /></span>}
              </Hint>
            </div>
            <CardActionsMenu status={card.status} recId={card.id}
                             executor={пользователь?.side === 'executor'} />
          </div>
        </div>

        <div className="cardhead__where">
          {card.fieldName} · куст {card.kust ?? '—'} · скважина <b>{card.wellNumber}</b>
        </div>
        <div className="cardhead__hr" />
        <div className="metas">
          <div className="meta">
            <span className="meta__k">Направление</span>
            <span className="meta__v">{card.direction}</span>
          </div>
          <div className="meta">
            <span className="meta__k">Ответственный Исполнителя</span>
            <span className="meta__v">{card.executorName ?? card.authorName}</span>
          </div>
          <div className="meta">
            <span className="meta__k">Ответственный Заказчика</span>
            <span className="meta__v">{card.customerName ?? '—'}</span>
          </div>
          <div className="meta">
            <span className="meta__k">Решение Заказчика</span>
            <span className="meta__v">
              {решение
                ? <span className={`tag tag--${решение.kind}`}>{решение.label}</span>
                : <span className="mark">—</span>}
            </span>
          </div>
        </div>
      </div>

      <Прогноз card={card} прогноз={прогноз} />

      <div className="cardbody">
        <section className="panel panel--main">
          <Tabs recId={card.id} вкладки={вкладкиДля(РУЧНОЙ_ИСТОЧНИК)} counts={{
            files: card.attachmentsCount,
            log: card.commentsCount,
          }} />
          <div className="tabpane">{children}</div>
        </section>

        <aside className="context">
          <КарточкаСкважины данные={скважина} wellNumber={card.wellNumber} field={card.fieldName} />
          <div className="card">
            <div className="card__h">
              Ранее по этой скважине
              {история.total > история.items.length && <a href="#">все {история.total}</a>}
            </div>
            {история.items.length ? (
              <div className="prev">
                {история.items.map((p) => (
                  <Link key={p.id} className="prev__i" href={`/rec/${p.id}`}>
                    <div className="prev__t">
                      <b>{p.number}</b> · {дата(p.registeredAt)} · {p.statusName}
                    </div>
                    <div className="prev__p">{p.problem}</div>
                  </Link>
                ))}
              </div>
            ) : <div className="block__b">Других рекомендаций нет.</div>}
          </div>
        </aside>
      </div>
    </main>
  );
}

function КонтрольОтвета({
  kind, hours, sentAt,
}: {
  kind: string; hours: number; sentAt: Date | null;
}) {
  if (kind === 'none') return <span className="tag tag--default">нет срока</span>;
  if (kind === 'pending') {
    return <span className="tag tag--pending">передача {дата(sentAt, true)}</span>;
  }
  const подпись: Record<string, string> = {
    ok: 'в срок', late: 'с опозданием', overdue: 'просрочено', waiting: 'осталось',
  };
  return (
    <span className={`tag tag--${kind}`}>
      {подпись[kind]}{kind === 'ok' ? '' : ` ${fmtDur(hours)}`}
    </span>
  );
}

/* Ожидаемый результат — на месте, где в макете была лента статусов. Знак у ЭЭ
   читается наоборот: минус означает экономию, то есть хорошо, поэтому цвет
   ставится по смыслу, а не по знаку. */
const ОЖИДАЕМОЕ = [
  { k: 'Δ Qж', поле: 'expectQzh', ед: 'м³/сут', лучше: 'вверх', знаков: 1 },
  { k: 'Δ Qн', поле: 'expectQn', ед: 'т/сут', лучше: 'вверх', знаков: 1 },
  { k: 'Δ ЭЭ', поле: 'expectEe', ед: 'кВт·ч', лучше: 'вниз', знаков: 0 },
] as const;

function Прогноз({
  card, прогноз,
}: {
  card: { expectQzh: number | null; expectQn: number | null; expectEe: number | null };
  прогноз: number | null;
}) {
  const заполнен = ОЖИДАЕМОЕ.some((f) => card[f.поле] !== null);
  if (!заполнен) {
    return (
      <div className="forecast">
        <div className="forecast__empty">
          Ожидаемый результат ещё не заполнен — его вносят на четвёртом шаге мастера регистрации.
        </div>
      </div>
    );
  }

  return (
    <div className="forecast">
      <div className="fc fc--cap"><div className="fc__cap">Ожидаемый<br />результат</div></div>
      {ОЖИДАЕМОЕ.map((f) => {
        const v = card[f.поле];
        const тон = v === null || v === 0 ? ''
          : (f.лучше === 'вверх' ? v > 0 : v < 0) ? 'is-good' : 'is-bad';
        return (
          <div className="fc" key={f.k}>
            <div className="fc__k">{f.k}</div>
            <div className={`fc__v ${тон}`}>
              {прирост(v, f.знаков)}<span className="fc__u">{f.ед}</span>
            </div>
          </div>
        );
      })}
      <div className="fc fc--money">
        <div className="fc__k">Прогнозный эффект</div>
        <div className="fc__v">{рубли(прогноз)}<span className="fc__u">руб</span></div>
        <span className="fc__n">
          {прогноз === null ? 'ставки по скважине не заведены' : `за ${WINDOW_DAYS} суток окна`}
        </span>
      </div>
    </div>
  );
}

interface ДанныеСкважины {
  well: Awaited<ReturnType<typeof getWell>>;
  ряд: { date: Date; value: number | null }[];
  ошибка: string;
}

/* Параметры скважины и суточный ряд дебита — из ВМАП. Стенд Заказчика чужой и
   бывает недоступен; уронить из-за этого всю карточку нельзя, поэтому обе
   выборки в try, а вместо чисел показывается причина. */
async function читатьСкважину(wellId: number | null): Promise<ДанныеСкважины> {
  if (wellId === null) {
    return { well: null, ряд: [], ошибка: 'Скважина не сопоставлена с объектом ВМАП.' };
  }
  const конец = dayStart(new Date());
  const начало = new Date(конец.getTime() - 29 * 86400000);
  try {
    const [well, замеры] = await Promise.all([
      getWell(wellId),
      getMeasurementsWithLookback(wellId, PARAM.QZH_MEASURED, начало, конец),
    ]);
    return { well, ряд: dailySeries(замеры, начало, конец), ошибка: '' };
  } catch {
    return { well: null, ряд: [], ошибка: 'Стенд ВМАП сейчас недоступен — параметры скважины не прочитаны.' };
  }
}

function КарточкаСкважины({
  данные, wellNumber, field,
}: {
  данные: ДанныеСкважины; wellNumber: string; field: string;
}) {
  const { well, ряд, ошибка } = данные;
  const значения = ряд.map((d) => d.value).filter((v): v is number => v !== null);
  const мин = значения.length ? Math.min(...значения) : 0;
  const макс = значения.length ? Math.max(...значения) : 0;

  return (
    <>
      <div className="card">
        <div className="card__h">Скважина {wellNumber}</div>
        {ошибка ? <div className="block__b">{ошибка}</div> : (
          <dl className="params">
            <dt>Месторождение</dt><dd>{field}</dd>
            <dt>Способ эксплуатации</dt>
            <dd>{well?.operationMode === null || well?.operationMode === undefined
              ? '—' : (СПОСОБ_ЭКСПЛУАТАЦИИ[well.operationMode] ?? `код ${well.operationMode}`)}</dd>
            <dt>Пласт</dt><dd>{well?.plast ?? '—'}</dd>
            <dt>Плотность нефти</dt>
            <dd>{well?.oilDensity ? `${число(well.oilDensity, 0)} кг/м³` : '—'}</dd>
            <dt>Плотность воды</dt>
            <dd>{well?.waterDensity ? `${число(well.waterDensity, 0)} кг/м³` : '—'}</dd>
            <dt>Дебит жидкости, посл.</dt>
            <dd>{значения.length ? `${число(значения[значения.length - 1])} м³/сут` : '—'}</dd>
          </dl>
        )}
      </div>

      {значения.length > 1 && (
        <div className="card">
          <div className="card__h">Дебит жидкости, 30 суток</div>
          <Спарклайн ряд={ряд} мин={мин} макс={макс} />
          <div className="spark__cap">
            <span>{число(мин, 0)}</span><span>{число(макс, 0)} м³/сут</span>
          </div>
        </div>
      )}
    </>
  );
}

/* Разрывы в ряду не сглаживаются: сутки без замеров рисуются разрывом линии,
   а не прямой между соседями — протянутое значение и измеренное на графике
   должны различаться. */
function Спарклайн({
  ряд, мин, макс,
}: {
  ряд: { value: number | null }[]; мин: number; макс: number;
}) {
  const размах = макс - мин || 1;
  const отрезки: string[][] = [];
  let текущий: string[] = [];
  ряд.forEach((d, i) => {
    if (d.value === null) { if (текущий.length) отрезки.push(текущий); текущий = []; return; }
    const x = (i / Math.max(1, ряд.length - 1)) * 320;
    const y = 58 - ((d.value - мин) / размах) * 50;
    текущий.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (текущий.length) отрезки.push(текущий);

  return (
    <svg className="spark" viewBox="0 0 320 64" preserveAspectRatio="none">
      {отрезки.map((points, i) => (
        <polyline key={i} points={points.join(' ')} fill="none"
                  stroke="var(--infografic-accent)" strokeWidth="1.6"
                  strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
