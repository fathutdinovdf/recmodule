/* Вкладки карточки.
 *
 * Вкладка — сегмент адреса, поэтому активная определяется путём, а не
 * состоянием: ссылку на «Расчёт эффекта» можно переслать, и она откроется
 * именно на нём. Ради usePathname компонент клиентский; сам список вкладок
 * лежит в tabs-def.ts, чтобы им могли пользоваться и серверные страницы.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ВКЛАДКИ } from './tabs-def';

export function Tabs({ recId, counts }: { recId: number; counts: Record<string, number> }) {
  const path = usePathname();

  return (
    <div className="tabs">
      {ВКЛАДКИ.map((t) => {
        const n = counts[t.key];
        const внутри = <>{t.label}{n ? <span className="tab__n"> {n}</span> : null}</>;
        if (!t.ready) {
          return (
            <span key={t.key} className="tab tab--off"
                  title="Вкладка ещё не перенесена из макета">{внутри}</span>
          );
        }
        const активна = path === `/rec/${recId}/${t.key}`;
        return (
          <Link key={t.key} className={`tab ${активна ? 'is-on' : ''}`}
                href={`/rec/${recId}/${t.key}`}>{внутри}</Link>
        );
      })}
    </div>
  );
}
