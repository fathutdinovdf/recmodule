/* Чтение и запись суточного факта для вкладки «Суточные данные».
 *
 * Отделено от manual.ts намеренно: там источник данных отвечает на вопрос
 * домена «дай замеры за период» и отдаёт Measurement[], а здесь — редактор,
 * которому нужна сетка «сутки × параметр» с пропусками и журнал правок.
 * Таблица одна и та же (rec.daily_facts), но вопросы к ней разные, и
 * смешение дало бы функцию, которая ни одному из двух вызывающих не подходит
 * целиком.
 *
 * Ключевое, что стоит помнить о модели: факт принадлежит СКВАЖИНЕ, а не
 * рекомендации. Одни и те же сутки видят все рекомендации по этой скважине,
 * чьи периоды их накрывают. Правка из одной карточки меняет цифру и для
 * остальных — поэтому и нужен журнал.
 */

import { query, transaction } from './pool';
import { PARAM } from './vmap-sql';

export interface DayFact {
  /** Локальная дата суток. */
  date: Date;
  qzh: number | null;
  watercut: number | null;
}

const число = (v: string | null): number | null => {
  if (v === null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Ключ суток без часового пояса: даты приходят из pg как локальная полночь. */
const ключ = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Факт за произвольный отрезок дат по скважине. */
export async function factsInRange(
  wellId: number,
  from: Date,
  to: Date,
): Promise<Map<string, DayFact>> {
  const rows = await query<{ date: Date; parameter_id: number; value: string }>(`
    SELECT date, parameter_id, value::text
    FROM rec.daily_facts
    WHERE well_id = $1 AND date >= $2 AND date <= $3
  `, [wellId, from, to]);

  const сетка = new Map<string, DayFact>();
  for (const r of rows) {
    const д = new Date(r.date);
    const k = ключ(д);
    const строка = сетка.get(k) ?? { date: д, qzh: null, watercut: null };
    if (Number(r.parameter_id) === PARAM.QZH_MEASURED) строка.qzh = число(r.value);
    if (Number(r.parameter_id) === PARAM.WATERCUT) строка.watercut = число(r.value);
    сетка.set(k, строка);
  }
  return сетка;
}

export interface FactEvent {
  id: number;
  parameterId: number;
  oldValue: number | null;
  newValue: number | null;
  actorName: string;
  recId: number | null;
  recNumber: string | null;
  at: Date;
}

/** История правок одних суток — то, что показывается прямо в окне ввода дня. */
export async function factHistory(wellId: number, date: Date): Promise<FactEvent[]> {
  const rows = await query<{
    id: string; parameter_id: number; old_value: string | null;
    new_value: string | null; actor_name: string; rec_id: string | null;
    rec_number: string | null; at: Date;
  }>(`
    SELECT e.id::text, e.parameter_id, e.old_value::text, e.new_value::text,
           e.actor_name, e.rec_id::text, r.number AS rec_number, e.at
    FROM rec.daily_fact_events e
    LEFT JOIN rec.recommendations r ON r.id = e.rec_id
    WHERE e.well_id = $1 AND e.date = $2
    ORDER BY e.at DESC, e.id DESC
  `, [wellId, date]);

  return rows.map((r) => ({
    id: Number(r.id),
    parameterId: Number(r.parameter_id),
    oldValue: число(r.old_value),
    newValue: число(r.new_value),
    actorName: r.actor_name,
    recId: r.rec_id === null ? null : Number(r.rec_id),
    recNumber: r.rec_number,
    at: r.at,
  }));
}

/** Сколько правок сделано по суткам отрезка — по одной цифре на день. */
export async function editCounts(
  wellId: number, from: Date, to: Date,
): Promise<Map<string, number>> {
  const rows = await query<{ date: Date; n: number }>(`
    SELECT date, count(*)::int AS n FROM rec.daily_fact_events
    WHERE well_id = $1 AND date >= $2 AND date <= $3
    GROUP BY date
  `, [wellId, from, to]);
  return new Map(rows.map((r) => [ключ(new Date(r.date)), Number(r.n)]));
}

export interface SaveDayResult {
  /** Сколько значений реально изменилось: 0 — человек ничего не поменял. */
  changed: number;
}

/**
 * Запись значений за ОДНИ сутки вместе с журналом.
 *
 * Всё внутри одной транзакции: факт без события в журнале — это цифра,
 * которая изменилась, и никто не знает кем. Именно ради этого запись сделана
 * единственной точкой входа, а не парой «обнови + допиши».
 *
 * `undefined` в значении означает «поле не трогали», `null` — «стереть».
 * Пустое поле должно стирать значение, а не записывать ноль: ноль в дебите —
 * это остановленная скважина, и путать эти два случая нельзя.
 */
export async function saveDay(params: {
  wellId: number;
  date: Date;
  qzh?: number | null;
  watercut?: number | null;
  actorId: number;
  actorName: string;
  recId: number | null;
}): Promise<SaveDayResult> {
  const { wellId, date, actorId, actorName, recId } = params;

  const пары: Array<[number, number | null | undefined]> = [
    [PARAM.QZH_MEASURED, params.qzh],
    [PARAM.WATERCUT, params.watercut],
  ];

  return transaction(async (client) => {
    let changed = 0;

    for (const [parameterId, значение] of пары) {
      if (значение === undefined) continue;

      /* Прежнее значение читается под FOR UPDATE: между чтением и записью
         те же сутки может править второй человек из другой карточки, и без
         блокировки в журнал попало бы «было пусто» поверх чужой цифры. */
      const прежнее = await client.query<{ value: string }>(`
        SELECT value::text FROM rec.daily_facts
        WHERE well_id = $1 AND parameter_id = $2 AND date = $3
        FOR UPDATE
      `, [wellId, parameterId, date]);
      const было = число(прежнее.rows[0]?.value ?? null);

      /* Событие без изменения не пишется: журнал, полный строк «было 12,
         стало 12», перестают читать. */
      if (было === значение) continue;

      if (значение === null) {
        await client.query(`
          DELETE FROM rec.daily_facts
          WHERE well_id = $1 AND parameter_id = $2 AND date = $3
        `, [wellId, parameterId, date]);
      } else {
        await client.query(`
          INSERT INTO rec.daily_facts (well_id, parameter_id, date, value, entered_by)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (well_id, parameter_id, date) DO UPDATE
            SET value = EXCLUDED.value, entered_by = EXCLUDED.entered_by,
                entered_at = now()
        `, [wellId, parameterId, date, значение, actorId]);
      }

      await client.query(`
        INSERT INTO rec.daily_fact_events
          (well_id, parameter_id, date, old_value, new_value,
           actor_id, actor_name, rec_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [wellId, parameterId, date, было, значение, actorId, actorName, recId]);

      changed++;
    }

    return { changed };
  });
}
