/* Фасад над источником данных о скважинах и суточном факте.
 *
 * Переключатель — DATA_SOURCE. По умолчанию (переменная не задана или
 * `vmap`) источник — дев-стенд ВМАП: поведение прежних окружений не
 * меняется. `manual` — режим первого этапа, облачный сервер без ландшафта
 * Заказчика (см. app/BRIEF.md).
 *
 * Граница проведена по СУТОЧНОМУ РЯДУ, а не по замерам, и это главное
 * решение этого модуля. Замер — понятие телеметрии: мгновенное показание,
 * между показаниями значение законно протягивается. Введённое руками число —
 * суточное значение, и незаполненный день значит «не внесли», а не «как
 * вчера». Отдавай источники Measurement[], разница стёрлась бы, и одни
 * введённые сутки в начале окна дали бы полный эффект за все девяносто.
 * Поэтому наружу оба источника отдают DailyPoint[], а как он получен — их
 * собственное дело.
 */

import { cache } from 'react';
import * as vmap from './vmap';
import * as manual from './manual';
import { dailySeries, type DailyPoint } from '@/domain/measurements';

const РУЧНОЙ = process.env.DATA_SOURCE === 'manual';

/** Для экранов, которым нужно объяснить человеку, откуда сейчас данные. */
export const РУЧНОЙ_ИСТОЧНИК = РУЧНОЙ;

export const PARAM = vmap.PARAM;
export const getWell = РУЧНОЙ ? manual.getWell : vmap.getWell;
export const getRegistrationWell = РУЧНОЙ ? manual.getRegistrationWell : vmap.getRegistrationWell;
export const listRegistrationWells = РУЧНОЙ ? manual.listRegistrationWells : vmap.listRegistrationWells;

/**
 * Суточный ряд параметра за период — единственный способ получить факт.
 *
 * В cache(), потому что за один и тот же ряд в одном рендере приходят
 * дважды: полоса прогноза в оболочке карточки и расчёт эффекта во вкладке.
 */
export const dailySeriesFor = cache(async (
  wellId: number,
  parameterId: number,
  from: Date,
  to: Date,
): Promise<DailyPoint[]> => {
  if (РУЧНОЙ) return manual.dailySeriesFor(wellId, parameterId, from, to);

  /* Запас назад обязателен: первым суткам периода нужно значение,
     действовавшее ДО них, иначе протягивать нечего и сутки начинаются с
     неизвестности. */
  const замеры = await vmap.getMeasurementsWithLookback(wellId, parameterId, from, to);
  return dailySeries(замеры, from, to);
});

export type { VmapWell, RegistrationVmapWell } from './vmap';
export type { DailyPoint };
