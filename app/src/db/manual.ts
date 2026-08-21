/* Источник данных для DATA_SOURCE=manual: своя база вместо стенда ВМАП.
 *
 * Первый этап — облачный сервер без доступа к ландшафту Заказчика. Дерево
 * объектов и параметры скважины приходят разовым дампом в rec.ref_wells
 * (scripts/dump-wells-ref.mjs + load-wells-ref.mjs), суточный факт вводится
 * формой на экране в rec.daily_facts. Сигнатуры функций один в один
 * повторяют vmap.ts — так wells-data.ts подставляет этот модуль вместо него,
 * не трогая потребителей.
 */

import { query } from './pool';
import { PARAM } from './vmap-sql';
import type { VmapWell, RegistrationVmapWell } from './vmap';
import { dayStart, type DailyPoint } from '@/domain/measurements';

const СУТКИ_МС = 86_400_000;
const LOOKBACK_DAYS = 30;

/** Ключ суток без часового пояса: даты приходят из pg локальной полночью. */
const ключСуток = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

async function loadRefWell(wellId: number) {
  const rows = await query<{
    well_id: string; well_number: string; code: string | null; kust: string;
    field_id: string; field_name: string; oil_density: string | null;
    water_density: string | null; plast: string | null; operation_mode: number | null;
  }>(`
    SELECT well_id::text, well_number, code, kust, field_id::text, field_name,
           oil_density::text, water_density::text, plast, operation_mode
    FROM rec.ref_wells WHERE well_id = $1
  `, [wellId]);
  return rows[0] ?? null;
}

export async function listRegistrationWells(): Promise<RegistrationVmapWell[]> {
  const rows = await query<{
    well_id: string; well_number: string; kust: string;
    field_id: string; field_name: string;
  }>(`
    SELECT well_id::text, well_number, kust, field_id::text, field_name
    FROM rec.ref_wells
    ORDER BY field_name, lower(well_number), well_number
  `);
  return rows.map((r) => ({
    wellId: Number(r.well_id), number: r.well_number, kust: r.kust,
    fieldId: Number(r.field_id), fieldName: r.field_name,
  }));
}

export async function getRegistrationWell(wellId: number): Promise<RegistrationVmapWell | null> {
  if (!Number.isInteger(wellId) || wellId <= 0) return null;
  const r = await loadRefWell(wellId);
  return r ? {
    wellId: Number(r.well_id), number: r.well_number, kust: r.kust,
    fieldId: Number(r.field_id), fieldName: r.field_name,
  } : null;
}

export async function getWell(wellId: number): Promise<VmapWell | null> {
  const r = await loadRefWell(wellId);
  if (!r) return null;
  return {
    wellId: Number(r.well_id),
    code: r.code,
    name: r.well_number,
    operationMode: r.operation_mode,
    oilDensity: r.oil_density === null ? null : Number(r.oil_density),
    waterDensity: r.water_density === null ? null : Number(r.water_density),
    plast: r.plast,
  };
}

/**
 * Суточный ряд по введённым вручную значениям.
 *
 * Отдаём сразу DailyPoint[], а не Measurement[], и это принципиально: через
 * Measurement[] введённое значение приезжало обратно искажённым (внесённые
 * 100 превращались в 100,00023), потому что замер ставился на 00:00:01 и
 * первую секунду суток занимало прежнее значение. Суточная величина должна
 * доходить до расчёта ровно такой, какой её внесли.
 *
 * Последнее известное значение ПРОТЯГИВАЕТСЯ вперёд, пока не появится
 * следующее, — так же, как это делает телеметрия ВМАП. Иначе один и тот же
 * расчёт давал бы разные деньги в зависимости от источника данных, а
 * незаполненный день читался бы как остановка скважины, которой не было.
 *
 * Протянутые сутки помечены `points = 0`, и это не формальность, а
 * единственный способ отличить подтверждённое значение от предположения:
 *
 *   — отбор суток базы (domain/baseline.ts) протянутые сутки НЕ берёт:
 *     договор требует кондиционных значений, то есть собственных;
 *   — расчёт окна их берёт, но вкладка «Расчёт эффекта» показывает, сколько
 *     суток посчитано по протяжке;
 *   — календарь рисует такие клетки отдельным видом.
 *
 * Об ограничении честно: протяжка не отличает остановленную скважину от
 * скважины без внесённых данных. Одни внесённые сутки в начале окна дадут
 * эффект за всё окно. Ровно то же ограничение есть и у стенда (см.
 * domain/measurements.ts), лечится оно состоянием скважины, которого в
 * расчёте пока нет.
 */
export async function dailySeriesFor(
  wellId: number,
  parameterId: number,
  from: Date,
  to: Date,
): Promise<DailyPoint[]> {
  /* Запас назад обязателен: первым суткам периода нужно значение,
     действовавшее ДО них, иначе протягивать нечего и период начинается с
     неизвестности. Тот же запас, что у выборки замеров со стенда. */
  const начало = new Date(from);
  начало.setDate(начало.getDate() - LOOKBACK_DAYS);

  const rows = await query<{ date: Date; value: string }>(`
    SELECT date, value::text FROM rec.daily_facts
    WHERE well_id = $1 AND parameter_id = $2 AND date >= $3 AND date <= $4
    ORDER BY date
  `, [wellId, parameterId, начало, to]);

  const свои = new Map<string, number>();
  for (const r of rows) {
    const v = Number(r.value);
    if (Number.isFinite(v)) свои.set(ключСуток(new Date(r.date)), v);
  }

  /* Последнее значение ДО периода — с него начинается протяжка. */
  let протянутое: number | null = null;
  for (const r of rows) {
    const д = new Date(r.date);
    if (dayStart(д) >= dayStart(from)) break;
    const v = Number(r.value);
    if (Number.isFinite(v)) протянутое = v;
  }

  const ряд: DailyPoint[] = [];
  for (let t = dayStart(from).getTime(); t <= dayStart(to).getTime(); t += СУТКИ_МС) {
    const день = new Date(t);
    const своё = свои.get(ключСуток(день));

    if (своё !== undefined) {
      протянутое = своё;
      ряд.push({ date: день, value: своё, points: 1, coverage: 1 });
    } else {
      /* points = 0 — «своего значения нет, взято протянутое». По этому
         признаку отбор суток базы день исключит, а расчёт окна возьмёт и
         покажет в «протянуто». null остаётся только там, где тянуть ещё
         нечего: до самой первой внесённой записи. */
      ряд.push({ date: день, value: протянутое, points: 0, coverage: 0 });
    }
  }
  return ряд;
}

export { PARAM };
