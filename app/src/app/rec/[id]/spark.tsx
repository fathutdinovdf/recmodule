'use client';

/* Спарклайн скважины на recharts (components/ui/chart.tsx), а не на ручном
 * SVG: подсветка точки и тултип при наведении — стандартное поведение
 * recharts, самодельная версия дублировала то же самое своим кодом.
 *
 * Разрывы в ряду не сглаживаются: сутки без замеров рисуются разрывом линии,
 * а не прямой между соседями — протянутое значение и измеренное на графике
 * должны различаться. connectNulls={false} даёт это бесплатно.
 */

import { Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { дата, число } from '@/lib/format';

const config = {
  value: { label: 'Qж', color: 'var(--infografic-accent)' },
} satisfies ChartConfig;

export function Спарклайн({
  ряд, мин, макс,
}: {
  ряд: { date: Date; value: number | null }[]; мин: number; макс: number;
}) {
  const данные = ряд.map((d) => ({ date: d.date.toISOString(), value: d.value }));

  return (
    <ChartContainer config={config} className="h-16 w-full">
      <LineChart data={данные} margin={{ top: 24, right: 0, bottom: 6, left: 0 }}>
        {/* dataKey="date" не рисуется (hide), но нужен: без него recharts
            отдаёт тултипу индекс точки вместо значения date, и подпись
            превращается в 01.01.1970 (new Date(0) от индекса-строки). */}
        <XAxis dataKey="date" hide />
        <YAxis domain={[мин, макс]} hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(label) => дата(new Date(label as string))}
              formatter={(value) => (value != null ? `${число(value as number)} м³/сут` : 'нет замера')}
            />
          }
        />
        <Line
          dataKey="value"
          type="linear"
          stroke="var(--color-value)"
          strokeWidth={1.6}
          dot={false}
          activeDot={{ r: 3, fill: 'var(--color-value)', strokeWidth: 0 }}
          connectNulls={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
