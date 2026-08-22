'use server';

/* Соседи по карточке для листалки в шапке, посчитанные в границах отбора
   реестра, из которого карточку открыли (?from=…). Разбор querystring —
   тот же parseListFilterFromSearchParams, что и у самого реестра (app/page.tsx),
   иначе «то же самое отфильтровано» значило бы два разных фильтра. */

import { getFilteredNeighbours, parseListFilterFromSearchParams, type Neighbours } from '@/db/recommendations';

export async function соседиПоОтбору(recId: number, отбор: string): Promise<Neighbours> {
  const sp = Object.fromEntries(new URLSearchParams(отбор));
  return getFilteredNeighbours(recId, parseListFilterFromSearchParams(sp));
}
