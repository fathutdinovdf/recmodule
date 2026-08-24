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

/* ======================= экран «Экономическая модель» =======================
 *
 * Ниже — чтение для редактора ставок. Отдельно от `getWellEconomy` выше:
 * тот отвечает на вопрос расчёта «сколько стоит тонна у этой скважины», а эти
 * функции показывают модель целиком, включая то, чего в ней не хватает.
 *
 * Пласты приклеиваются к месторождению по `source_name`, а не по `field_name`:
 * ставки НДПИ пришли из модели Заказчика и названы её словами, узел дерева
 * ВМАП называется иначе, и четыре Южно-Ягунских узла ссылаются на одну
 * строку модели. Связь именно такая, какой её построил `load-economy`.
 */

export interface EconPlast {
  id: number;
  plast: string;
  rate: number;
}

export interface EconField extends FieldRate {
  plasts: EconPlast[];
  /** Скважин, привязанных к пластовой ставке. Ноль означает, что расчёт по
      объекту не пойдёт даже при заведённых ставках затрат. */
  wells: number;
}

export interface EconModel {
  oilPrice: number;
  fields: EconField[];
  /** Скважины, по которым уже выданы рекомендации, но ставки НДПИ у них нет. */
  wellsUnbound: number;
}

export async function econModel(): Promise<EconModel> {
  const [price, fields, plasts, wells, unbound] = await Promise.all([
    getOilPrice(),
    listFieldRates(),
    listNdpiRates(),
    query<{ field_id: string; n: string }>(
      'SELECT field_id, count(*) AS n FROM rec.econ_well_rates GROUP BY field_id'),
    /* Считаем не «сколько скважин фонда без ставки» — таких тысячи и это
       нормально, — а сколько из них уже упомянуты в рекомендациях. Только по
       ним расчёт эффекта однажды остановится, и только они требуют действия. */
    query<{ n: string }>(`
      SELECT count(*) AS n FROM (
        SELECT DISTINCT r.field_id, lower(r.well_number) AS wn
        FROM rec.recommendations r
        WHERE r.deleted_at IS NULL AND r.status <> 'draft'
      ) t
      LEFT JOIN rec.econ_well_rates e
        ON e.field_id = t.field_id AND lower(e.well_number) = t.wn
      WHERE e.field_id IS NULL
    `),
  ]);

  const поПластам = new Map<string, EconPlast[]>();
  for (const p of plasts) {
    const список = поПластам.get(p.fieldName) ?? [];
    список.push({ id: p.id, plast: p.plast, rate: p.rate });
    поПластам.set(p.fieldName, список);
  }

  const поСкважинам = new Map(wells.map((r) => [Number(r.field_id), Number(r.n)]));

  return {
    oilPrice: price,
    wellsUnbound: Number(unbound[0]?.n ?? 0),
    fields: fields.map((f) => ({
      ...f,
      plasts: f.sourceName ? поПластам.get(f.sourceName) ?? [] : [],
      wells: поСкважинам.get(f.fieldId) ?? 0,
    })),
  };
}

export interface EconChange {
  scope: 'global' | 'field' | 'ndpi';
  object: string;
  field: string;
  old: string | null;
  new: string | null;
}

export interface EconVersion {
  id: number;
  version: string;
  at: Date;
  effectiveFrom: Date;
  actorName: string;
  reason: string;
  changes: EconChange[];
}

export async function econHistory(limit = 50): Promise<EconVersion[]> {
  const rows = await query<{
    id: string; version: string; at: Date; effective_from: Date;
    actor_name: string; reason: string; changes: EconChange[];
  }>(`
    SELECT v.id, v.version, v.at, v.effective_from, v.actor_name, v.reason,
           coalesce(
             json_agg(json_build_object(
               'scope', c.scope, 'object', c.object_name, 'field', c.field,
               'old', c.old_value, 'new', c.new_value
             ) ORDER BY c.id) FILTER (WHERE c.id IS NOT NULL),
             '[]'
           ) AS changes
    FROM rec.econ_versions v
    LEFT JOIN rec.econ_changes c ON c.version_id = v.id
    GROUP BY v.id
    ORDER BY v.at DESC
    LIMIT $1
  `, [limit]);

  return rows.map((r) => ({
    id: Number(r.id),
    version: r.version,
    at: r.at,
    effectiveFrom: r.effective_from,
    actorName: r.actor_name,
    reason: r.reason,
    changes: r.changes,
  }));
}
