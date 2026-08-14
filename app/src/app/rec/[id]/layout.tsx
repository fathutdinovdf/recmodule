/* Оболочка карточки рекомендации — опыт с shadcn/ui.
 *
 * Это ветка shadcn-card. Здесь карточка собрана целиком на компонентах shadcn
 * и утилитах Tailwind: card.css и card-extra.css не подключаются вовсе. Цвета
 * при этом остались ВМАП — они приходят через мост в shadcn.css, а там, где
 * семантики shadcn не хватает (статусные тона, инфографика), токен ВМАП
 * подставляется в утилиту напрямую: bg-[var(--status-success-light-bg)].
 *
 * Оболочка приложения (шапка, левая навигация) намеренно оставлена от макета:
 * смысл опыта — увидеть, как модуль в пластике shadcn смотрится внутри ВМАП, а
 * не подменить ВМАП целиком.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getCard, getNeighbours, getWellHistory } from '@/db/card';
import { getWellEconomy } from '@/db/economy';
import { getWell, getMeasurementsWithLookback, PARAM } from '@/db/vmap';
import { dailySeries, dayStart } from '@/domain/measurements';
import { forecastTotal } from '@/domain/effect';
import { control, fmtDur } from '@/domain/workhours';
import { WINDOW_DAYS } from '@/services/effect-store';
import { дата, число, прирост, рубли } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Tabs } from './tabs';
import { ТОН } from './tone';

export const dynamic = 'force-dynamic';

const СПОСОБ_ЭКСПЛУАТАЦИИ: Record<number, string> = {
  0: 'ЭЦН', 1: 'ШГН', 2: 'Фонтан', 3: 'ЭВН', 4: 'Газлифт',
};

const РЕШЕНИЕ: Record<string, { label: string; тон: string }> = {
  accept: { label: 'Принята', тон: 'ok' },
  reject: { label: 'Отклонена', тон: 'late' },
  clarify: { label: 'Требует уточнения', тон: 'warning' },
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

  const [соседи, история, econ, скважина] = await Promise.all([
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
    <AppShell>
      <main className="content gap-4">
        <Card className="gap-4 py-4">
          <CardHeader className="gap-0 px-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/" title="К реестру"
                    className="hover:bg-accent text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-md">
                <ArrowLeft className="size-4" />
              </Link>
              <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums">
                {card.number ?? 'Черновик'}
              </CardTitle>
              <Badge variant="secondary" className={cn('gap-1.5', ТОН[card.tone] ?? ТОН.default)}>
                <i className={cn('size-2 rounded-full', card.filled
                  ? 'bg-current' : 'border-current border bg-transparent')} />
                {card.statusName}
              </Badge>

              {card.showsSla && card.priority && (
                <>
                  <Badge variant="outline" className="gap-1" title={card.priorityName ?? ''}>
                    <Clock className="size-3" />{card.slaHours} ч
                  </Badge>
                  <КонтрольОтвета kind={c.kind} hours={c.hours} sentAt={card.sentAt} />
                </>
              )}

              {card.completeness === 'partial' && (
                <Badge variant="secondary" className={ТОН.warning}>реализовано частично</Badge>
              )}
              {спорОДате && <Badge variant="secondary" className={ТОН.late}>дата реализации оспорена</Badge>}
              {спорОБазе && <Badge variant="secondary" className={ТОН.late}>база оспорена</Badge>}

              <div className="ml-auto flex items-center gap-1">
                <Листалка href={соседи.prevId} title="Предыдущая в реестре"><ChevronLeft className="size-4" /></Листалка>
                <span className="text-muted-foreground px-1 text-xs tabular-nums" title="Позиция в реестре">
                  {соседи.pos} из {соседи.total}
                </span>
                <Листалка href={соседи.nextId} title="Следующая в реестре"><ChevronRight className="size-4" /></Листалка>
              </div>
            </div>

            <div className="text-muted-foreground mt-1.5 text-sm">
              {card.fieldName} · куст {card.kust ?? '—'} · скважина{' '}
              <b className="text-foreground font-medium">{card.wellNumber}</b>
            </div>
          </CardHeader>

          <Separator />

          <CardContent className="grid grid-cols-2 gap-4 px-4 lg:grid-cols-4">
            <Мета k="Направление" v={card.direction} />
            <Мета k="Ответственный Исполнителя" v={card.executorName ?? card.authorName} />
            <Мета k="Ответственный Заказчика" v={card.customerName ?? '—'} />
            <Мета k="Решение Заказчика" v={решение
              ? <Badge variant="secondary" className={ТОН[решение.тон]}>{решение.label}</Badge>
              : <span className="text-muted-foreground">—</span>} />
          </CardContent>
        </Card>

        <Прогноз card={card} прогноз={прогноз} />

        <div className="flex min-h-0 flex-1 gap-4">
          <Card className="min-w-0 flex-1 gap-0 overflow-hidden py-0">
            <div className="border-b px-4 py-2.5">
              <Tabs recId={card.id} counts={{ log: card.commentsCount }} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          </Card>

          <aside className="flex w-[280px] flex-none flex-col gap-4 overflow-y-auto">
            <КарточкаСкважины данные={скважина} wellNumber={card.wellNumber} field={card.fieldName} />
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm font-medium">Ранее по этой скважине</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                {история.items.length ? (
                  <div className="flex flex-col">
                    {история.items.map((p) => (
                      <Link key={p.id} href={`/rec/${p.id}`}
                            className="hover:bg-accent -mx-2 rounded-md px-2 py-1.5">
                        <div className="text-xs tabular-nums">
                          <b className="font-medium">{p.number}</b> · {дата(p.registeredAt)} · {p.statusName}
                        </div>
                        <div className="text-muted-foreground line-clamp-2 text-xs">{p.problem}</div>
                      </Link>
                    ))}
                  </div>
                ) : <div className="text-muted-foreground text-sm">Других рекомендаций нет.</div>}
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

function Мета({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className="text-sm">{v}</span>
    </div>
  );
}

function Листалка({ href, title, children }: {
  href: number | null; title: string; children: React.ReactNode;
}) {
  const классы = 'grid size-8 place-items-center rounded-md border';
  return href
    ? <Link href={`/rec/${href}`} title={title} className={cn(классы, 'hover:bg-accent')}>{children}</Link>
    : <span className={cn(классы, 'text-muted-foreground/40')}>{children}</span>;
}

function КонтрольОтвета({
  kind, hours, sentAt,
}: {
  kind: string; hours: number; sentAt: Date | null;
}) {
  if (kind === 'none') return <Badge variant="secondary" className={ТОН.default}>нет срока</Badge>;
  if (kind === 'pending') {
    return <Badge variant="secondary" className={ТОН.pending}>передача {дата(sentAt, true)}</Badge>;
  }
  const подпись: Record<string, string> = {
    ok: 'в срок', late: 'с опозданием', overdue: 'просрочено', waiting: 'осталось',
  };
  return (
    <Badge variant="secondary" className={ТОН[kind] ?? ТОН.default}>
      {подпись[kind]}{kind === 'ok' ? '' : ` ${fmtDur(hours)}`}
    </Badge>
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
      <Card className="py-3">
        <CardContent className="text-muted-foreground px-4 text-sm">
          Ожидаемый результат ещё не заполнен — его вносят на четвёртом шаге мастера регистрации.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-3">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4">
        <div className="text-muted-foreground text-xs leading-tight">Ожидаемый<br />результат</div>
        {ОЖИДАЕМОЕ.map((f) => {
          const v = card[f.поле];
          const тон = v === null || v === 0 ? ''
            : (f.лучше === 'вверх' ? v > 0 : v < 0)
              ? 'text-[var(--status-success-text)]' : 'text-[var(--status-error-text)]';
          return (
            <div key={f.k} className="flex flex-col gap-0.5">
              <div className="text-muted-foreground text-xs">{f.k}</div>
              <div className={cn('text-lg font-medium tabular-nums', тон)}>
                {прирост(v, f.знаков)}
                <span className="text-muted-foreground ml-1 text-xs font-normal">{f.ед}</span>
              </div>
            </div>
          );
        })}
        <div className="ml-auto flex flex-col gap-0.5 text-right">
          <div className="text-muted-foreground text-xs">Прогнозный эффект</div>
          <div className="text-lg font-medium tabular-nums">
            {рубли(прогноз)}<span className="text-muted-foreground ml-1 text-xs font-normal">руб</span>
          </div>
          <div className="text-muted-foreground text-xs">
            {прогноз === null ? 'ставки по скважине не заведены' : `за ${WINDOW_DAYS} суток окна`}
          </div>
        </div>
      </CardContent>
    </Card>
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

  const строки: [string, React.ReactNode][] = [
    ['Месторождение', field],
    ['Способ эксплуатации', well?.operationMode === null || well?.operationMode === undefined
      ? '—' : (СПОСОБ_ЭКСПЛУАТАЦИИ[well.operationMode] ?? `код ${well.operationMode}`)],
    ['Пласт', well?.plast ?? '—'],
    ['Плотность нефти', well?.oilDensity ? `${число(well.oilDensity, 0)} кг/м³` : '—'],
    ['Плотность воды', well?.waterDensity ? `${число(well.waterDensity, 0)} кг/м³` : '—'],
    ['Дебит жидкости, посл.', значения.length ? `${число(значения[значения.length - 1])} м³/сут` : '—'],
  ];

  return (
    <>
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Скважина {wellNumber}</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {ошибка ? <div className="text-muted-foreground text-sm">{ошибка}</div> : (
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
              {строки.map(([k, v]) => (
                <div key={k} className="col-span-2 grid grid-cols-subgrid items-baseline">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {значения.length > 1 && (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm font-medium">Дебит жидкости, 30 суток</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <Спарклайн ряд={ряд} мин={мин} макс={макс} />
            <div className="text-muted-foreground mt-1 flex justify-between text-xs tabular-nums">
              <span>{число(мин, 0)}</span><span>{число(макс, 0)} м³/сут</span>
            </div>
          </CardContent>
        </Card>
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
    <svg className="h-16 w-full" viewBox="0 0 320 64" preserveAspectRatio="none">
      {отрезки.map((points, i) => (
        <polyline key={i} points={points.join(' ')} fill="none"
                  stroke="var(--chart-1)" strokeWidth="1.6"
                  strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
