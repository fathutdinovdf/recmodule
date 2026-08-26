'use client';

/* Календарь суточного факта с вводом через окно дня.
 *
 * Каждый день — своя кнопка со своим Popover. Так окно само встаёт у нужной
 * клетки, без ручного позиционирования якоря; содержимое Radix монтирует
 * только у открытого, поэтому девяносто окон в разметке ничего не стоят.
 *
 * Заливка клетки кодирует происхождение значения, а не «выбранность»:
 * сплошная — своё внесённое значение; кольцо — своего нет, взято протянутое с
 * прошлых суток (в расчёт идёт, в базу не берётся); пунктир — тянуть ещё
 * нечего, до этих суток не внесли ничего. Точка в углу значит, что значение
 * правили и в окне есть история.
 *
 * Раскрашиваются только сутки окна эффекта. Период базы и соседние сутки
 * остаются приглушёнными: база вносится руками, и суточные значения за тот
 * период на неё не влияют.
 */

import * as React from 'react';
import { ru } from 'date-fns/locale';
import { History, TriangleAlert } from 'lucide-react';
import { Calendar } from '@/components/ui/Calendar';
import {
  Popover, PopoverTrigger, PopoverContent,
  PopoverHeader, PopoverTitle, PopoverDescription,
} from '@/components/ui/Popover';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/animate-ui/components/radix/accordion';
import { сохранитьСутки, историяСуток, type DayActionState } from './actions';

export interface ДеньКалендаря {
  iso: string;
  qzh: number | null;
  watercut: number | null;
  ee: number | null;
  правок: number;
  /** Откуда протянется значение, если своего нет. null — тянуть нечего. */
  протянутоС: string | null;
  протянутоеЗначение: number | null;
  /** Берётся ли этот день из ручного ввода, а не из телеметрии ВМАП. */
  ручные: boolean;
  вБазе: boolean;
  вОкне: boolean;
  будущее: boolean;
}

type Событие = NonNullable<DayActionState['history']>[number];

const дата = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const число = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
const ПАРАМЕТР: Record<number, string> = {
  1: 'Дебит жидкости', 7: 'Обводнённость', 93: 'Электроэнергия',
};

export function КалендарьСуток({
  recId, wellNumber, дни, от, до, сегодня, можноПравить, окноЗакрыто,
  переходС, всёРучное,
}: {
  recId: number;
  wellNumber: string;
  дни: ДеньКалендаря[];
  от: string;
  до: string;
  сегодня: string;
  можноПравить: boolean;
  окноЗакрыто: boolean;
  /** С этой даты факт берётся из ВМАП. null — перехода не было. */
  переходС: string | null;
  /** DATA_SOURCE=manual: весь факт вводится руками. */
  всёРучное: boolean;
}) {
  const поДням = React.useMemo(
    () => new Map(дни.map((d) => [d.iso, d])), [дни],
  );

  /* Считаются только сутки ОКНА и только прошедшие: незаполненное завтра —
     не пробел, а ещё не наступивший день.

     Сутки базы сюда не входят. Раньше входили, пока база считалась по замерам
     за трое суток до регистрации; теперь она вносится руками с документом
     (см. effect/baseline-entry.tsx), и суточные значения за тот период на неё
     никак не влияют. Считать их наравне с окном значило бы обещать, что от
     них что-то зависит.

     Мерило — СВОЙ внесённый дебит. Сутки без него в расчёт всё равно попадут
     по протянутому значению, но достоверностью ему не равны: счётчик
     показывает именно подтверждённые. */
  /* Только ручные сутки: те, что берутся из телеметрии, вводом не управляются,
     и считать их в «заполнено» значило бы просить внести то, что придёт само. */
  const считаемые = дни.filter((d) => d.вОкне && !d.будущее && d.ручные);
  const полных = считаемые.filter((d) => d.qzh !== null).length;
  const доля = считаемые.length ? Math.round((полных / считаемые.length) * 100) : 0;
  const пробелов = считаемые.length - полных;

  /* Всё, что меняется от рендера к рендеру, DayButton читает через ref, а сам
     объект `components` собирается ОДИН раз.

     Иначе так: `components`, собранный в разметке или мемо с меняющимися
     зависимостями, даёт DayPicker новый тип компонента при каждом обновлении.
     React считает это другим компонентом и размонтирует клетку вместе с её
     состоянием — окно дня закрывалось само, стоило серверу прислать свежие
     данные после сохранения. */
  const данные = React.useRef({ поДням, сегодня, recId, можноПравить });
  данные.current = { поДням, сегодня, recId, можноПравить };

  const компоненты = React.useMemo(() => ({
    DayButton: ({ day, modifiers, ...props }: React.ComponentProps<'button'> & {
      day: { date: Date }; modifiers: Record<string, boolean>;
    }) => {
      const т = данные.current;
      const k = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
      return (
        <КлеткаДня
          день={т.поДням.get(k)}
          сегодня={т.сегодня}
          recId={т.recId}
          можноПравить={т.можноПравить}
          выключен={!!modifiers.disabled}
          {...props}
        />
      );
    },
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  }) as any, []);

  return (
    <div className="flex flex-col gap-4 p-[var(--section-padding)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">Суточные данные, скважина {wellNumber}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {всёРучное
              ? 'Отмечены сутки окна эффекта — те, по которым считаются деньги. Сутки без своего значения берут последнее известное: оно протягивается вперёд, как в телеметрии.'
              : переходС
                ? `Факт с ${дата(переходС).toLocaleDateString('ru-RU')} приходит из ВМАП; отмечены только сутки до этой даты — они посчитаны по внесённым здесь значениям и остаются такими.`
                : 'Факт по этой скважине приходит из ВМАП. Внесённые здесь значения сохраняются и остаются в журнале, но в расчёт не входят: даты перехода на ручной ввод нет.'}
          </p>
        </div>
        <div className="min-w-[220px]">
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-xs text-[var(--text-tertiary)]">Суток со своим значением</span>
            <span className="text-sm font-medium tabular-nums">
              {полных} из {считаемые.length}
            </span>
          </div>
          <Progress value={доля} />
        </div>
      </div>

      {окноЗакрыто && (
        <div className="flex items-start gap-3 rounded-md border border-[var(--border-divider)]
                        bg-[var(--bg-tertiary)] px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" aria-hidden />
          <p className="text-[var(--text-secondary)]">
            Окно эффекта закрыто: сохранённый расчёт больше не пересчитывается,
            и правка суток его не изменит. Она всё равно попадёт в журнал и
            будет видна другим рекомендациям по этой скважине.
          </p>
        </div>
      )}

      {пробелов > 0 && !окноЗакрыто && (
        <div className="flex items-start gap-3 rounded-md border border-[var(--border-divider)]
                        bg-[var(--bg-tertiary)] px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" aria-hidden />
          <p className="text-[var(--text-secondary)]">
            Своего значения нет у <b>{пробелов}</b> суток — они посчитаны по
            протянутому с предыдущих. Деньги за них начисляются, но цифра
            держится на предположении, а не на данных: протяжка не отличает
            работающую скважину от остановленной.
          </p>
        </div>
      )}

      <Легенда />

      <div className="overflow-x-auto">
        <Calendar
          /* mode обязателен, хотя выбирать здесь нечего: без него DayPicker
             считает календарь витриной и рисует дни текстом, а не кнопками —
             нажимать становится не на что. Подсветку выбранного при этом
             гасим: полноту суток кодирует своя заливка, и второй, ничего не
             значащий цвет читался бы как ещё один статус. */
          mode="single"
          selected={undefined}
          locale={ru}
          weekStartsOn={1}
          numberOfMonths={3}
          showOutsideDays={false}
          defaultMonth={дата(от)}
          startMonth={дата(от)}
          endMonth={дата(до)}
          disabled={[{ before: дата(от) }, { after: дата(до) }]}
          className="w-fit bg-transparent p-0"
          classNames={{ months: 'flex flex-row gap-6', selected: '' }}
          components={компоненты}
        />
      </div>
    </div>
  );
}

function Легенда() {
  /* Стили те же, что у клеток, и по той же причине инлайном: иначе легенда
     обещает одно, а сетка показывает другое. */
  const точки: Array<[React.CSSProperties, string]> = [
    [{ background: 'var(--component-accent)' }, 'своё внесённое значение'],
    [{ boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--component-accent) 45%, transparent)' },
      'значение протянуто с прошлых суток'],
    [{ border: '1px dashed var(--status-warning)' }, 'данных нет и тянуть нечего'],
  ];
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-tertiary)]">
      {точки.map(([стиль, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm" style={стиль} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

/* className из DayPicker снимается со спреда и намеренно НЕ применяется —
   почему, объяснено у сборки `вид` ниже. */
function КлеткаДня({ день, сегодня, recId, можноПравить, выключен, className: _чужие, ...props }: {
  день: ДеньКалендаря | undefined;
  сегодня: string;
  recId: number;
  можноПравить: boolean;
  выключен: boolean;
} & React.ComponentProps<'button'>) {
  const [открыт, setОткрыт] = React.useState(false);

  /* Судьба суток решается дебитом: он определяет, попадут ли они в расчёт.
     Обводнённость лишь уточняет, своя она или протянутая. */
  /* Раскрашиваются только сутки ОКНА эффекта. Остальные — включая период
     базы — остаются приглушёнными: база вносится руками с документом, и
     суточные значения за тот период на неё не влияют, а метки на них
     превращали сетку в пестроту, не отвечая ни на один вопрос. Что это
     сутки базы, по-прежнему написано в окне дня.

     Своё значение — сплошная заливка; нет своего, но есть что протянуть —
     кольцо; нечего тянуть — пунктир. Откуда протянуто, видно в окне дня. */
  const вРасчёте = !!день && день.вОкне && день.ручные;
  const полон = вРасчёте && день!.qzh !== null;
  const протянуто = вРасчёте && !день!.будущее && день!.qzh === null && день!.протянутоС !== null;
  const пробел = вРасчёте && !день!.будущее && день!.qzh === null && день!.протянутоС === null;

  /* Кнопка остаётся кнопкой Radix-триггера, но своё оформление собирает
     сама: DayPicker раскрашивает клетки классами состояний, а нам нужен
     ещё один, независимый признак — полнота данных. */
  /* Классы, которые DayPicker кладёт в day_button, СПЕЦИАЛЬНО не берутся: там
     есть `bg-transparent` и `border border-transparent`, и они перебивали
     заливку клетки — «своё значение» отрисовывалось прозрачным, а протянутые
     сутки получали рамку currentColor вместо приглушённого акцента. Клетка
     собирает свой вид целиком, включая фокус. */
  const вид = [
    'relative inline-flex size-8 items-center justify-center rounded-md text-sm outline-none',
    'focus-visible:shadow-[var(--focus-component)]',
    !полон && !протянуто && !пробел ? 'hover:bg-accent' : '',
    выключен || !день ? 'cursor-not-allowed opacity-35' : '',
  ].filter(Boolean).join(' ');

  /* Цвет и рамка — инлайном, а не утилитами Tailwind, и это вынужденно.
     В этой сборке произвольные `ring-*` с токеном и `text-[var(--…)]` не
     генерируются: заливка вставала, а белый текст на ней и кольцо протянутых
     суток молча пропадали — получался чёрный текст на синем и клетка без
     признака. Инлайн от генерации утилит не зависит и токены не нарушает. */
  /* Фон и рамка задаются ВСЕГДА, в том числе «никакие». В проекте выключен
     preflight Tailwind, а собственные классы DayPicker мы не берём — без явного
     сброса кнопка получает серый фон и рамку от браузера. */
  const сброс: React.CSSProperties = { background: 'transparent', border: 'none' };
  const краски: React.CSSProperties = {
    ...сброс,
    ...(полон
      ? { background: 'var(--component-accent)', color: 'var(--text-on-accent)', fontWeight: 500 }
      : протянуто
        ? { boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--component-accent) 45%, transparent)',
            color: 'var(--text-tertiary)' }
        : пробел
          ? { border: '1px dashed var(--status-warning)' }
          : {}),
  };

  /* Сутки вне расчёта этой рекомендации — приглушённые, как и всё прошедшее
     мимо неё. Вводить по ним данные можно, вид просто не спорит с сеткой. */
  if (день && !вРасчёте) краски.color = 'var(--text-tertiary)';

  /* Сегодняшний день обводится всегда, поверх любого из трёх видов. */
  if (день?.iso === сегодня && !полон) {
    краски.outline = '1px solid var(--border-divider)';
    краски.outlineOffset = '0px';
  }

  if (!день || выключен) {
    /* style — ПОСЛЕ спреда: DayPicker передаёт собственный `style`
       (в том числе undefined), и поставленный раньше он стирался вместе с
       заливкой. Тот же порядок, что и у onClick ниже. */
    return <button type="button" disabled className={вид} {...props} style={краски} />;
  }

  return (
    <Popover open={открыт} onOpenChange={setОткрыт}>
      <PopoverTrigger asChild>
        {/* Свой onClick стоит ПОСЛЕ спреда и вытесняет обработчик DayPicker.
            Так надо: тот зовёт preventDefault, а Radix по умолчанию не
            открывает окно на событии с отменённым действием — окно молча не
            появлялось. Выбор дня средствами DayPicker нам и не нужен, вся
            работа идёт через это окно. */}
        <button type="button" className={вид} {...props} style={краски}
                onClick={() => setОткрыт((o) => !o)}>
          {props.children}
          {день.правок > 0 && (
            <i className="absolute right-0.5 top-0.5 size-1 rounded-full bg-current opacity-70"
               aria-label="значение правили" />
          )}
        </button>
      </PopoverTrigger>
      {открыт && (
        <PopoverContent className="w-80" align="start">
          <ОкноДня день={день} recId={recId} можноПравить={можноПравить}
                   закрыть={() => setОткрыт(false)} />
        </PopoverContent>
      )}
    </Popover>
  );
}

function ОкноДня({ день, recId, можноПравить, закрыть }: {
  день: ДеньКалендаря;
  recId: number;
  можноПравить: boolean;
  закрыть: () => void;
}) {
  const [состояние, отправить] = React.useActionState<DayActionState, FormData>(
    сохранитьСутки, {},
  );
  const [история, setИстория] = React.useState<Событие[] | null>(null);

  /* История подтягивается на открытие: держать её для всех суток окна разом
     значило бы тянуть девяносто списков ради одного просмотренного. */
  React.useEffect(() => {
    let живо = true;
    историяСуток(recId, день.iso).then((e) => { if (живо) setИстория(e); });
    return () => { живо = false; };
  }, [recId, день.iso]);

  React.useEffect(() => {
    if (состояние.history) setИстория(состояние.history);
  }, [состояние.history]);

  const подпись = дата(день.iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric', weekday: 'long',
  });
  const роль = [день.вБазе ? 'сутки базы' : '', день.вОкне ? 'сутки окна эффекта' : '']
    .filter(Boolean).join(' · ') || 'вне расчёта этой рекомендации';

  /* Откуда взялось значение, если своего нет. Без этой строки протяжка
     выглядит взявшейся из ниоткуда: источник может лежать раньше отрезка,
     который показывает календарь, и на экране его просто не видно. */
  const протяжка = день.qzh === null && день.протянутоС !== null
    ? `Своего значения нет — в расчёт идёт ${String(день.протянутоеЗначение).replace('.', ',')} м³/сут,`
      + ` протянутое с ${дата(день.протянутоС).toLocaleDateString('ru-RU')}.`
    : null;

  return (
    <>
      <PopoverHeader>
        {/* first-letter, а не capitalize: тот поднял бы каждое слово —
            «Пятница, 17 Июля 2026 Г.». */}
        <PopoverTitle className="first-letter:uppercase">{подпись}</PopoverTitle>
        <PopoverDescription>{роль}</PopoverDescription>
        {протяжка && (
          <PopoverDescription className="text-[var(--text-secondary)]">
            {протяжка}
          </PopoverDescription>
        )}
      </PopoverHeader>

      <form action={отправить} className="px-4 py-3">
        <input type="hidden" name="recId" value={recId} />
        <input type="hidden" name="day" value={день.iso} />

        <FieldGroup className="gap-3">
          <Field orientation="horizontal">
            <FieldLabel htmlFor={`qzh-${день.iso}`} className="w-1/2 text-xs">
              Дебит жидкости, м³/сут
            </FieldLabel>
            <Input id={`qzh-${день.iso}`} name="qzh" inputMode="decimal"
                   className="text-right" defaultValue={число(день.qzh)}
                   disabled={!можноПравить} placeholder="—" />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor={`wc-${день.iso}`} className="w-1/2 text-xs">
              Обводнённость, %
            </FieldLabel>
            <Input id={`wc-${день.iso}`} name="watercut" inputMode="decimal"
                   className="text-right" defaultValue={число(день.watercut)}
                   disabled={!можноПравить} placeholder="—" />
          </Field>
          {/* Энергопотребление вводится наравне с дебитом — так же, как в
              Форме 5 Заказчика. В расчёт денег оно пока не идёт: модель АЛЬМА
              списывает энергию удельными ставками от объёма добычи, а не по
              замеру, и какая из двух моделей верна, ещё предстоит подтвердить.
              Собирать данные это не мешает. */}
          <Field orientation="horizontal">
            <FieldLabel htmlFor={`ee-${день.iso}`} className="w-1/2 text-xs">
              Электроэнергия, кВт·ч/сут
            </FieldLabel>
            <Input id={`ee-${день.iso}`} name="ee" inputMode="decimal"
                   className="text-right" defaultValue={число(день.ee)}
                   disabled={!можноПравить} placeholder="—" />
          </Field>
        </FieldGroup>

        {/* Три правила, которые иначе выясняются только по расхождению в
            деньгах. Ноль и пусто — разные вещи: ноль идёт в расчёт и даёт
            отрицательный прирост, пусто выпадает из него совсем. */}
        <p className="mt-2 mb-0 text-xs text-[var(--text-tertiary)]">
          Пустой дебит — «данных нет», сутки выпадают из расчёта. Ноль — это
          остановленная скважина, он в расчёт идёт. Обводнённость, если её не
          заполнить, тянется с последних известных суток: её меряют
          лабораторно и реже дебита.
        </p>

        {можноПравить && (
          <div className="mt-3 flex items-center gap-2">
            <SubmitButton pendingText="Сохраняем…">Сохранить</SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={закрыть}>Закрыть</Button>
            {состояние.error && (
              <span className="text-xs text-[var(--status-error)]">{состояние.error}</span>
            )}
            {состояние.changed === 0 && !состояние.error && (
              <span className="text-xs text-[var(--text-tertiary)]">без изменений</span>
            )}
          </div>
        )}
      </form>

      <Журнал события={история} />
    </>
  );
}

function Журнал({ события }: { события: Событие[] | null }) {
  if (события === null) {
    /* Строка той же высоты, что у заголовка аккордеона ниже (border-t px-4
       py-2) — независимо от того, окажется истории 0 или 10, эта полоса не
       прыгнет при подмене на настоящий контент. */
    return <div className="flex items-center border-t border-border px-4 py-2">
      <Skeleton className="h-3.5 w-36" />
    </div>;
  }
  if (события.length === 0) {
    return <div className="border-t border-border px-4 py-2 text-xs text-[var(--text-tertiary)]">
      Значение ещё не вводили.
    </div>;
  }

  const величина = (v: number | null) => (v === null ? '—' : String(v).replace('.', ','));

  return (
    <Accordion type="single" collapsible className="border-t border-border">
      <AccordionItem value="история" className="border-b-0">
        <AccordionTrigger
          showArrow
          className="gap-1.5 px-4 py-2 text-xs font-medium text-[var(--text-tertiary)] hover:no-underline"
        >
          <span className="flex flex-1 items-center gap-1.5">
            <History className="size-3" aria-hidden /> История значения
            <span className="tabular-nums text-[var(--text-quaternary)]">{события.length}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="p-0">
      <ul className="thin-scroll m-0 list-none max-h-44 overflow-y-auto px-4 pb-3 pt-1">
        {события.map((e) => (
          <li key={e.id} className="border-b border-[var(--border-divider-light)] py-1.5 text-xs last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{ПАРАМЕТР[e.parameterId] ?? `параметр ${e.parameterId}`}</span>
              <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">
                {new Date(e.at).toLocaleString('ru-RU', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                }).replace(',', '')}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[var(--text-secondary)]">
              {/* Первый ввод и правку различаем словом, а не только стрелкой:
                  «— → 120,5» глазом читается как правку с пустого места. */}
              <span>
                {e.oldValue === null
                  ? <>внесено <b className="tabular-nums">{величина(e.newValue)}</b></>
                  : e.newValue === null
                    ? <>стёрто (было <span className="tabular-nums">{величина(e.oldValue)}</span>)</>
                    : <>
                        <span className="tabular-nums line-through opacity-60">{величина(e.oldValue)}</span>
                        {' → '}
                        <b className="tabular-nums">{величина(e.newValue)}</b>
                      </>}
                {' · '}{e.actorName}
              </span>
              {e.recNumber && <Badge variant="outline">{e.recNumber}</Badge>}
            </div>
          </li>
        ))}
      </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
