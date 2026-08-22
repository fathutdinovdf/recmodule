'use client';

/* Плитки-фильтры реестра.
 *
 * Клиентские они ради мгновенного выделения: отбор считается на сервере,
 * ответ приходит через сотни миллисекунд, и без оптимистичного состояния
 * плитка всё это время выглядит ненажатой.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CountingNumber } from '@/components/animate-ui/primitives/animate/counting-number';

export type Плитка = { key: string; label: string; n: number; href: string };

export function RegistryTiles({ items, active }: { items: Плитка[]; active: string | null }) {
  /* undefined — «своего мнения нет, показываем серверное». */
  const [опт, setОпт] = useState<string | null | undefined>(undefined);

  /* Пришёл новый ответ сервера — предположение больше не нужно. Сюда же
     попадает переход «назад» браузером, где клика по плитке не было. */
  useEffect(() => { setОпт(undefined); }, [active]);

  const выбрана = опт === undefined ? active : опт;

  return (
    <section className="tiles">
      {items.map((t) => {
        const включена = выбрана === t.key;
        return (
          <Link key={t.key} className={`tile ${включена ? 'is-on' : ''}`} href={t.href}
                onClick={() => setОпт(включена ? null : t.key)}>
            <span className="tile__n"><CountingNumber value={t.n} /></span>
            <span className="tile__l">{t.label}</span>
          </Link>
        );
      })}
    </section>
  );
}
