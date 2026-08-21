'use client';

/* Обёртка shadcn/recharts, адаптированная под наши токены: в оригинале
 * ChartTooltipContent красится через собственную палитру --chart-N, у нас
 * цвет серии всегда приходит из tokens.css через chartConfig.color — своей
 * палитры заводить незачем ("Только токены").
 */

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/cn';

export type ChartConfig = Record<string, { label: React.ReactNode; color?: string }>;

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('Компоненты Chart.* должны быть внутри <ChartContainer>');
  return context;
}

function ChartContainer({
  config, className, children, ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}) {
  const style = Object.fromEntries(
    Object.entries(config).map(([key, v]) => [`--color-${key}`, v.color]),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        className={cn('[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground', className)}
        style={style}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active, payload, label, className, labelFormatter, formatter, indicator = 'dot',
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> & {
  className?: string;
  indicator?: 'dot' | 'line';
  labelFormatter?: (label: React.ReactNode) => React.ReactNode;
  formatter?: (value: number | string, name: string) => React.ReactNode;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div
      data-slot="chart-tooltip-content"
      className={cn(
        'grid gap-0.5 rounded-md border border-border bg-popover px-1.5 py-1 text-popover-foreground shadow-md',
        className,
      )}
    >
      {label != null && (
        <div className="text-[10px] leading-tight text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      {payload.map((item, i) => {
        const key = item.dataKey as string;
        const цвет = config[key]?.color ?? item.color;
        return (
          <div key={i} className="flex items-center gap-1 text-xs leading-tight">
            <span
              className={cn(
                'shrink-0',
                indicator === 'dot' ? 'size-1.5 rounded-full' : 'h-0.5 w-3',
              )}
              style={{ backgroundColor: цвет }}
            />
            <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatter ? formatter(item.value as number, key) : item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
