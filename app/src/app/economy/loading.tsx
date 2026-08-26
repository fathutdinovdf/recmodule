/* Заглушка экрана «Экономическая модель», пока грузятся ставки и история.
 *
 * Раньше своей заглушки не было — Suspense поднимался до `app/loading.tsx`
 * (заглушка реестра рекомендаций): таблица с колонками другой ширины, плитки
 * счётчиков статусов, пейджер. На секунду загрузки экономика выглядела так,
 * будто открылся совсем другой экран, а не своя страница.
 *
 * Повторяет разметку `editor.tsx`: шапку с тремя кнопками (`pagehead` — тот
 * же класс из registry.css, что и в заглушке реестра), панель цены нефти и
 * готовности модели (`econtop`/`eprice`/`eready`, сетка колонок оттуда же),
 * и таблицу ставок — `erow`/`ecol--*` с их настоящей сеткой колонок
 * (`minmax(0,1fr) 132px 132px 132px 212px 40px`), так что появление реальных
 * чисел не сдвигает таблицу по ширине.
 */

import { Skeleton } from '@/components/ui/skeleton';
import './economy.css';

const СТРОК = 8;

export default function Loading() {
  return (
    <main className="content econ" aria-busy="true">
      <span className="sr-only" role="status">Загружается экономическая модель</span>

      <div className="pagehead" aria-hidden>
        <Skeleton className="h-7 w-64" />
        <div className="pagehead__actions">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="econtop" aria-hidden>
        <section className="panel eprice">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-2 h-7 w-32" />
          <Skeleton className="mt-1.5 h-3 w-24" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1 h-3 w-4/5" />
        </section>

        <section className="panel eready">
          <div className="eready__main">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="mt-2 h-4 w-64" />
            <div className="eready__chips">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-24 rounded-full" />)}
            </div>
          </div>
          <div className="eready__ver">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="mt-2 h-5 w-16" />
            <Skeleton className="mt-1.5 h-3 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
        </section>
      </div>

      <section className="panel etable" aria-hidden>
        <div className="erow erow--head">
          <div className="ecol ecol--name"><Skeleton className="h-3 w-24" /></div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="ecol ecol--num"><Skeleton className="h-3 w-14" /></div>
          ))}
          <div className="ecol ecol--ndpi"><Skeleton className="h-3 w-14" /></div>
          <div className="ecol ecol--st" />
        </div>

        {Array.from({ length: СТРОК }, (_, r) => (
          <div key={r} className="erow erow--field">
            <div className="ecol ecol--name">
              <span className="ename"><Skeleton className={`h-4 ${r % 2 ? 'w-32' : 'w-44'}`} /></span>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="ecol ecol--num">
                <span className="ecellbox"><Skeleton className="h-4 w-14" /></span>
              </div>
            ))}
            <div className="ecol ecol--ndpi">
              <span className="ecellbox"><Skeleton className="h-4 w-16" /></span>
            </div>
            <div className="ecol ecol--st" />
          </div>
        ))}
      </section>
    </main>
  );
}
