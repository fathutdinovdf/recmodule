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
import { dayStart, type Measurement } from '@/domain/measurements';

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
 * Построчный суточный факт превращается в Measurement[] — тот же тип, что
 * отдаёт vmap.ts. Момент замера ставится на секунду позже начала суток:
 * domain/measurements.ts (dailyAverage) сам умеет и протяжку значения вперёд
 * при пропущенных сутках, и расчёт coverage/points, так что введённая
 * вручную суточная величина получает coverage ≈ 1, а пропущенная — 0
 * (протяжка), без единой строки нового кода в domain/.
 */
export async function getMeasurementsWithLookback(
  wellId: number,
  parameterId: number,
  from: Date,
  to: Date,
  lookbackDays = 30,
): Promise<Measurement[]> {
  const начало = new Date(from);
  начало.setDate(начало.getDate() - lookbackDays);

  const rows = await query<{ date: Date; value: string }>(`
    SELECT date, value FROM rec.daily_facts
    WHERE well_id = $1 AND parameter_id = $2 AND date >= $3 AND date <= $4
    ORDER BY date
  `, [wellId, parameterId, начало, to]);

  return rows
    .map((r) => ({ at: new Date(dayStart(new Date(r.date)).getTime() + 1000), value: Number(r.value) }))
    .filter((m) => Number.isFinite(m.value));
}

export { PARAM };
