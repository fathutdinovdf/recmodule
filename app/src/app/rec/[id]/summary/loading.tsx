/* Заглушка вкладки «Сводка».
 *
 * Три текстовых раздела с разделителями, выделенное мероприятие и блок
 * решения внизу — в том же порядке и с теми же отступами, что на самой
 * вкладке (решение 98). Строки текста разной длины: одинаковые дают вид
 * таблицы, а не абзаца.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">Загружается сводка</span>

      <div className="mb-[var(--section-gap-default)] flex flex-col gap-4" aria-hidden>
        <Абзац подпись="w-44" строки={['w-full', 'w-11/12', 'w-3/5']} />
        <Separator className="bg-border/50" />
        <Абзац подпись="w-56" строки={['w-full', 'w-full', 'w-4/5', 'w-2/5']} />
        <Separator className="bg-border/50" />

        {/* Рекомендуемое мероприятие — Item с рамкой, поэтому рамка настоящая. */}
        <div className="rounded-md border border-border p-3">
          <Skeleton className="h-3.5 w-52" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-2/3" />
        </div>
      </div>

      {/* Блок решения: заголовок, пояснение и три кнопки. */}
      <div className="decision" aria-hidden>
        <div className="decision__h"><Skeleton className="h-4 w-56" /></div>
        <Skeleton className="mt-1 h-3.5 w-full max-w-[520px]" />
        <div className="decision__btns">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-48" />
        </div>
      </div>
    </div>
  );
}

function Абзац({ подпись, строки }: { подпись: string; строки: string[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Skeleton className={`h-3.5 ${подпись}`} />
      <div className="flex flex-col gap-1.5">
        {строки.map((w, i) => <Skeleton key={i} className={`h-4 ${w}`} />)}
      </div>
    </section>
  );
}
