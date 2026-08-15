/* Заглушка карточки рекомендации — целиком, вместе с оболочкой.
 *
 * Лежит в `rec/`, а не в `rec/[id]/`, и это существенно. Заглушка сегмента
 * подставляется вместо его содержимого, но внутри его собственного layout;
 * положенная в `[id]`, она ждала бы, пока отработает `[id]/layout.tsx` — а
 * именно он и медленный: карточка, соседи по реестру, история скважины,
 * экономика и обращение к чужому стенду ВМАП. До этого момента на экране
 * оставался бы реестр, из которого ушли. Уровнем выше граница накрывает и
 * layout, поэтому каркас карточки появляется сразу по нажатию на номер.
 *
 * Внутри карточки эта заглушка больше не участвует: переход между вкладками
 * идёт под уже отрисованным layout, и его перехватывают `loading.tsx` самих
 * вкладок.
 *
 * Полоса вкладок тоже нарисована скелетоном, хотя состав вкладок известен
 * заранее и текст можно было бы показать настоящим. Причина в другом: пока
 * карточка не прочитана, неизвестны ни счётчики у «Файлов» и «Истории», ни
 * то, какая вкладка окажется активной, — настоящие подписи с неизвестной
 * подсветкой читались бы как готовая полоса, по которой почему-то нельзя
 * нажать. Ширины сегментов при этом честные, по длине ярлыков из `tabs-def`.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { ВКЛАДКИ } from './[id]/tabs-def';
import '../card.css';
import '../card-extra.css';

export default function Loading() {
  return (
    <main className="content content--card" aria-busy="true">
      <span className="sr-only" role="status">Загружается карточка рекомендации</span>

      <div className="cardhead" aria-hidden>
        <div className="cardhead__top">
          <Skeleton className="size-10 rounded-full" />
          {/* Номер набран 30-м кеглем — плашка под него заметно выше прочих. */}
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />

          <div className="cardhead__trailing">
            <div className="pager">
              <Skeleton className="size-[30px] rounded-full" />
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="size-[30px] rounded-full" />
            </div>
            <Skeleton className="size-10 rounded-full" />
          </div>
        </div>

        <div className="cardhead__where"><Skeleton className="mt-4 h-5 w-96" /></div>
        <div className="cardhead__hr" />
        <div className="metas">
          {['w-28', 'w-52', 'w-48', 'w-40'].map((w, i) => (
            <div key={i} className="meta">
              <Skeleton className="h-3.5 w-2/3 max-w-40" />
              <Skeleton className={`h-4 ${w}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Полоса ожидаемого результата: подпись, три прироста и рубли. */}
      <div className="forecast" aria-hidden>
        <div className="fc fc--cap">
          <div className="fc__cap">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-1 h-3.5 w-20" />
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <div className="fc" key={i}>
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
        <div className="fc fc--money">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>

      <div className="cardbody">
        <section className="panel panel--main" aria-hidden>
          <div className="tabs" style={{ paddingBlock: 'var(--group-padding-s)' }}>
            <div className="flex h-9 items-center gap-[2px]">
              {ВКЛАДКИ.map((t) => (
                /* px-3 с обеих сторон — те же отступы, что у настоящего
                   сегмента, поэтому полоса не меняет длину при подмене. */
                <span key={t.key} className="flex h-full items-center px-3">
                  <Skeleton className="h-3.5" style={{ width: `${t.label.length}ch` }} />
                </span>
              ))}
            </div>
          </div>

          {/* Содержимое вкладки — нейтральные абзацы: какая вкладка откроется,
              здесь ещё неизвестно. Как только layout появится, его сменит
              заглушка самой вкладки, повторяющая её разметку точно. */}
          <div className="tabpane">
            <div className="flex flex-col gap-4">
              <Абзац строки={['w-44', 'w-full', 'w-11/12', 'w-3/5']} />
              <Абзац строки={['w-56', 'w-full', 'w-full', 'w-4/5']} />
              <Абзац строки={['w-40', 'w-full', 'w-2/3']} />
            </div>
          </div>
        </section>

        <aside className="context" aria-hidden>
          <div className="card">
            <div className="card__h"><Skeleton className="h-4 w-40" /></div>
            <dl className="params">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="contents">
                  <dt><Skeleton className="h-3.5 w-32" /></dt>
                  <dd><Skeleton className="ml-auto h-3.5 w-20" /></dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card">
            <div className="card__h"><Skeleton className="h-4 w-48" /></div>
            <Skeleton className="h-16 w-full" />
            <div className="spark__cap mt-1">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>

          <div className="card">
            <div className="card__h"><Skeleton className="h-4 w-52" /></div>
            <div className="prev">
              {[0, 1].map((i) => (
                <div key={i} className="prev__i">
                  <Skeleton className="h-3.5 w-11/12" />
                  <Skeleton className="mt-1.5 h-3.5 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* Первая строка абзаца — подпись раздела, она короче остальных. */
function Абзац({ строки }: { строки: string[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      {строки.map((w, i) => (
        <Skeleton key={i} className={`${i === 0 ? 'mb-0.5 h-3.5' : 'h-4'} ${w}`} />
      ))}
    </section>
  );
}
