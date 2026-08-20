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
 * Отдаём сразу DailyPoint[], а не Measurement[], и это принципиально.
 * Замер ВМАП — мгновенное показание, между замерами последнее значение
 * законно протягивается: телеметрия — ступенька, и сутки без замера всё
 * равно чем-то описаны. Введённое руками число — не показание, а СУТОЧНОЕ
 * значение, и незаполненный день значит «ещё не внесли», а не «столько же,
 * сколько вчера».
 *
 * Разница не косметическая: пропусти это, и одни введённые сутки в начале
 * окна протянулись бы на все девяносто, дав полный эффект в деньгах из
 * единственной цифры. Плюс через Measurement[] значение приезжало обратно
 * искажённым (введённые 100 превращались в 100,00023) — первую секунду
 * суток занимало прежнее значение.
 *
 * Обводнённость — исключение, её протягиваем. Причина та же, по которой её
 * протягивает отбор суток базы (см. domain/baseline.ts): её определяют
 * лабораторно и много реже дебита, и требовать собственного значения на
 * каждые сутки значило бы оставить без нефти почти весь расчёт. Протянутые
 * сутки помечены points = 0, поэтому отбор базы по-прежнему их различает.
 */
export async function dailySeriesFor(
  wellId: number,
  parameterId: number,
  from: Date,
  to: Date,
): Promise<DailyPoint[]> {
  /* Запас назад нужен только протягиваемому параметру: дебит за пределами
     периода ни на что не влияет, а обводнённости нужно значение, знакомое
     до начала периода. */
  const протягивать = parameterId === PARAM.WATERCUT;
  const начало = new Date(from);
  if (протягивать) начало.setDate(начало.getDate() - LOOKBACK_DAYS);

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
  if (протягивать) {
    for (const r of rows) {
      const д = new Date(r.date);
      if (dayStart(д) >= dayStart(from)) break;
      const v = Number(r.value);
      if (Number.isFinite(v)) протянутое = v;
    }
  }

  const ряд: DailyPoint[] = [];
  for (let t = dayStart(from).getTime(); t <= dayStart(to).getTime(); t += СУТКИ_МС) {
    const день = new Date(t);
    const своё = свои.get(ключСуток(день));

    if (своё !== undefined) {
      протянутое = своё;
      ряд.push({ date: день, value: своё, points: 1, coverage: 1 });
    } else {
      /* points = 0 — «нет собственного значения»: отбор суток базы по этому
         признаку исключит день, а расчёт окна покажет его в «протянуто». */
      ряд.push({
        date: день,
        value: протягивать ? протянутое : null,
        points: 0,
        coverage: 0,
      });
    }
  }
  return ряд;
}

export { PARAM };
