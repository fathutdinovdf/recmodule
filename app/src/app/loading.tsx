/* Заглушка реестра.
 *
 * Реестр ждёт на каждом заходе и на каждой смене фильтра: выборка идёт с
 * пересчётом контроля ответа по рабочим часам, и страница объявлена
 * динамической. Пустой экран на это время читается как «ничего не нашлось»,
 * что прямо противоположно правде.
 *
 * Заглушка повторяет разметку страницы вплоть до ширин колонок: они заданы
 * числами в `КОЛОНКИ`, таблица с `table-layout: fixed` растягивается по их
 * сумме, и заглушка обязана считать ту же сумму — иначе при появлении данных
 * таблица прыгнет по горизонтали. Механика ширины та же, что в page.tsx:
 * width:100% + min-width — сумма колонок, <col> в процентах от суммы,
 * чтобы излишек ширины делился пропорционально, а не поровну.
 */

import { Skeleton } from '@/components/ui/skeleton';

/* Те же ширины, что в `page.tsx`. Дублируются намеренно: тянуть их импортом
   значило бы тащить в заглушку весь модуль страницы вместе с обращениями к
   базе, а заглушка обязана отрисоваться раньше любого запроса. */
const КОЛОНКИ = [100, 136, 172, 152, 110, 230, 114, 94, 150, 148, 130];
const СУММА = КОЛОНКИ.reduce((s, w) => s + w, 0);
const СТРОК = 12;

export default function Loading() {
  return (
    <main className="content" aria-busy="true">
      <span className="sr-only" role="status">Загружается реестр</span>

      <div className="pagehead" aria-hidden>
        <Skeleton className="h-7 w-64" />
        <span className="pagehead__zone"><Skeleton className="h-4 w-40" /></span>
        <div className="pagehead__actions">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="size-9" />
          <Skeleton className="size-9" />
        </div>
      </div>

      {/* Плитки-счётчики: число и подпись. Число совпадает с ПЛИТКИ в page.tsx —
          иначе скелетон переносится на вторую строку, а настоящий реестр нет. */}
      <section className="tiles" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="tile">
            <Skeleton className="h-6 w-10" />
            <Skeleton className="mt-1.5 h-3.5 w-24" />
          </div>
        ))}
      </section>

      <section className="panel" aria-hidden>
        <div className="tablewrap">
          <table className="tbl" style={{ width: '100%', minWidth: СУММА }}>
            <colgroup>{КОЛОНКИ.map((w, i) => <col key={i} style={{ width: `${(w / СУММА) * 100}%` }} />)}</colgroup>
            <thead>
              <tr>
                {КОЛОНКИ.map((_, i) => (
                  <th key={i}><Skeleton className="h-3.5 w-2/3" /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: СТРОК }, (_, r) => (
                <tr key={r}>
                  {КОЛОНКИ.map((_, c) => (
                    <td key={c}>
                      {/* Ширина ячейки чуть разная по колонкам: строка из
                          одинаковых прямоугольников читается как решётка, а не
                          как таблица с текстом. */}
                      <Skeleton className={`h-3.5 ${c % 3 === 0 ? 'w-2/3' : c % 3 === 1 ? 'w-11/12' : 'w-1/2'}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pager" aria-hidden>
          <div className="pager__info"><Skeleton className="h-3.5 w-48" /></div>
          <div className="pager__pages">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </section>
    </main>
  );
}
