/* Заглушка вкладки «Расчёт эффекта», пока считается сам расчёт.
 *
 * Вкладка ждёт дольше всех: 90 суток агрегируются из замеров стенда ВМАП, и
 * при открытом окне расчёт делается заново на каждое открытие (замеры
 * догружаются задним числом). До этого на её месте была пустая панель, и по
 * ней нельзя было понять, идёт расчёт или вкладка просто пуста.
 *
 * Заглушка повторяет разметку самой страницы — те же `eff`, `eff-total`,
 * `eff-base`, — а не рисует собственную сетку. Смысл в геометрии: блоки стоят
 * там же и той же высоты, поэтому появление настоящих чисел ничего не
 * сдвигает. Отсюда же взяты и размеры прямоугольников: ширина под цифру рублей
 * шире, чем под подпись, ровно как в готовом виде.
 *
 * Дальше первого экрана заглушка не идёт: посуточная таблица свёрнута в
 * `details` и в готовой странице, а обещать содержимое, которого человек не
 * просил раскрывать, незачем.
 */

import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="eff" aria-busy="true">
      <span className="sr-only" role="status">Считается эффект</span>

      {/* Итог в рублях. Плашка своя, с заливкой, поэтому классы настоящие. */}
      <section aria-hidden>
        <div className="eff-total">
          <div>
            <Skeleton className="mb-2 h-3.5 w-40" />
            <Skeleton className="h-9 w-56" />
          </div>
          <div className="eff-total__side">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-3.5 w-full max-w-[380px]" />
            <Skeleton className="h-3.5 w-2/3 max-w-[260px]" />
          </div>
        </div>
      </section>

      {/* База: три ячейки в строку. */}
      <section aria-hidden>
        <Заголовок ширина="w-72" />
        <div className="eff-base">
          {[0, 1, 2].map((i) => (
            <div key={i} className="eff-base__i">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-2 h-3.5 w-1/2 max-w-[420px]" />
      </section>

      <section aria-hidden>
        <Заголовок ширина="w-36" />
        <Skeleton className="h-16 w-full" />
      </section>

      {/* Два графика рядом — те же пропорции, что у настоящих. */}
      <section aria-hidden>
        <Заголовок ширина="w-40" />
        <div className="eff-charts">
          <div className="eff-chart">
            <Skeleton className="mb-1.5 h-3.5 w-44" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="eff-chart">
            <Skeleton className="mb-1.5 h-3.5 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </section>

      {/* Статьи: пять строк «название — ставка — сумма». */}
      <section aria-hidden>
        <Заголовок ширина="w-56" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </section>

      <section aria-hidden>
        <Skeleton className="h-4 w-52" />
      </section>

      <section aria-hidden>
        <Заголовок ширина="w-40" />
        <div className="eff-quality">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="eff-quality__i">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3.5 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* Заголовок раздела занимает свою строку целиком: `eff__h` несёт отступ снизу,
   без него блоки под заголовками съехались бы вверх относительно готовой
   страницы. */
function Заголовок({ ширина }: { ширина: string }) {
  return (
    <div className="eff__h">
      <Skeleton className={`h-5 ${ширина}`} />
    </div>
  );
}
