/* Вкладка «Расчёт эффекта» — опыт с shadcn/ui.
 *
 * Порядок блоков сверху вниз повторяет порядок вопросов, которые задают, глядя
 * на цифру эффекта: сколько получилось → от чего считали → сколько окна прошло
 * → как шёл факт против базы → из чего сложились деньги → покажи по суткам →
 * чему тут верить.
 *
 * От версии на макете отличается только оформлением: разметка собрана на Card,
 * Table, Alert и Badge из shadcn, свои классы (.eff-*) не используются. Логика,
 * тексты и порядок блоков те же — сравнивать надо вид, а не содержание.
 *
 * Если посчитать нельзя, вкладка объясняет, чего не хватает. Пустой экран здесь
 * недопустим: примерно у трети фонда ставок нет, и «пусто» человек прочитает
 * как «эффекта нет», а не как «расчёт невозможен».
 */

import { notFound } from 'next/navigation';
import { getBaseline, getCard, type CardBaseline } from '@/db/card';
import { getEffect, WINDOW_DAYS, type EffectView } from '@/services/effect-store';
import { forecastTotal } from '@/domain/effect';
import { getWell } from '@/db/vmap';
import type { EffectDay } from '@/services/effect-window';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { дата, рубли, сутки, число, прирост } from '@/lib/format';
import { ТОН } from '../tone';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCard(Number(id));
  if (!card) notFound();

  const eff = await getEffect(card);
  if (!eff) return <ОкнаНет status={card.status} baseline={card.baseline} />;

  const спорОБазе = card.disputes.find((d) => d.subject === 'baseline' && d.state === 'open');
  const спорОДате = card.disputes.find((d) => d.subject === 'fact_date' && d.state === 'open');
  const предложенная = спорОБазе?.proposedBaselineId
    ? await getBaseline(спорОБазе.proposedBaselineId) : null;

  /* Плотности берутся у скважины, а не из расчёта: расчёт закрытого окна
     приходит из кэша, где их нет, — а шкала прогноза нужна и там. Запрос
     дешёвый: getWell в cache(), оболочка карточки уже сходила за той же
     скважиной в этом же рендере. */
  const скважина = card.wellId === null ? null
    : await getWell(card.wellId).catch(() => null);
  const прогноз = forecastTotal(eff.economy, card.expectQzh, card.expectQn,
    скважина?.oilDensity ?? null, скважина?.waterDensity ?? null, WINDOW_DAYS);
  const считалисьДеньги = eff.days.some((d) => d.money !== null);
  const закрыто = card.implementation?.closedAt ?? null;

  return (
    <div className="flex flex-col gap-6">
      {считалисьДеньги ? (
        <Card className="py-4">
          <CardContent className="flex flex-wrap items-start justify-between gap-4 px-4">
            <div>
              <div className="text-muted-foreground text-xs">Накопленный эффект</div>
              <div className={cn('text-4xl font-semibold tabular-nums',
                eff.total.total < 0 && 'text-[var(--status-error-text)]')}>
                {рубли(eff.total.total)}
                <span className="text-muted-foreground ml-1.5 text-base font-normal">руб</span>
              </div>
            </div>
            <div className="flex max-w-[46ch] flex-col items-end gap-1.5 text-right">
              <Badge variant="secondary" className={eff.isFinal ? ТОН.ok : ТОН.warning}>
                {eff.isFinal ? 'окончательный' : 'предварительный'}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {eff.isFinal
                  ? `Окно закрыто ${дата(закрыто ?? eff.windowTo)}, расчёт зафиксирован ${дата(eff.calculatedAt, true)}.`
                  : спорОБазе || спорОДате
                    ? `Итог предварительный: спор ${спорОБазе ? 'о базовых значениях' : 'о дате реализации'} не закрыт — от него зависит, с чем и с какого дня сравнивать факт.`
                    : `Итог предварительный: окно эффекта идёт, посчитано ${сутки(eff.elapsedDays)} из ${WINDOW_DAYS}.`}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ПочемуНеПосчитано problems={eff.problems} />
      )}

      {считалисьДеньги && eff.problems.length > 0 && (
        <ПочемуНеПосчитано problems={eff.problems} частично />
      )}

      <Раздел title="База, от которой считается прирост">
        {card.baseline ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ЯчейкаБазы k="Дебит жидкости" v={card.baseline.baseQzh} ед="м³/сут" />
              <ЯчейкаБазы k="Дебит нефти" v={card.baseline.baseQn} ед="т/сут" />
              <ЯчейкаБазы k="Энергопотребление" v={card.baseline.baseEe} ед="кВт·ч/сут" знаков={0} />
            </div>
            <Сноска>
              {ИСТОЧНИК_БАЗЫ[card.baseline.source]}
              {card.baseline.periodFrom && ` за период ${дата(card.baseline.periodFrom)} — ${дата(card.baseline.periodTo)}`}
              {`; внесена ${card.baseline.authorName}, ${дата(card.baseline.createdAt, true)}.`}
              {card.baseline.note && ` ${card.baseline.note}`}
            </Сноска>
          </>
        ) : (
          <div className="text-muted-foreground text-sm">
            База не задана. Прирост считать не от чего — вводится Исполнителем при регистрации.
          </div>
        )}

        {спорОБазе && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>База оспорена Заказчиком</AlertTitle>
            <AlertDescription className="text-foreground/80 block">
              <div className="text-muted-foreground text-xs">
                {спорОБазе.openedByName}, {дата(спорОБазе.openedAt, true)}
              </div>
              <div className="mt-1">{спорОБазе.reason}</div>

              {предложенная && (
                <Table className="mt-3">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Показатель</TableHead>
                      <TableHead className="text-right">Действующая</TableHead>
                      <TableHead className="text-right">Предложена Заказчиком</TableHead>
                      <TableHead className="text-right">Разница</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <СтрокаСпора k="Дебит жидкости, м³/сут" было={card.baseline?.baseQzh ?? null} стало={предложенная.baseQzh} />
                    <СтрокаСпора k="Дебит нефти, т/сут" было={card.baseline?.baseQn ?? null} стало={предложенная.baseQn} />
                    <СтрокаСпора k="Энергопотребление, кВт·ч/сут" было={card.baseline?.baseEe ?? null} стало={предложенная.baseEe} знаков={0} />
                  </TableBody>
                </Table>
              )}
              {/* Расчёт по предложенной базе здесь не показывается намеренно: пока
                  спор открыт, действующей остаётся принятая база, и два итога
                  рядом читались бы как «выбери, какой нравится». */}
              <div className="text-muted-foreground mt-3 text-xs">
                Пока спор не разобран, эффект считается по действующей базе, а итог помечен
                предварительным. Окно при этом не останавливается.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {спорОДате && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Дата реализации оспорена</AlertTitle>
            <AlertDescription className="text-foreground/80 block">
              <div className="text-muted-foreground text-xs">
                {спорОДате.openedByName}, {дата(спорОДате.openedAt, true)} · предложена {дата(спорОДате.proposedDate)}
              </div>
              <div className="mt-1">{спорОДате.reason}</div>
              <div className="text-muted-foreground mt-3 text-xs">
                Если дату примут, окно сдвинется и расчёт пересоберётся по сохранённым суткам —
                заново замеры не запрашиваются.
              </div>
            </AlertDescription>
          </Alert>
        )}
      </Раздел>

      <Раздел title="Прогресс окна">
        <ПрогрессОкна eff={eff} прогноз={прогноз} закрыто={закрыто} />
      </Раздел>

      <Раздел title="Факт против базы">
        <div className="grid gap-4 xl:grid-cols-2">
          <График days={eff.days} поле="factQzh" база={card.baseline?.baseQzh ?? null}
                  заголовок="Дебит жидкости, м³/сут" />
          <График days={eff.days} поле="factQn" база={card.baseline?.baseQn ?? null}
                  заголовок="Дебит нефти, т/сут" />
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <i className="h-0.5 w-4 rounded-full bg-[var(--chart-1)]" />факт по суткам
          </span>
          <span className="flex items-center gap-1.5">
            <i className="border-muted-foreground h-0 w-4 border-t border-dashed" />база
          </span>
          <span>разрыв линии — суток без замеров и без чего протянуть</span>
        </div>
      </Раздел>

      {считалисьДеньги && eff.economy && (
        <Раздел title="Из чего сложились деньги">
          <Статьи eff={eff} />
        </Раздел>
      )}

      <Card className="py-0">
        <details className="group">
          <summary className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium">
            <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
            Посуточный расчёт — {сутки(eff.daysTotal)}
          </summary>
          <div className="px-4 pb-4">
            <div className="max-h-[420px] overflow-auto rounded-lg border">
              <ПосуточнаяТаблица days={eff.days} />
            </div>
            <Сноска>
              Из этой таблицы собирается Форма 5 — расчёт технологического и экономического эффекта.
            </Сноска>
          </div>
        </details>
      </Card>

      <Раздел title="Качество данных">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ЯчейкаКачества v={`${eff.daysWithData} из ${eff.daysTotal}`} k="суток с посчитанным дебитом" />
          <ЯчейкаКачества v={String(eff.daysCarried)} k="суток без своих замеров, значение протянуто" />
          <ЯчейкаКачества v={String(eff.daysTotal - eff.daysWithData)} k="суток без данных вовсе" />
          <ЯчейкаКачества
            v={`${число(среднееПокрытие(eff.days) * 100, 0)} %`}
            k="средняя опора суток на собственные замеры" />
        </div>
        <Сноска>
          Суточное значение — интеграл по времени, а не среднее из замеров: замеры в 08:00 и в 22:00
          описывают куски суток разной длины. Между замерами последнее значение протягивается,
          разрывы бывают до полусотни суток.
          {' '}Остановленную скважину от скважины без замеров модуль пока не отличает —
          для этого нужен параметр «Состояние по ТМ», он в расчёт не заведён.
          {eff.fromCache && ` Показан сохранённый расчёт от ${дата(eff.calculatedAt, true)}: окно закрыто, и цифра больше не пересчитывается.`}
        </Сноска>
      </Раздел>
    </div>
  );
}

/* ------------------------------ общее ------------------------------ */

function Раздел({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

function Сноска({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mt-2 max-w-[95ch] text-xs leading-relaxed">{children}</p>;
}

/* ------------------------------ окна ещё нет ------------------------------ */

const БЕЗ_ОКНА: Record<string, string> = {
  draft: 'Это черновик: он ещё не зарегистрирован, и до окна эффекта ему далеко.',
  registered: 'Рекомендация зарегистрирована и ждёт передачи Заказчику.',
  sent: 'Рекомендация у Заказчика на рассмотрении.',
  review: 'Рекомендация у Заказчика на рассмотрении.',
  clarify: 'Заказчик запросил уточнение — круг ещё не закрыт.',
  approved: 'Заказчик согласовал мероприятие, но факт реализации ещё не зафиксирован.',
  rejected: 'Рекомендация отклонена Заказчиком — мероприятия не будет, считать нечего.',
  cancelled: 'Рекомендация отменена Исполнителем — мероприятия не будет, считать нечего.',
};

function ОкнаНет({ status, baseline }: { status: string; baseline: CardBaseline | null }) {
  const мёртвая = status === 'rejected' || status === 'cancelled';
  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <AlertTitle>Расчёта пока нет</AlertTitle>
        <AlertDescription className="block">
          <div>{БЕЗ_ОКНА[status] ?? 'Окно эффекта по этой рекомендации не открыто.'}</div>
          {!мёртвая && (
            <div className="mt-2">
              Окно на {WINDOW_DAYS} суток открывается в тот момент, когда Исполнитель фиксирует
              факт реализации по телеметрии. С этого дня и начинается расчёт.
            </div>
          )}
        </AlertDescription>
      </Alert>

      {baseline && (
        <Раздел title="База уже внесена">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ЯчейкаБазы k="Дебит жидкости" v={baseline.baseQzh} ед="м³/сут" />
            <ЯчейкаБазы k="Дебит нефти" v={baseline.baseQn} ед="т/сут" />
            <ЯчейкаБазы k="Энергопотребление" v={baseline.baseEe} ед="кВт·ч/сут" знаков={0} />
          </div>
        </Раздел>
      )}
    </div>
  );
}

function ПочемуНеПосчитано({ problems, частично }: { problems: string[]; частично?: boolean }) {
  return (
    <Alert>
      <AlertTitle>
        {частично ? 'Расчёт неполный' : 'Эффект в деньгах посчитать не удалось'}
      </AlertTitle>
      <AlertDescription className="block">
        <ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        {!частично && (
          <div className="mt-2">
            Деньги считаются, только когда известны оба прироста — и по жидкости, и по нефти:
            часть статей висит на жидкости, часть на нефти, и «половина расчёта» дала бы
            заниженный эффект, выданный за полный.
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

/* ------------------------------ база ------------------------------ */

const ИСТОЧНИК_БАЗЫ: Record<string, string> = {
  manual: 'Внесена вручную',
  measured: 'Посчитана по замерам',
  disputed: 'Предложена в споре',
};

function ЯчейкаБазы({ k, v, ед, знаков = 1 }: {
  k: string; v: number | null; ед: string; знаков?: number;
}) {
  return (
    <div className="bg-muted/50 flex flex-col gap-1 rounded-lg p-3">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className="text-xl font-medium tabular-nums">
        {число(v, знаков)}
        <span className="text-muted-foreground ml-1 text-xs font-normal">{ед}</span>
      </span>
    </div>
  );
}

function СтрокаСпора({ k, было, стало, знаков = 1 }: {
  k: string; было: number | null; стало: number | null; знаков?: number;
}) {
  const разница = было !== null && стало !== null ? стало - было : null;
  return (
    <TableRow>
      <TableCell>{k}</TableCell>
      <TableCell className="text-right tabular-nums">{число(было, знаков)}</TableCell>
      <TableCell className="text-right tabular-nums">{число(стало, знаков)}</TableCell>
      <TableCell className="text-right tabular-nums">{прирост(разница, знаков)}</TableCell>
    </TableRow>
  );
}

/* ------------------------------ прогресс окна ------------------------------ */

/* Шкала на все 90 суток. Полная шкала — прогнозный эффект, заполнение —
   накопленный факт. Прогноз НЕ пересчитывается на прошедшие сутки: пересчитанный,
   он перестаёт быть тем, с чем сравнивают. Вместо пересчёта — засечка «где факт
   должен быть сейчас», по ней и видно опережение или отставание.
   Решение Эльдара. */
function ПрогрессОкна({ eff, прогноз, закрыто }: {
  eff: EffectView; прогноз: number | null; закрыто: Date | null;
}) {
  const доля = (v: number) => Math.max(0, Math.min(1, v));
  const процент = (v: number) => `${(доля(v) * 100).toFixed(1)}%`;

  const прошло = eff.elapsedDays / eff.windowDays;

  if (прогноз === null || прогноз <= 0) {
    /* Прогноза нет — шкала показывает только ход времени. Рисовать вместо
       прогноза ноль нельзя: любой факт выглядел бы бесконечным перевыполнением. */
    return (
      <div>
        <div className="bg-muted relative h-3 overflow-hidden rounded-full">
          <div className="bg-muted-foreground/40 h-full rounded-full" style={{ width: процент(прошло) }} />
        </div>
        <div className="text-muted-foreground mt-1.5 flex justify-between text-xs tabular-nums">
          <span>{дата(eff.windowFrom)}</span>
          <span><b className="text-foreground font-medium">{сутки(eff.elapsedDays)}</b> из {eff.windowDays}</span>
          <span>{дата(eff.windowTo)}</span>
        </div>
        <Сноска>
          Прогнозный эффект не с чем сравнить: {прогноз === null
            ? 'у рекомендации не заполнены ожидаемые приросты либо не заведены ставки по скважине'
            : 'ожидаемый эффект по введённым приростам получается нулевым или отрицательным'}.
          Шкала показывает только, сколько окна прошло.
        </Сноска>
      </div>
    );
  }

  const факт = eff.total.total;
  const выполнение = факт / прогноз;
  const ожидается = прогноз * доля(прошло);
  const отставание = факт - ожидается;

  const позицияЗасечки = доля(прошло) * 100;
  /* Подпись засечки у самых краёв шкалы прижимается к краю, а не центрируется:
     иначе она уезжает за пределы панели и обрезается. */
  const подпись = позицияЗасечки < 15
    ? { left: 0 }
    : позицияЗасечки > 85
      ? { right: 0 }
      : { left: '50%', transform: 'translateX(-50%)' };

  return (
    <div className={cn(закрыто ? '' : 'pt-6')}>
      <div className="bg-muted relative h-3 rounded-full">
        <div className={cn('h-full rounded-full',
          факт < 0 ? 'bg-[var(--status-error-text)]'
            : выполнение > 1 ? 'bg-[var(--status-success-text)]' : 'bg-primary')}
             style={{ width: процент(факт < 0 ? 0.01 : выполнение) }} />
        {!закрыто && (
          <div className="bg-foreground absolute -top-1 h-5 w-px"
               style={{ left: `${позицияЗасечки}%` }}
               title="Где накопленный факт должен быть сейчас, если прогноз сбывается ровно">
            <span className="text-muted-foreground absolute -top-5 text-xs whitespace-nowrap"
                  style={подпись}>
              к этому дню ожидается {рубли(ожидается)} руб
            </span>
          </div>
        )}
      </div>

      <div className="text-muted-foreground mt-1.5 flex justify-between text-xs tabular-nums">
        <span>{дата(eff.windowFrom)}</span>
        <span><b className="text-foreground font-medium">{сутки(eff.elapsedDays)}</b> из {eff.windowDays}</span>
        <span>прогноз {рубли(прогноз)} руб</span>
      </div>

      <Сноска>
        Накоплено {рубли(факт)} руб — {число(выполнение * 100, 0)} % прогноза.
        {закрыто
          ? ` Окно закрыто ${дата(закрыто)}${eff.elapsedDays < eff.windowDays ? ' досрочно' : ''}: ${
              выполнение >= 1 ? 'прогноз перекрыт' : `в прогноз не уложились на ${рубли(прогноз - факт)} руб`}.`
          : отставание >= 0
            ? ` Это на ${рубли(отставание)} руб больше, чем ожидалось к этому дню.`
            : ` Это на ${рубли(-отставание)} руб меньше, чем ожидалось к этому дню.`}
      </Сноска>
    </div>
  );
}

/* ------------------------------ график ------------------------------ */

/* Разрывы не сглаживаются: сутки без данных — это разрыв линии, а не прямая
   между соседями. Прямая соврала бы, что в эти сутки что-то измеряли. */
function График({ days, поле, база, заголовок }: {
  days: EffectDay[];
  поле: 'factQzh' | 'factQn';
  база: number | null;
  заголовок: string;
}) {
  const Ш = 640; const В = 170;
  const поля = { верх: 12, низ: 22, лево: 46, право: 8 };
  const значения = days.map((d) => d[поле]).filter((v): v is number => v !== null);

  if (!значения.length) {
    return (
      <div className="rounded-lg border p-3">
        <div className="text-muted-foreground mb-1 text-xs">{заголовок}</div>
        <div className="text-muted-foreground text-sm">Нет данных за окно.</div>
      </div>
    );
  }

  const все = база === null ? значения : [...значения, база];
  let мин = Math.min(...все); let макс = Math.max(...все);
  const запас = (макс - мин) * 0.12 || Math.abs(макс) * 0.1 || 1;
  мин -= запас; макс += запас;

  const x = (i: number) => поля.лево + (i / Math.max(1, days.length - 1)) * (Ш - поля.лево - поля.право);
  const y = (v: number) => поля.верх + (1 - (v - мин) / (макс - мин)) * (В - поля.верх - поля.низ);

  const отрезки: string[][] = [];
  let текущий: string[] = [];
  days.forEach((d, i) => {
    const v = d[поле];
    if (v === null) { if (текущий.length > 1) отрезки.push(текущий); текущий = []; return; }
    текущий.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (текущий.length > 1) отрезки.push(текущий);

  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground mb-1 text-xs">{заголовок}</div>
      <svg viewBox={`0 0 ${Ш} ${В}`} role="img" aria-label={заголовок} className="w-full">
        {[макс, (макс + мин) / 2, мин].map((v, i) => (
          <g key={i}>
            <line x1={поля.лево} x2={Ш - поля.право} y1={y(v)} y2={y(v)}
                  stroke="var(--border)" strokeWidth="1" />
            <text x={поля.лево - 6} y={y(v) + 4} textAnchor="end"
                  fill="var(--muted-foreground)" fontSize="11">{число(v, 1)}</text>
          </g>
        ))}

        {база !== null && (
          <>
            <line x1={поля.лево} x2={Ш - поля.право} y1={y(база)} y2={y(база)}
                  stroke="var(--muted-foreground)" strokeWidth="1.4" strokeDasharray="5 4" />
            <text x={Ш - поля.право} y={y(база) - 5} textAnchor="end"
                  fill="var(--muted-foreground)" fontSize="11">база {число(база, 1)}</text>
          </>
        )}

        {отрезки.map((points, i) => (
          <polyline key={i} points={points.join(' ')} fill="none"
                    stroke="var(--chart-1)" strokeWidth="1.8"
                    strokeLinejoin="round" strokeLinecap="round" />
        ))}

        <text x={поля.лево} y={В - 5} fill="var(--muted-foreground)" fontSize="11">
          {дата(days[0]?.date)}
        </text>
        <text x={Ш - поля.право} y={В - 5} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">
          {дата(days[days.length - 1]?.date)}
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------ статьи ------------------------------ */

/* Ставка, объём и сумма в одной строке: спор с Заказчиком идёт по статьям, и
   должно быть видно не только «сколько», но и «из чего» — ставка × накопленный
   прирост. */
function Статьи({ eff }: { eff: EffectView }) {
  const econ = eff.economy!;
  /* Суммируются только те сутки, что дошли до денег: сутки без замеров в
     объёме статьи участвовать не должны, иначе объём и сумма разойдутся. */
  const дQzhT = eff.days.reduce((s, d) => s + (d.money ? d.deltaQzhT ?? 0 : 0), 0);
  const дQn = eff.days.reduce((s, d) => s + (d.money ? d.deltaQn ?? 0 : 0), 0);

  const нефть = 'т нефти';
  const жидкость = 'т жидкости';
  const строки: [string, string, number, string, number, number][] = [
    ['Выручка от прироста нефти', 'цена нефти (МСУ)', econ.oilPrice, нефть, дQn, eff.total.revenue],
    ['НДПИ и НДД', `ставка по пласту «${econ.taxPlast}»`, econ.ndpi, нефть, дQn, -eff.total.ndpi],
    ['Электроэнергия на жидкость', 'ставка месторождения', econ.eeLiquid, жидкость, дQzhT, -eff.total.eeLiquid],
    ['Электроэнергия на нефть', 'ставка месторождения', econ.eeOil, нефть, дQn, -eff.total.eeOil],
    ['Деэмульгаторы', 'ставка месторождения', econ.chem, нефть, дQn, -eff.total.chem],
  ];

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Статья</TableHead>
              <TableHead>Ставка</TableHead>
              <TableHead className="text-right">руб/т</TableHead>
              <TableHead className="text-right">Прирост за окно</TableHead>
              <TableHead className="text-right">Сумма, руб</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {строки.map(([имя, пояснение, ставка, едОбъёма, объём, сумма]) => (
              <TableRow key={имя}>
                <TableCell>{имя}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{пояснение}</TableCell>
                <TableCell className="text-right tabular-nums">{число(ставка, 2)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {прирост(объём, 1)}
                  <span className="text-muted-foreground ml-1 text-xs">{едОбъёма}</span>
                </TableCell>
                <TableCell className={cn('text-right tabular-nums',
                  сумма < 0 ? 'text-[var(--status-error-text)]' : 'text-[var(--status-success-text)]')}>
                  {рубли(сумма)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-medium">
              <TableCell colSpan={4}>Эффект за окно</TableCell>
              <TableCell className="text-right tabular-nums">{рубли(eff.total.total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Сноска>
        Ставки взяты по паре «месторождение + номер скважины»: месторождение в модели Заказчика —
        «{econ.sourceName}», налоговый пласт — «{econ.taxPlast}»
        {econ.plast && `, пласт по ВМАП — «${econ.plast}»`}.
        {' '}Жидкость входит в формулу в тоннах, как в шаблоне Заказчика, а ВМАП меряет её в
        кубометрах: прирост переведён в массу по плотностям скважины
        {eff.oilDensity && eff.waterDensity
          ? ` — нефть ${число(eff.oilDensity, 0)}, вода ${число(eff.waterDensity, 0)} кг/м³`
          : ''}.
        {' '}Расчёт ведётся по фактическим суткам, поэтому коэффициента эксплуатации в формуле нет:
        сутки простоя приходят нулевым приростом сами, и поправка задвоилась бы.
      </Сноска>
    </>
  );
}

/* ------------------------------ посуточно ------------------------------ */

function ПосуточнаяТаблица({ days }: { days: EffectDay[] }) {
  return (
    <Table>
      <TableHeader className="bg-card sticky top-0">
        <TableRow>
          <TableHead>Сутки</TableHead>
          <TableHead className="text-right">Qж факт, м³</TableHead>
          <TableHead className="text-right">Δ Qж, м³</TableHead>
          <TableHead className="text-right">Δ Qж, т</TableHead>
          <TableHead className="text-right">Qн факт</TableHead>
          <TableHead className="text-right">Δ Qн</TableHead>
          <TableHead className="text-right">Замеров</TableHead>
          <TableHead className="text-right">Опора</TableHead>
          <TableHead className="text-right">Эффект, руб</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {days.map((d) => (
          <TableRow key={d.date.toISOString()}
                    className={cn(d.factQzh === null && 'text-muted-foreground/60',
                      d.factQzh !== null && d.points === 0 && 'text-muted-foreground')}>
            <TableCell>{дата(d.date)}</TableCell>
            <TableCell className="text-right">{число(d.factQzh, 1)}</TableCell>
            <TableCell className="text-right">{прирост(d.deltaQzh, 1)}</TableCell>
            <TableCell className="text-right">{прирост(d.deltaQzhT, 1)}</TableCell>
            <TableCell className="text-right">{число(d.factQn, 2)}</TableCell>
            <TableCell className="text-right">{прирост(d.deltaQn, 2)}</TableCell>
            <TableCell className="text-right">{d.factQzh === null ? '—' : d.points}</TableCell>
            <TableCell className="text-right">
              {d.factQzh === null ? '—' : `${число(d.coverage * 100, 0)} %`}
            </TableCell>
            <TableCell className={cn('text-right',
              d.money && d.money.total < 0 && 'text-[var(--status-error-text)]')}>
              {d.money ? рубли(d.money.total) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ------------------------------ качество ------------------------------ */

function ЯчейкаКачества({ v, k }: { v: string; k: string }) {
  return (
    <div className="bg-muted/50 flex flex-col gap-1 rounded-lg p-3">
      <span className="text-xl font-medium tabular-nums">{v}</span>
      <span className="text-muted-foreground text-xs leading-tight">{k}</span>
    </div>
  );
}

/** Средняя доля суток, опирающаяся на собственные замеры, а не на протяжку. */
function среднееПокрытие(days: EffectDay[]): number {
  if (!days.length) return 0;
  return days.reduce((s, d) => s + d.coverage, 0) / days.length;
}
