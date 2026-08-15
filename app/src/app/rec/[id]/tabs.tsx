/* Вкладки карточки.
 *
 * Вкладка — сегмент адреса, поэтому активная определяется путём, а не
 * состоянием: ссылку на «Расчёт эффекта» можно переслать, и она откроется
 * именно на нём. Ради usePathname компонент клиентский; сам список вкладок
 * лежит в tabs-def.ts, чтобы им могли пользоваться и серверные страницы.
 *
 * Оформление — сегментированный переключатель animate-ui с едущей подсветкой
 * (`components/animate-ui/components/radix/tabs`). Это отход от макета, где
 * вкладки подчёркивались снизу; принято по решению пользователя.
 *
 * Главное отличие от обычного применения Radix Tabs: панелей у нас нет.
 * Содержимое вкладки — отдельная страница маршрута, а не TabsContent, поэтому
 * компонент используется только ради полосы сегментов, а каждый сегмент —
 * настоящая ссылка (`asChild` + Link). Отсюда два следствия:
 *
 * - `value` контролируется путём, а не кликом: пока страница не сменилась,
 *   подсветка стоит на месте, и она честно показывает, что открыто сейчас, а
 *   не куда нажали;
 * - `activationMode="manual"` обязателен. При автоматическом Radix меняет
 *   вкладку на простое перемещение фокуса стрелками, а у нас смена вкладки —
 *   это навигация: стрелка по клавиатуре начала бы грузить страницы.
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs as Сегменты, TabsList, TabsTrigger } from '@/components/animate-ui/components/radix/tabs';
import { ВКЛАДКИ } from './tabs-def';

export function Tabs({ recId, counts }: { recId: number; counts: Record<string, number> }) {
  const path = usePathname();
  const router = useRouter();
  const текущая = ВКЛАДКИ.find((t) => path === `/rec/${recId}/${t.key}`)?.key ?? '';

  return (
    /* Вертикальный отступ — инлайном: `.tabs` из card.css задаёт `padding: 0
       …` вне слоёв Tailwind и перебил бы любую утилиту независимо от значения.
       Без отступа плашка сегментов упирается в линию под полосой. */
    <div className="tabs" style={{ paddingBlock: 'var(--group-padding-s)' }}>
      {/* Полоса шире карточки на узком экране: семь сегментов не сжимаются до
          нечитаемого, а уезжают за край с прокруткой. */}
      <Сегменты value={текущая} activationMode="manual"
                onValueChange={(v) => { if (v !== текущая) router.push(`/rec/${recId}/${v}`); }}
                className="min-w-0 overflow-x-auto scrollbar-none">
        <TabsList>
          {ВКЛАДКИ.map((t) => {
            const n = counts[t.key];
            const внутри = <>{t.label}{n ? <span className="tab__n"> {n}</span> : null}</>;

            /* Вкладка без своей страницы остаётся в полосе приглушённой: по ней
               видно объём модуля, но вести ей некуда. */
            if (!t.ready) {
              return (
                <TabsTrigger key={t.key} value={t.key} disabled
                             title="Вкладка ещё не перенесена из макета">
                  {внутри}
                </TabsTrigger>
              );
            }

            return (
              <TabsTrigger key={t.key} value={t.key} asChild>
                {/* prefetch грузит вкладку заранее, ещё до нажатия. Раньше он
                    ничего не давал: у динамической страницы без своей заглушки
                    предзагружать нечего. Теперь у каждой вкладки есть
                    loading.tsx, и при наведении приезжает и она, и данные —
                    вкладка открывается почти мгновенно. */}
                <Link href={`/rec/${recId}/${t.key}`} prefetch>{внутри}</Link>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Сегменты>
    </div>
  );
}
