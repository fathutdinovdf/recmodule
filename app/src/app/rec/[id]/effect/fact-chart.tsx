'use client';

/* График «Факт против базы» на recharts — тот же приём, что у спарклайна
 * скважины (../spark.tsx): тултип и подсветка точки штатные, вместо ручного
 * SVG с отдельным кодом под курсор.
 *
 * Разрывы не сглаживаются: сутки без данных — это разрыв линии, а не прямая
 * между соседями. Прямая соврала бы, что в эти сутки что-то измеряли.
 * connectNulls={false} даёт это бесплатно, как и в спарклайне.
 */

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { дата, число } from '@/lib/format';

/* Год на оси лишний: обе даты — в пределах одного 30-суточного окна, разница
   в годе там не бывает. В тултипе год остаётся — там дата одна и её удобнее
   узнавать без счёта суток от подписи оси. */
function короткаяДата(v: string): string {
  const x = new Date(v);
  const п = (n: number) => String(n).padStart(2, '0');
  return `${п(x.getDate())}.${п(x.getMonth() + 1)}`;
}
import type { EffectDay } from '@/services/effect-window';

const config = {
  факт: { label: 'факт по суткам', color: 'var(--infografic-accent)' },
} satisfies ChartConfig;

/* Отступ по оси значений — 10% от самого значения на каждом краю (низ на 10%
   меньше минимума факта, верх на 10% больше максимума), округлённый наружу до
   круглого шага. Шаг — десятки, если после отступа размах их выдерживает
   (иначе три деления совпали бы или ушли в одну точку), иначе целые: дробные
   метки вроде 10,6 на оси читаются как точность, которой в суточных дебитах
   нет. */
function диапазонY(мин: number, макс: number): { низ: number; верх: number; шаг: number } {
  const низДо = мин - Math.abs(мин) * 0.1;
  const верхДо = макс + Math.abs(макс) * 0.1;
  const шаг = (верхДо - низДо) >= 30 ? 10 : 1;
  const низ = Math.floor(низДо / шаг) * шаг;
  const верх = Math.ceil(верхДо / шаг) * шаг;
  return { низ, верх, шаг };
}

export function ГрафикФакт({
  days, поле, база, заголовок, единица,
}: {
  days: EffectDay[];
  поле: 'factQzh' | 'factQn';
  база: number | null;
  заголовок: string;
  единица: string;
}) {
  const значения = days.map((d) => d[поле]).filter((v): v is number => v !== null);

  if (!значения.length) {
    return (
      <div className="eff-chart">
        <div className="eff-chart__h">{заголовок}</div>
        <div className="block__b">Нет данных за окно.</div>
      </div>
    );
  }

  const данные = days.map((d) => ({ date: d.date.toISOString(), факт: d[поле] }));
  const тики = [данные[0].date, данные[данные.length - 1].date];

  const все = база === null ? значения : [...значения, база];
  const { низ, верх, шаг } = диапазонY(Math.min(...все), Math.max(...все));
  /* Середина округляется к тому же шагу, что и края: иначе recharts подписал
     бы её «красивым» числом мимо сетки, и три деления перестали бы совпадать
     с реально заданным доменом. */
  const середина = низ + Math.round((верх - низ) / 2 / шаг) * шаг;
  const тикиY = [низ, середина, верх];

  return (
    <div className="eff-chart">
      <div className="eff-chart__h">{заголовок}</div>
      <ChartContainer config={config} className="h-[170px] w-full">
        <LineChart data={данные} margin={{ top: 12, right: 58, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--border-divider-light)" />
          <XAxis
            dataKey="date" ticks={тики} interval={0} tickLine={false} axisLine={false}
            tickMargin={8}
            tick={({ x, y, payload, index }) => (
              <text
                x={x} y={y} dy={9}
                textAnchor={index === 0 ? 'start' : 'end'}
                fontSize={11} fill="var(--text-quaternary)"
              >
                {короткаяДата(payload.value)}
              </text>
            )}
          />
          <YAxis
            width={40} domain={[низ, верх]} ticks={тикиY} tickLine={false} axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--text-quaternary)' }}
            tickFormatter={(v) => число(v, 0)}
          />
          {база !== null && (
            <ReferenceLine
              y={база} stroke="var(--text-tertiary)" strokeWidth={1.4} strokeDasharray="5 4"
              label={{
                value: `база ${число(база, 1)}`, position: 'right',
                fill: 'var(--text-tertiary)', fontSize: 11,
              }}
            />
          )}
          <ChartTooltip
            cursor={{ stroke: 'var(--border-divider-light)' }}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(label) => дата(new Date(label as string))}
                formatter={(value) => (value != null ? `${число(value as number)} ${единица}` : 'нет замера')}
              />
            }
          />
          <Line
            dataKey="факт" type="linear" stroke="var(--color-факт)" strokeWidth={1.8}
            dot={false} activeDot={{ r: 3, fill: 'var(--color-факт)', strokeWidth: 0 }}
            connectNulls={false}
          />
        </LineChart>
      </ChartContainer>
      <div className="eff-legend" style={{ marginTop: 'var(--item-gap-vertical-s)' }}>
        <span><i className="is-fact" />факт по суткам</span>
        {база !== null && <span><i className="is-base" />база</span>}
        {/* Про разрывы сказано словами: сама по себе дырка в линии читается как
            «данных нет вовсе», а она значит ещё и «нечего протянуть». */}
        <span>разрыв линии — суток без данных и без чего протянуть</span>
      </div>
    </div>
  );
}
