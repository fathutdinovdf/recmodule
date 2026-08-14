'use client';

/* Вкладки карточки в пластике shadcn.
 *
 * Компонент Tabs из shadcn держит активную вкладку своим состоянием, а у нас
 * она стоит сегментом адреса — карточку пересылают ссылкой, и вкладка обязана
 * в ней быть. Поэтому берётся только внешний вид: те же классы, что у
 * TabsList и TabsTrigger, но внутри ссылки, а не кнопки.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ВКЛАДКИ } from './tabs-def';

export function Tabs({ recId, counts }: { recId: number; counts?: Record<string, number> }) {
  const path = usePathname();
  const текущая = path.split('/')[3] ?? '';

  return (
    <div className="bg-muted text-muted-foreground inline-flex w-fit items-center justify-center rounded-lg p-[3px]">
      {ВКЛАДКИ.map((t) => {
        const активна = t.key === текущая;
        const n = counts?.[t.key];
        const классы = cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow]',
          активна && 'bg-background text-foreground shadow-sm',
          /* Вкладка без своей страницы: видна, но не кликается — по ней видно
             объём модуля, а щелчок по заглушке хуже, чем видимое «пока нет». */
          !t.ready && 'pointer-events-none opacity-50',
        );
        const внутри = (
          <>
            {t.label}
            {n ? <span className="bg-background/60 rounded px-1 text-xs tabular-nums">{n}</span> : null}
          </>
        );
        return t.ready
          ? <Link key={t.key} href={`/rec/${recId}/${t.key}`} className={классы}>{внутри}</Link>
          : <span key={t.key} className={классы}>{внутри}</span>;
      })}
    </div>
  );
}
