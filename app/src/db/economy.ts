/* Ставки экономической модели из базы модуля. */

import { query } from './pool';
import type { WellEconomy } from '@/domain/effect';

/**
 * Экономика скважины: ставки, пласт, цена нефти.
 *
 * Ключ — пара «месторождение + номер», а не один номер. Номер уникален внутри
 * месторождения, но не между ними: по одному номеру 77 скважин фонда получили
 * бы ставку соседнего промысла — молча, без единого признака ошибки на экране.
 *
 * Возвращает null, если месторождения нет в модели Заказчика или скважина в неё
 * не попала. Расчёт в этом случае не делается вовсе: взять чужую или
 * устаревшую ставку нельзя, ошибка в разы не видна глазом.
 */
export async function getWellEconomy(
  fieldId: number,
  wellNumber: string,
): Promise<WellEconomy | null> {
  const rows = await query<{
    field_name: string; source_name: string | null; plast: string | null;
    tax_plast: string; ndpi: string; ee_liquid: string | null;
    ee_oil: string | null; chem: string | null; oil_price: string;
  }>(`
    SELECT f.field_name, f.source_name, w.plast, n.plast AS tax_plast,
           n.rate AS ndpi, f.ee_liquid, f.ee_oil, f.chem, g.oil_price
    FROM rec.econ_well_rates w
    JOIN rec.econ_field_rates f ON f.field_id = w.field_id
    JOIN rec.econ_ndpi_rates  n ON n.id = w.ndpi_id
    CROSS JOIN rec.econ_global g
    WHERE w.field_id = $1 AND lower(w.well_number) = lower($2)
  `, [fieldId, wellNumber.trim()]);

  const r = rows[0];
  if (!r || !r.source_name) return null;

  /* Числовые типы PostgreSQL приезжают строками: numeric не влезает в double
     без потерь, и драйвер честно не приводит его сам. Приводим здесь, один раз
     на входе в приложение, чтобы дальше по коду ходили числа. */
  const число = (v: string | null): number | null => (v === null ? null : Number(v));

  return {
    fieldName: r.field_name,
    sourceName: r.source_name,
    plast: r.plast,
    taxPlast: r.tax_plast,
    ndpi: Number(r.ndpi),
    eeLiquid: число(r.ee_liquid) as number,
    eeOil: число(r.ee_oil) as number,
    chem: число(r.chem) as number,
    oilPrice: Number(r.oil_price),
  };
}

export interface FieldRate {
  fieldId: number;
  fieldName: string;
  sourceName: string | null;
  eeLiquid: number | null;
  eeOil: number | null;
  chem: number | null;
}

export async function listFieldRates(): Promise<FieldRate[]> {
  const rows = await query<{
    field_id: string; field_name: string; source_name: string | null;
    ee_liquid: string | null; ee_oil: string | null; chem: string | null;
  }>(`
    SELECT field_id, field_name, source_name, ee_liquid, ee_oil, chem
    FROM rec.econ_field_rates ORDER BY field_name
  `);
  return rows.map((r) => ({
    fieldId: Number(r.field_id),
    fieldName: r.field_name,
    sourceName: r.source_name,
    eeLiquid: r.ee_liquid === null ? null : Number(r.ee_liquid),
    eeOil: r.ee_oil === null ? null : Number(r.ee_oil),
    chem: r.chem === null ? null : Number(r.chem),
  }));
}

export interface NdpiRate {
  id: number;
  key: string;
  fieldName: string;
  plast: string;
  rate: number;
}

export async function listNdpiRates(): Promise<NdpiRate[]> {
  const rows = await query<{
    id: string; key: string; field_name: string; plast: string; rate: string;
  }>(`
    SELECT id, key, field_name, plast, rate FROM rec.econ_ndpi_rates
    ORDER BY field_name, plast
  `);
  return rows.map((r) => ({
    id: Number(r.id), key: r.key, fieldName: r.field_name,
    plast: r.plast, rate: Number(r.rate),
  }));
}

export async function getOilPrice(): Promise<number> {
  const rows = await query<{ oil_price: string }>('SELECT oil_price FROM rec.econ_global WHERE id = 1');
  return Number(rows[0]?.oil_price ?? 0);
}
