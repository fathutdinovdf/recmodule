/* Расчёт эффекта по окну: замеры из ВМАП + ставки из базы модуля + база.
 *
 * Это единственное место, где сходятся три источника, и потому единственное,
 * где можно ошибиться в их стыковке. Сама арифметика живёт в domain/ и ничего
 * про базы не знает.
 */

import { dailySeries, liquidMass, oilFromLiquid } from '@/domain/measurements';
import { dailyEffect, sumBreakdowns, missingRates,
         type WellEconomy, type EffectBreakdown } from '@/domain/effect';
import { getMeasurementsWithLookback, getWell, PARAM } from '@/db/vmap';
import { getWellEconomy } from '@/db/economy';

export interface Baseline {
  baseQzh: number | null;
  baseQn: number | null;
  baseEe: number | null;
}

export interface EffectDay {
  date: Date;
  /** Дебит жидкости, м³/сут — как его меряет ВМАП. */
  factQzh: number | null;
  /** Он же в тоннах: ставка ЭЭ на жидкость заведена на массу. */
  factQzhT: number | null;
  factQn: number | null;
  deltaQzh: number | null;
  deltaQzhT: number | null;
  deltaQn: number | null;
  points: number;
  coverage: number;
  money: EffectBreakdown | null;
}

export interface EffectResult {
  days: EffectDay[];
  total: EffectBreakdown;
  /* Сколько суток окна посчитано по замерам, а сколько осталось без данных.
     Это первое, о чём спросят, глядя на итог. */
  daysTotal: number;
  daysWithData: number;
  /* Почему расчёт не сделан или сделан частично. Пустой список — всё в порядке. */
  problems: string[];
  economy: WellEconomy | null;
  oilDensity: number | null;
  waterDensity: number | null;
}

/**
 * Полный расчёт окна эффекта.
 *
 * Считается по фактическим суткам, а не умножением суточного прироста на длину
 * окна: день простоя приходит нулевым приростом сам. Именно поэтому здесь нет
 * коэффициента эксплуатации — он бы задвоил поправку на простой.
 */
export async function calculateEffect(params: {
  wellId: number;
  fieldId: number;
  wellNumber: string;
  windowFrom: Date;
  windowTo: Date;
  baseline: Baseline;
}): Promise<EffectResult> {
  const { wellId, fieldId, wellNumber, windowFrom, windowTo, baseline } = params;
  const problems: string[] = [];

  const [econ, well] = await Promise.all([
    getWellEconomy(fieldId, wellNumber),
    getWell(wellId),
  ]);

  const нехватка = missingRates(econ);
  if (нехватка.length) problems.push(`Не заведено: ${нехватка.join(', ')}`);

  /* Плотность нефти нужна, чтобы перевести замеренную жидкость в тонны нефти.
     Без неё считается только прирост жидкости, а деньги — нет. */
  const плотность = well?.oilDensity ?? null;
  if (плотность === null) problems.push('Нет плотности нефти по скважине');

  /* Плотность воды нужна ровно для одной статьи — электроэнергии на жидкость,
     но без неё нельзя посчитать и её, а значит и итог. */
  const плотностьВоды = well?.waterDensity ?? null;
  if (плотностьВоды === null) problems.push('Нет плотности воды по скважине');

  const [замерыЖидкости, замерыОбводнённости] = await Promise.all([
    getMeasurementsWithLookback(wellId, PARAM.QZH_MEASURED, windowFrom, windowTo),
    getMeasurementsWithLookback(wellId, PARAM.WATERCUT, windowFrom, windowTo),
  ]);

  if (замерыЖидкости.length === 0) problems.push('За период нет замеров дебита');

  const рядЖидкости = dailySeries(замерыЖидкости, windowFrom, windowTo);
  const рядОбводнённости = dailySeries(замерыОбводнённости, windowFrom, windowTo);
  const обводнённостьПоДню = new Map(
    рядОбводнённости.map((d) => [d.date.getTime(), d.value]),
  );

  const days: EffectDay[] = [];
  const деньги: EffectBreakdown[] = [];

  for (const сутки of рядЖидкости) {
    const factQzh = сутки.value;
    const обводнённость = обводнённостьПоДню.get(сутки.date.getTime()) ?? null;
    const factQn = oilFromLiquid(factQzh, обводнённость, плотность);

    const deltaQzh = factQzh !== null && baseline.baseQzh !== null
      ? factQzh - baseline.baseQzh : null;
    const deltaQn = factQn !== null && baseline.baseQn !== null
      ? factQn - baseline.baseQn : null;

    /* Масса прироста считается прямо из приростов, а не как разность масс:
       liquidMass линейна, результат тот же, и базе не нужна своя
       обводнённость — её и не хранят. */
    const deltaQzhT = liquidMass(deltaQzh, deltaQn, плотность, плотностьВоды);

    /* Деньги считаем только когда известны ОБА прироста: часть статей висит на
       жидкости, часть на нефти, и посчитать «половину» значит выдать заниженный
       эффект за полный. */
    let money: EffectBreakdown | null = null;
    if (econ && нехватка.length === 0 && deltaQzhT !== null && deltaQn !== null) {
      money = dailyEffect(econ, deltaQzhT, deltaQn);
      деньги.push(money);
    }

    days.push({
      date: сутки.date,
      factQzh,
      factQzhT: liquidMass(factQzh, factQn, плотность, плотностьВоды),
      factQn, deltaQzh, deltaQzhT, deltaQn,
      points: сутки.points,
      coverage: сутки.coverage,
      money,
    });
  }

  if (baseline.baseQzh === null || baseline.baseQn === null) {
    problems.push('Базовые значения не заданы');
  }

  return {
    days,
    total: sumBreakdowns(деньги),
    daysTotal: days.length,
    daysWithData: days.filter((d) => d.factQzh !== null).length,
    problems,
    economy: econ,
    oilDensity: плотность,
    waterDensity: плотностьВоды,
  };
}
