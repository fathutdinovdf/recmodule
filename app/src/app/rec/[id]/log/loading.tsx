/* Заглушка вкладки «История и обсуждение».
 *
 * Лента читается с конца, поэтому заглушка идёт сверху вниз с нарастающей
 * плотностью и заканчивается строкой ввода — тем местом, куда человек смотрит
 * первым. Чередование «событие / реплика» повторяет два ритма самой ленты:
 * плотная строка с иконкой и блок с аватаром и фоном.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

/* Правда / ложь — реплика или событие. Порядок взят типичный: события идут
   подряд, реплики разбавляют их по одной-две. */
const ЛЕНТА = [false, false, true, false, true, true, false];

export default function Loading() {
  return (
    <div className="relative flex min-h-full flex-col" aria-busy="true">
      <span className="sr-only" role="status">Загружается обсуждение</span>

      <div className="flex-1" aria-hidden>
        <div className="flex items-center gap-3 pb-2 pt-1">
          <Skeleton className="h-3.5 w-24" />
          <Separator className="flex-1" />
        </div>

        <ol className="mb-2">
          {ЛЕНТА.map((реплика, i) => (
            <li key={i} className="grid grid-cols-[24px_1fr_auto] items-start gap-3 pb-4">
              <Skeleton className="size-6 rounded-full" />
              {реплика
                ? (
                  <div className="max-w-[68ch] rounded-md bg-muted px-3 py-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="mt-2 h-4 w-full" />
                    <Skeleton className="mt-1.5 h-4 w-2/3" />
                  </div>
                )
                : (
                  <div className="min-w-0">
                    <Skeleton className="h-4 w-1/2 max-w-[320px]" />
                    <Skeleton className="mt-1.5 h-3.5 w-40" />
                  </div>
                )}
              <Skeleton className="mt-0.5 h-3.5 w-10" />
            </li>
          ))}
        </ol>
      </div>

      {/* Строка ввода: скрепка, поле, отправка — на своём месте внизу. */}
      <div className="mt-3 border-t border-border pt-3" aria-hidden>
        <div className="flex items-end gap-2">
          <Skeleton className="size-9" />
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="size-9" />
        </div>
      </div>
    </div>
  );
}
