/* Чтение из ВМАП: скважины и замеры.
 *
 * Здесь собраны все запросы к чужому контуру. Собраны в одном месте намеренно:
 * знание о том, где в WellData лежит время замера и почему нельзя фильтровать
 * по DeleteDate, не должно расползтись по приложению — оно неочевидное и
 * дорого стоило.
 */

import { vmapQuery, VMAP_SCHEMA } from './pool';
import type { Measurement } from '@/domain/measurements';

/** Параметры ВМАП, которые нужны модулю. */
export const PARAM = {
  /** Дебит жидкости замерной — фактический дебит для расчёта эффекта. */
  QZH_MEASURED: 1,
  /** Обводнённость объёмная — из неё получается нефть. */
  WATERCUT: 7,
  /** Плотность нефти в стандартных условиях, кг/м³. */
  OIL_DENSITY: 13,
  /** Пласт(ы), на которые работает скважина. */
  PLAST: 50,
  /** Тип скважины: добывающий фонд — значение 1. */
  WELL_TYPE: 20,
} as const;

export interface VmapWell {
  wellId: number;
  code: string | null;
  name: string;
  operationMode: number | null;
  oilDensity: number | null;
  plast: string | null;
}

/**
 * Замеры параметра по скважине за период.
 *
 * Два неочевидных места, оба стоили одной неверной выгрузки.
 *
 * 1. DeleteDate у замера НЕ означает «запись ошибочна». WellData хранит текущее
 *    значение параметра, и когда приходит следующий замер, предыдущий
 *    помечается удалённым. Вся история — это записи с проставленным DeleteDate:
 *    их 1 774 442 против 9 115 «живых». Фильтр «DeleteDate IS NULL» оставляет
 *    последний замер на скважину, то есть 0,5 % данных, и ряда из этого не
 *    собрать.
 *
 * 2. Время замера — LEAST(CreateDate, UpdateDate), а не одно из полей.
 *    Семантика пары в разных пачках разная: где-то замер лежит в CreateDate
 *    (01.02 12:00 при UpdateDate 03.02 04:33 — ночная загрузка), где-то
 *    наоборот (UpdateDate 08:35 при CreateDate 08:45:02.912, одинаковом у всей
 *    пачки). Общее одно: момент замера всегда раньше момента записи в базу.
 *    FactDate точнее, но заполнен у сотни записей из девяти тысяч, поэтому идёт
 *    первым в COALESCE, а не единственным.
 */
export async function getMeasurements(
  wellId: number,
  parameterId: number,
  from: Date,
  to: Date,
): Promise<Measurement[]> {
  const rows = await vmapQuery<{ at: Date; value: string }>(`
    SELECT DISTINCT
           COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) AS at,
           d."Value" AS value
    FROM ${VMAP_SCHEMA}."WellData" d
    WHERE d."WellId" = $1
      AND d."ParameterId" = $2
      AND COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) >= $3
      AND COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) <= $4
    ORDER BY at
  `, [wellId, parameterId, from, to]);

  return rows
    .map((r) => ({ at: new Date(r.at), value: Number(r.value) }))
    .filter((m) => Number.isFinite(m.value));
}

/**
 * Замеры с запасом назад: первым суткам периода нужно значение, действовавшее
 * ДО них, иначе протягивать нечего и сутки начинаются с неизвестности.
 * Тридцать суток запаса покрывают даже самый длинный разрыв, встреченный в
 * данных (50 суток — редкий выброс, остальные укладываются в сутки).
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
  return getMeasurements(wellId, parameterId, начало, to);
}

/** Последнее известное значение статичного параметра — плотность, пласт, тип. */
export async function getWellParam(
  wellId: number,
  parameterId: number,
): Promise<string | null> {
  const rows = await vmapQuery<{ value: string }>(`
    SELECT d."Value" AS value
    FROM ${VMAP_SCHEMA}."WellData" d
    WHERE d."WellId" = $1 AND d."ParameterId" = $2 AND d."DeleteDate" IS NULL
    ORDER BY COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) DESC
    LIMIT 1
  `, [wellId, parameterId]);
  return rows[0]?.value ?? null;
}

/** Скважина с параметрами, нужными для расчёта. */
export async function getWell(wellId: number): Promise<VmapWell | null> {
  const rows = await vmapQuery<{
    well_id: number; code: string | null; name: string;
    operation_mode: number | null; oil_density: string | null; plast: string | null;
  }>(`
    SELECT w."Id" AS well_id, w."Code" AS code, w."Name" AS name,
           w."OperationMode" AS operation_mode,
           (SELECT d."Value" FROM ${VMAP_SCHEMA}."WellData" d
             WHERE d."WellId" = w."Id" AND d."ParameterId" = ${PARAM.OIL_DENSITY}
               AND d."DeleteDate" IS NULL LIMIT 1) AS oil_density,
           (SELECT d."Value" FROM ${VMAP_SCHEMA}."WellData" d
             WHERE d."WellId" = w."Id" AND d."ParameterId" = ${PARAM.PLAST}
               AND d."DeleteDate" IS NULL LIMIT 1) AS plast
    FROM ${VMAP_SCHEMA}."Wells" w
    WHERE w."Id" = $1 AND w."DeleteDate" IS NULL
  `, [wellId]);

  const r = rows[0];
  if (!r) return null;
  return {
    wellId: r.well_id,
    code: r.code,
    name: r.name,
    operationMode: r.operation_mode,
    oilDensity: r.oil_density === null ? null : Number(r.oil_density),
    plast: r.plast,
  };
}

/** Доступность стенда: экран должен отличать «нет данных» от «нет связи». */
export async function vmapAvailable(): Promise<boolean> {
  try {
    await vmapQuery('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
