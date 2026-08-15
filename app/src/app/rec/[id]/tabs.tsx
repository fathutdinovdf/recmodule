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

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs as Сегменты, TabsList, TabsTrigger } from '@/components/animate-ui/components/radix/tabs';
import { ВКЛАДКИ } from './tabs-def';

export function Tabs({ recId, counts }: { recId: number; counts: Record<string, number> }) {
  const path = usePathname();
  const router = useRouter();
  const текущая = ВКЛАДКИ.find((t) => path === `/rec/${recId}/${t.key}`)?.key ?? '';

  ПрогревВкладок(recId, текущая, router);

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
                {/* prefetch выключен намеренно: предзагрузкой заведует
                    `ПрогревВкладок` ниже. Свой у Link запускается по появлению
                    ссылки в поле зрения, то есть одновременно с загрузкой самой
                    открытой вкладки — пять рендеров наперегонки за один сервер.
                    Вкладки за краем горизонтальной прокрутки он при этом не
                    трогает вовсе. */}
                <Link href={`/rec/${recId}/${t.key}`} prefetch={false}>{внутри}</Link>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Сегменты>
    </div>
  );
}

/* Прогрев остальных вкладок.
 *
 * Порядок намеренный: сперва открытая вкладка, и только после её отрисовки —
 * запрос за остальными. Обратный (предзагрузка вместе с открытием) заставляет
 * пять рендеров делить один сервер и замедляет ровно то, что человек сейчас
 * ждёт. Отсюда useEffect: он выполняется после гидрации, то есть когда
 * открытая вкладка уже на экране.
 *
 * Вкладки берутся по очереди, а не залпом. Рендер каждой ходит в базу, а на
 * деве ещё и компилирует маршрут; параллельно они мешают друг другу и
 * последней навигации пользователя.
 *
 * В деве prefetch у Next отключён наглухо — `createPrefetchURL` возвращает
 * null при NODE_ENV === 'development', и `router.prefetch` молча ничего не
 * делает (то же и у Link). Поэтому там маршрут прогревается своим запросом с
 * заголовком RSC. В клиентский кэш роутера такой ответ не ляжет — это умеет
 * только сам роутер, — но маршрут скомпилируется и данные прочитаются, а
 * именно это на деве и составляет задержку.
 */
function ПрогревВкладок(recId: number, текущая: string, router: ReturnType<typeof useRouter>) {
  useEffect(() => {
    if (!текущая) return;

    const адреса = ВКЛАДКИ
      .filter((t) => t.ready && t.key !== текущая)
      .map((t) => `/rec/${recId}/${t.key}`);

    let отменено = false;

    const прогреть = async () => {
      for (const href of адреса) {
        if (отменено) return;
        if (process.env.NODE_ENV === 'production') {
          router.prefetch(href);
          /* prefetch синхронный и в очередь не встаёт, поэтому паузу между
             вкладками ставим сами — иначе залп из пяти запросов. */
          await новыйКадр(120);
        } else {
          await fetch(href, { headers: { RSC: '1' }, credentials: 'same-origin' }).catch(() => {});
        }
      }
    };

    /* Пауза до начала прогрева: дать открытой вкладке дорисоваться и дожить
       свои запросы. requestIdleCallback точнее таймера, но в Safari его нет.
       Отменять эти два надо разными функциями и ни в коем случае не обеими:
       дескрипторы у них из разных пространств, и clearTimeout по номеру
       простоя погасил бы чужой таймер с тем же номером. */
    const простой = typeof requestIdleCallback === 'function';
    const запуск = простой
      ? requestIdleCallback(() => void прогреть(), { timeout: 1500 })
      : window.setTimeout(() => void прогреть(), 400);

    return () => {
      отменено = true;
      if (простой) cancelIdleCallback(запуск);
      else clearTimeout(запуск);
    };
  }, [recId, текущая, router]);
}

const новыйКадр = (мс: number) => new Promise((r) => setTimeout(r, мс));
