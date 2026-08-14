/* Справочники, которые подставляются в формы.
 *
 * Причины отказа и причины уточнения лежат разными таблицами, а не одной с
 * типом: списки живут независимо, и общий справочник пришлось бы всё время
 * фильтровать. Архивированные позиции не выдаются — их нельзя выбрать заново,
 * но в старых решениях они остаются: там хранится текст, а не ссылка.
 */

import { query } from './pool';

export interface Ref {
  id: number;
  name: string;
}

export async function getRejectReasons(): Promise<Ref[]> {
  const rows = await query<{ id: number; name: string }>(`
    SELECT id, name FROM rec.reject_reasons WHERE archived_at IS NULL ORDER BY sort_order
  `);
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}
