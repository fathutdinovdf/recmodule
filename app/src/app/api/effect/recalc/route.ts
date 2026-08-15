/* Пересчёт эффекта — точка входа для фонового расчёта.
 *
 * Страница эффект не считает: она читает готовое из `rec.effect_daily`.
 * Считает тот, кто поднят постоянно. Сейчас это ручной вызов и будущий
 * планировщик, в рабочем контуре — бэкенд ВМАП по расписанию.
 *
 * Почему маршрут, а не скрипт: расчёт живёт в `src/services` вместе с доменом
 * на TypeScript, и скрипт на голом `pg` пришлось бы писать заново — второй
 * реализацией той же формулы, которая обязана быть одна.
 *
 * Тела нет: пересчитываются все рекомендации с открытым окном. Выбирать их
 * снаружи нечему — «что пора пересчитать» знает сам модуль.
 *
 * Метод POST, потому что вызов меняет данные: GET-ом такое дёргают
 * предзагрузчики браузера и обходчики, а каждый вызов — это поход на чужой
 * стенд за девяносто суток замеров.
 */

import { NextResponse } from 'next/server';
import { query } from '@/db/pool';
import { getCard } from '@/db/card';
import { recalcEffect } from '@/services/effect-store';

export const dynamic = 'force-dynamic';

export async function POST() {
  /* Только открытые окна. У закрытого цифра зафиксирована, и пересчитывать её
     нельзя вовсе: акт уже мог уйти Заказчику. */
  const rows = await query<{ id: number }>(`
    SELECT r.id
      FROM rec.recommendations r
      JOIN rec.implementations i ON i.rec_id = r.id
     WHERE i.closed_at IS NULL
       AND i.window_close_at > now()
     ORDER BY r.id
  `);

  const итог: { id: number; days: number | null; error?: string }[] = [];

  /* Последовательно, а не Promise.all: это чужой контур, и обрушивать на него
     сотню параллельных выборок за девяносто суток нельзя. */
  for (const { id } of rows) {
    try {
      const card = await getCard(id);
      итог.push({ id, days: card ? await recalcEffect(card) : null });
    } catch (e) {
      /* Одна упавшая скважина не должна останавливать остальные: у части фонда
         нет ставок или плотностей, и это штатное состояние. */
      итог.push({ id, days: null, error: e instanceof Error ? e.message : 'сбой расчёта' });
    }
  }

  return NextResponse.json({
    total: rows.length,
    ok: итог.filter((r) => r.days !== null).length,
    failed: итог.filter((r) => r.error).length,
    items: итог,
  });
}
