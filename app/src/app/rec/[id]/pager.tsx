/* Листалка в шапке карточки.
 *
 * layout.tsx (серверный) уже посчитал соседей по всему реестру — это
 * `fallback` и он же весь результат, если карточку открыли не из таблицы
 * (`?from=` в адресе нет). Layout сам не видит searchParams (Next их
 * не отдаёт layout-ам), поэтому переопределение под активный отбор реестра
 * живёт здесь, в клиентском компоненте: useSearchParams читает `from`, а
 * соседей по отбору считает серверный экшен (pager-actions.ts).
 *
 * Пока экшен не ответил, стоит fallback: разница обычно меньше кадра на
 * локальной базе, отдельного скелетона под неё заводить незачем.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icons';
import { Hint } from '@/components/ui/Hint';
import type { Neighbours } from '@/db/recommendations';
import { соседиПоОтбору } from './pager-actions';

export function Pager({ recId, fallback }: { recId: number; fallback: Neighbours }) {
  const from = useSearchParams().get('from');
  const [соседи, setСоседи] = useState<Neighbours>(fallback);

  useEffect(() => {
    if (!from) { setСоседи(fallback); return; }
    let отменено = false;
    соседиПоОтбору(recId, from).then((r) => { if (!отменено) setСоседи(r); });
    return () => { отменено = true; };
  }, [recId, from, fallback]);

  const хвост = from ? `?from=${encodeURIComponent(from)}` : '';

  return (
    <div className="pager">
      <Hint text="Предыдущая рекомендация">
        {соседи.prevId
          ? <Link className="cnbtn" href={`/rec/${соседи.prevId}/summary${хвост}`} aria-label="Предыдущая рекомендация"><Icon id="prev" /></Link>
          : <span className="cnbtn is-off" aria-label="Предыдущей рекомендации нет"><Icon id="prev" /></span>}
      </Hint>
      <Hint text="Позиция в реестре">
        <span className="pager__pos">{соседи.pos} из {соседи.total}</span>
      </Hint>
      <Hint text="Следующая рекомендация">
        {соседи.nextId
          ? <Link className="cnbtn" href={`/rec/${соседи.nextId}/summary${хвост}`} aria-label="Следующая рекомендация"><Icon id="next" /></Link>
          : <span className="cnbtn is-off" aria-label="Следующей рекомендации нет"><Icon id="next" /></span>}
      </Hint>
    </div>
  );
}
