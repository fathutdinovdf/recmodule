/* Чтение из ВМАП: скважины и замеры.
 *
 * Здесь собраны все запросы к чужому контуру. Собраны в одном месте намеренно:
 * знание о том, где в WellData лежит время замера и почему нельзя фильтровать
 * по DeleteDate, не должно расползтись по приложению — оно неочевидное и
 * дорого стоило.
 */

import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { vmapQuery, VMAP_SCHEMA } from './pool';
import { measurementsSql, PARAM } from './vmap-sql';
import type { Measurement } from '@/domain/measurements';

/* Коды параметров переехали в vmap-sql.ts — к нему, в отличие от этого
   модуля, могут обратиться служебные скрипты на голом node (здесь мешает
   next/cache). Реэкспорт оставлен, чтобы приложение по-прежнему брало их
   отсюда, вместе с запросами, которые ими пользуются. */
export { PARAM };

export interface VmapWell {
  wellId: number;
  code: string | null;
  name: string;
  operationMode: number | null;
  oilDensity: number | null;
  waterDensity: number | null;
  plast: string | null;
}

export interface RegistrationVmapWell {
  wellId: number;
  number: string;
  kust: string;
  fieldId: number;
  fieldName: string;
}

/* Полное дерево объектов ТПП для мастера. В отличие от служебного
   wells-with-data.json здесь нет фильтра по наличию замеров: рекомендацию
   можно выдать по любой действующей скважине, а отсутствие договорной базы
   мастер покажет отдельно и предложит обоснованный ручной ввод. */
const loadRegistrationWells = async (): Promise<RegistrationVmapWell[]> => {
  const rows = await vmapQuery<{
    well_id: string; well_number: string; kust: string;
    field_id: string; field_name: string;
  }>(`
    SELECT w."Id"::text AS well_id, w."Name" AS well_number,
           k."Name" AS kust, f."Id"::text AS field_id, f."Name" AS field_name
    FROM ${VMAP_SCHEMA}."Wells" w
    JOIN ${VMAP_SCHEMA}."OrganizationUnits" k
      ON k."Id" = w."OrganizationUnitId" AND k."OrganizationUnitType" = 4
     AND k."DeleteDate" IS NULL
    JOIN ${VMAP_SCHEMA}."OrganizationUnits" f
      ON f."Id" = k."ParentId" AND f."OrganizationUnitType" = 3
     AND f."DeleteDate" IS NULL
    JOIN ${VMAP_SCHEMA}."OrganizationUnits" c
      ON c."Id" = f."ParentId" AND c."OrganizationUnitType" = 2
     AND c."DeleteDate" IS NULL
    JOIN ${VMAP_SCHEMA}."OrganizationUnits" t
      ON t."Id" = c."ParentId" AND t."OrganizationUnitType" = 1
     AND t."DeleteDate" IS NULL
    WHERE w."DeleteDate" IS NULL
      AND t."Name" = 'ТПП "Когалымнефтегаз"'
      AND EXISTS (
        SELECT 1
        FROM ${VMAP_SCHEMA}."WellData" well_type
        WHERE well_type."WellId" = w."Id"
          AND well_type."ParameterId" = ${PARAM.WELL_TYPE}
          AND well_type."DeleteDate" IS NULL
          AND well_type."Value" = '1'
      )
    ORDER BY f."Name", lower(w."Name"), w."Name"
  `);
  return rows.map((row) => ({
    wellId: Number(row.well_id), number: row.well_number, kust: row.kust,
    fieldId: Number(row.field_id), fieldName: row.field_name,
  }));
};

/* Состав добывающего фонда меняется редко. Кэш убирает подключение к удалённой
   ВМАП из каждого повторного открытия мастера. */
export const listRegistrationWells = unstable_cache(
  loadRegistrationWells,
  ['registration-production-wells-v1'],
  { revalidate: 300 },
);

/** Доверенная серверная проверка объекта, выбранного в клиентском мастере. */
export async function getRegistrationWell(wellId: number): Promise<RegistrationVmapWell | null> {
  if (!Number.isInteger(wellId) || wellId <= 0) return null;
  const rows = await vmapQuery<{
    well_id: string; well_number: string; kust: string;
    field_id: string; field_name: string;
  }>(`
    SELECT w."Id"::text AS well_id, w."Name" AS well_number,
           k."Name" AS kust, f."Id"::text AS field_id, f."Name" AS field_name
    FROM ${VMAP_SCHEMA}."Wells" w
    JOIN ${VMAP_SCHEMA}."WellData" well_type
      ON well_type."WellId" = w."Id"
     AND well_type."ParameterId" = ${PARAM.WELL_TYPE}
     AND well_type."DeleteDate" IS NULL
     AND well_type."Value" = '1'
    JOIN ${VMAP_SCHEMA}."OrganizationUnits" k
      ON k."Id" = w."OrganizationUnitId" AND k."OrganizationUnitType" = 4
     AND k."DeleteDate" IS NULL
    JOIN ${VMAP_SCHEMA}."OrganizationUnits" f
      ON f."Id" = k."ParentId" AND f."OrganizationUnitType" = 3
     AND f."DeleteDate" IS NULL
    JOIN ${VMAP_SCHEMA}."OrganizationUnits" c
      ON c."Id" = f."ParentId" AND c."OrganizationUnitType" = 2
     AND c."DeleteDate" IS NULL
    JOIN ${VMAP_SCHEMA}."OrganizationUnits" t
      ON t."Id" = c."ParentId" AND t."OrganizationUnitType" = 1
     AND t."DeleteDate" IS NULL
    WHERE w."Id" = $1 AND w."DeleteDate" IS NULL
      AND t."Name" = 'ТПП "Когалымнефтегаз"'
    LIMIT 1
  `, [wellId]);
  const row = rows[0];
  return row ? {
    wellId: Number(row.well_id), number: row.well_number, kust: row.kust,
    fieldId: Number(row.field_id), fieldName: row.field_name,
  } : null;
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
  const rows = await vmapQuery<{ at: Date; value: string }>(
    measurementsSql(VMAP_SCHEMA), [wellId, parameterId, from, to]);

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

/* Скважина с параметрами, нужными для расчёта.
   В cache(), потому что за неё в одном рендере берутся двое: оболочка карточки
   (правая колонка и прогноз) и вкладка расчёта (плотности для перевода
   жидкости в тонны). Стенд чужой, лишний запрос туда не нужен. */
export const getWell = cache(async (wellId: number): Promise<VmapWell | null> => {
  const rows = await vmapQuery<{
    well_id: number; code: string | null; name: string;
    operation_mode: number | null; oil_density: string | null;
    water_density: string | null; plast: string | null;
  }>(`
    SELECT w."Id" AS well_id, w."Code" AS code, w."Name" AS name,
           w."OperationMode" AS operation_mode,
           (SELECT d."Value" FROM ${VMAP_SCHEMA}."WellData" d
             WHERE d."WellId" = w."Id" AND d."ParameterId" = ${PARAM.OIL_DENSITY}
               AND d."DeleteDate" IS NULL LIMIT 1) AS oil_density,
           (SELECT d."Value" FROM ${VMAP_SCHEMA}."WellData" d
             WHERE d."WellId" = w."Id" AND d."ParameterId" = ${PARAM.WATER_DENSITY}
               AND d."DeleteDate" IS NULL LIMIT 1) AS water_density,
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
    /* Ноль в плотности — не «лёгкая нефть», а незаполненное поле: такая
       запись на стенде есть, и она обнулила бы всю нефть по скважине. */
    oilDensity: плотность(r.oil_density),
    waterDensity: плотность(r.water_density),
    plast: r.plast,
  };
});

function плотность(v: string | null): number | null {
  if (v === null) return null;
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
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
