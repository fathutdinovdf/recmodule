/* База по замерам ВМАП: связывает выборку замеров с отбором суток в domain.
 *
 * Второй из четырёх договорных способов формирования базы (Приложение № 2):
 * средневзвешенные значения за три календарных дня, непосредственно
 * предшествующих регистрации рекомендации. Правила отбора суток и усреднения —
 * в domain/baseline.ts, здесь только данные.
 *
 * Чего здесь намеренно нет: расширения периода, когда кондиционных суток не
 * набралось. Договор допускает иной период только «по взаимному письменному
 * соглашению Сторон», то есть односторонне взять пять суток вместо трёх нельзя.
 * Функция честно возвращает базу с usedDays = 0, и решение принимает человек.
 */

import { dailySeries } from '@/domain/measurements';
import { baselineFromSeries, BASELINE_DAYS, type MeasuredBaseline } from '@/domain/baseline';
import { getMeasurementsWithLookback, getWell, PARAM } from '@/db/wells-data';

export async function measuredBaseline(params: {
  wellId: number;
  /** Момент, ДО которого берётся период. Обычно — регистрация рекомендации. */
  until: Date;
  days?: number;
}): Promise<MeasuredBaseline> {
  const { wellId, until, days = BASELINE_DAYS } = params;

  /* Период — сутки, ПРЕДШЕСТВУЮЩИЕ дате отсчёта: сутки самой регистрации не
     берутся, они неполные и уже могут содержать реакцию на замеченную
     проблему. */
  const конец = new Date(until);
  конец.setHours(0, 0, 0, 0);
  конец.setDate(конец.getDate() - 1);
  const начало = new Date(конец);
  начало.setDate(начало.getDate() - (days - 1));

  const [well, замерыЖидкости, замерыОбводнённости] = await Promise.all([
    getWell(wellId),
    getMeasurementsWithLookback(wellId, PARAM.QZH_MEASURED, начало, конец),
    getMeasurementsWithLookback(wellId, PARAM.WATERCUT, начало, конец),
  ]);

  return baselineFromSeries({
    qzh: dailySeries(замерыЖидкости, начало, конец),
    watercut: dailySeries(замерыОбводнённости, начало, конец),
    oilDensity: well?.oilDensity ?? null,
    waterDensity: well?.waterDensity ?? null,
  });
}
