/* Листалка в шапке карточки.
 *
 * layout.tsx (серверный) уже посчитал соседей по всему реестру — это
 * `fallback`, и он же весь результат, если карточку открыли не из таблицы
 * (`?from=` в адресе нет). Layout сам не видит searchParams (Next их
 * не отдаёт layout-ам), поэтому переопределение под активный отбор реестра
 * живёт здесь, в клиентском компоненте.
 *
 * Пока отбор активен (`from` есть), позиция и total считаются НЕ отдельным
 * запросом на каждый клик, а локально — по списку id всего отбора, один раз
 * полученному с сервера и закэшированному в sessionStorage под ключом `from`.
 * Раньше на каждый переход к соседней рекомендации уходил свежий запрос
 * getFilteredNeighbours, и пока он не отвечал, было видно fallback — соседей
 * по всему реестру без фильтра: «15 из 69» на месте «2 из 14». Разница на
 * глаз выглядела как баг, а не как ожидаемая долька секунды.
 *
 * Кэш не ревалидируется: если за время просмотра карточек состав отбора в
 * базе изменился (кто-то добавил/статус сменил), позиция и total останутся
 * прежними до следующего захода из реестра. Это осознанный компромисс —
 * скорее нет запроса, чем свежесть на каждом клике. */

'use client';

import { useLayoutEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icons';
import { Hint } from '@/components/ui/Hint';
import type { Neighbours } from '@/db/recommendations';
import { идПоОтбору } from './pager-actions';

const ключКэша = (отбор: string) => `pager-ids:${отбор}`;

function читатьКэш(отбор: string): number[] | null {
  try {
    const сырые = sessionStorage.getItem(ключКэша(отбор));
    return сырые ? (JSON.parse(сырые) as number[]) : null;
  } catch {
    return null;
  }
}

function писатьКэш(отбор: string, ids: number[]) {
  try {
    sessionStorage.setItem(ключКэша(отбор), JSON.stringify(ids));
  } catch {
    /* sessionStorage бывает недоступен (приватный режим, квота) — тогда
       просто нет кэша, каждый клик снова уходит на сервер. */
  }
}

function изСписка(ids: number[], recId: number): Neighbours {
  const позиция = ids.indexOf(recId);
  if (позиция === -1) return { prevId: null, nextId: null, pos: 0, total: ids.length };
  return {
    prevId: позиция > 0 ? ids[позиция - 1] : null,
    nextId: позиция < ids.length - 1 ? ids[позиция + 1] : null,
    pos: позиция + 1,
    total: ids.length,
  };
}

export function Pager({ recId, fallback }: { recId: number; fallback: Neighbours }) {
  const from = useSearchParams().get('from');
  const [ids, setIds] = useState<number[] | null>(null);

  /* useLayoutEffect, а не useEffect: кэш-попадание должно лечь в состояние
     до того, как браузер отрисует кадр, иначе на нём на мгновение мелькнёт
     соседи от предыдущей карточки. Промах кэша всё равно уходит в сеть —
     тут мгновенности вокруг ничего не сделать, только сам первый заход. */
  useLayoutEffect(() => {
    if (!from) { setIds(null); return; }
    const кэш = читатьКэш(from);
    if (кэш) { setIds(кэш); return; }
    setIds(null);
    let отменено = false;
    идПоОтбору(from).then((свежие) => {
      if (отменено) return;
      писатьКэш(from, свежие);
      setIds(свежие);
    });
    return () => { отменено = true; };
  }, [from]);

  const соседи = useMemo(
    () => (!from ? fallback : (ids ? изСписка(ids, recId) : null)),
    [from, fallback, ids, recId],
  );

  const хвост = from ? `?from=${encodeURIComponent(from)}` : '';

  return (
    <div className="pager">
      <Hint text="Предыдущая рекомендация">
        {соседи?.prevId
          ? <Link className="cnbtn" href={`/rec/${соседи.prevId}/summary${хвост}`} aria-label="Предыдущая рекомендация"><Icon id="prev" /></Link>
          : <span className="cnbtn is-off" aria-label="Предыдущей рекомендации нет"><Icon id="prev" /></span>}
      </Hint>
      <Hint text="Позиция в реестре">
        <span className="pager__pos">{соседи ? `${соседи.pos} из ${соседи.total}` : '…'}</span>
      </Hint>
      <Hint text="Следующая рекомендация">
        {соседи?.nextId
          ? <Link className="cnbtn" href={`/rec/${соседи.nextId}/summary${хвост}`} aria-label="Следующая рекомендация"><Icon id="next" /></Link>
          : <span className="cnbtn is-off" aria-label="Следующей рекомендации нет"><Icon id="next" /></span>}
      </Hint>
    </div>
  );
}
