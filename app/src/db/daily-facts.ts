/* Чтение и запись суточного факта для экрана ручного ввода.
 *
 * Отделено от manual.ts намеренно: там источник данных отвечает на вопрос
 * домена «дай замеры за период» и отдаёт Measurement[], а здесь — редактор,
 * которому нужна сетка «сутки × параметр» с пропусками. Таблица одна и та же
 * (rec.daily_facts), но вопросы к ней разные, и смешение дало бы функцию,
 * которая ни одному из двух вызывающих не подходит целиком.
 */

import { query, transaction } from './pool';
import { PARAM } from './vmap-sql';

export interface DayFact {
  /** ДД в пределах месяца — ключ строки таблицы. */
  day: number;
  qzh: number | null;
  watercut: number | null;
}

/** Факт за календарный месяц по скважине: по строке на каждые сутки месяца. */
export async function factsForMonth(
  wellId: number,
  year: number,
  month: number,
): Promise<DayFact[]> {
  const первое = new Date(year, month - 1, 1);
  const последнее = new Date(year, month, 0);

  const rows = await query<{ day: number; parameter_id: number; value: string }>(`
    SELECT EXTRACT(DAY FROM date)::int AS day, parameter_id, value::text
    FROM rec.daily_facts
    WHERE well_id = $1 AND date >= $2 AND date <= $3
  `, [wellId, первое, последнее]);

  const сетка = new Map<number, DayFact>();
  for (let d = 1; d <= последнее.getDate(); d++) {
    сетка.set(d, { day: d, qzh: null, watercut: null });
  }
  for (const r of rows) {
    const строка = сетка.get(Number(r.day));
    if (!строка) continue;
    const значение = Number(r.value);
    if (!Number.isFinite(значение)) continue;
    if (Number(r.parameter_id) === PARAM.QZH_MEASURED) строка.qzh = значение;
    if (Number(r.parameter_id) === PARAM.WATERCUT) строка.watercut = значение;
  }
  return [...сетка.values()];
}

export interface FactEdit {
  wellId: number;
  date: Date;
  parameterId: number;
  /** null — стереть введённое ранее значение: пустое поле значит «нет данных»,
   *  а не «ноль». Ноль в дебите — это остановленная скважина, и путать эти два
   *  случая нельзя (см. domain/measurements.ts). */
  value: number | null;
}

/** Правки одним заходом: транзакция, потому что сутки редактируются пачкой. */
export async function saveFacts(edits: FactEdit[], userId: number): Promise<number> {
  if (edits.length === 0) return 0;

  return transaction(async (client) => {
    let затронуто = 0;
    for (const e of edits) {
      if (e.value === null) {
        const r = await client.query(`
          DELETE FROM rec.daily_facts
          WHERE well_id = $1 AND parameter_id = $2 AND date = $3
        `, [e.wellId, e.parameterId, e.date]);
        затронуто += r.rowCount ?? 0;
      } else {
        const r = await client.query(`
          INSERT INTO rec.daily_facts (well_id, parameter_id, date, value, entered_by)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (well_id, parameter_id, date) DO UPDATE
            SET value = EXCLUDED.value, entered_by = EXCLUDED.entered_by, entered_at = now()
        `, [e.wellId, e.parameterId, e.date, e.value, userId]);
        затронуто += r.rowCount ?? 0;
      }
    }
    return затронуто;
  });
}
