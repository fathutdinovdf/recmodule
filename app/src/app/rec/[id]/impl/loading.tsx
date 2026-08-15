/* Заглушка вкладки «Реализация».
 *
 * Показывает состояние «факт уже зафиксирован» — четыре KPI и блок ниже: оно
 * встречается чаще двух остальных (до согласования вкладка пуста и грузится
 * мгновенно, после согласования там одна кнопка). Заглушка обязана угадывать
 * самый частый случай: угаданный правильно, он не даёт сдвига вовсе.
 */

import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">Загружается реализация</span>

      <div className="block" aria-hidden>
        <div className="block__h"><Skeleton className="h-4 w-52" /></div>
        <div className="kpis">
          {['w-24', 'w-20', 'w-24', 'w-28'].map((w, i) => (
            <div key={i} className="kpi">
              <span className="kpi__k"><Skeleton className="h-3.5 w-28" /></span>
              <span className="kpi__v"><Skeleton className={`h-5 ${w}`} /></span>
            </div>
          ))}
        </div>
        <Skeleton className="mt-2 h-3.5 w-full max-w-[520px]" />
      </div>

      <div className="block" aria-hidden>
        <div className="block__h"><Skeleton className="h-4 w-40" /></div>
        <Skeleton className="h-4 w-full max-w-[600px]" />
        <Skeleton className="mt-1.5 h-4 w-3/4 max-w-[460px]" />
        <div className="form__btns" style={{ marginTop: 'var(--group-gap-m)' }}>
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-3.5 w-36" />
        </div>
      </div>
    </div>
  );
}
