/* Заглушка вкладки «Суточные данные», пока считается отрезок дней.
 *
 * Страница делает несколько последовательных запросов (карточка, факт за
 * отрезок, счётчик правок, поиск последнего значения ДО начала отрезка) —
 * без своего loading.tsx переход на вкладку поднимался бы до общей заглушки
 * оболочки карточки (`rec/loading.tsx`), которая на секунду гасит уже
 * отрисованные шапку и вкладки ради содержимого одной вкладки.
 *
 * Повторяет разметку `КалендарьСуток` (calendar.tsx): заголовок с описанием
 * слева, счётчик заполненности справа, легенда, три месяца календаря в ряд.
 * Сетка дней декоративная — календарь построен на `<table>` react-day-picker,
 * пиксель-в-пиксель повторять её незачем, а вот число месяцев (3) и общая
 * плотность сетки те же, чтобы блок не менял высоту при появлении данных.
 */

import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-[var(--section-padding)]" aria-busy="true">
      <span className="sr-only" role="status">Загружается календарь суточных данных</span>

      <div className="flex flex-wrap items-end justify-between gap-4" aria-hidden>
        <div>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="mt-2 h-3.5 w-full max-w-[420px]" />
        </div>
        <div className="min-w-[220px]">
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-12" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <Skeleton className="size-3 rounded-sm" />
            <Skeleton className="h-3 w-32" />
          </span>
        ))}
      </div>

      <div className="flex flex-row gap-6 overflow-x-auto" aria-hidden>
        {[0, 1, 2].map((m) => (
          <div key={m} className="flex flex-col gap-3">
            <Skeleton className="h-4 w-24" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }, (_, i) => (
                <Skeleton key={i} className="size-8 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
