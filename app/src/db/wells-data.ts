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
 * суточное значение. Отдавай источники Measurement[], разница стёрлась бы, а
 * заодно значение приезжало бы искажённым: замер ставился на 00:00:01, и
 * первую секунду суток занимало прежнее. Поэтому наружу оба источника отдают
 * DailyPoint[], а как ряд получен — их собственное дело.
 *
 * Переезд на ландшафт Заказчика — не мгновенная подмена источника, а ГРАНИЦА
 * ПО ДАТЕ: см. `датаПерехода` ниже.
 */

import { cache } from 'react';
import * as vmap from './vmap';
import * as manual from './manual';
import { query } from './pool';
import { dailySeries, type DailyPoint } from '@/domain/measurements';

const РУЧНОЙ = process.env.DATA_SOURCE === 'manual';

/** Для экранов, которым нужно объяснить человеку, откуда сейчас данные. */
export const РУЧНОЙ_ИСТОЧНИК = РУЧНОЙ;

export const PARAM = vmap.PARAM;
export const getWell = РУЧНОЙ ? manual.getWell : vmap.getWell;
export const getRegistrationWell = РУЧНОЙ ? manual.getRegistrationWell : vmap.getRegistrationWell;
export const listRegistrationWells = РУЧНОЙ ? manual.listRegistrationWells : vmap.listRegistrationWells;

/**
 * Дата, с которой факт берётся из ВМАП. null — перехода не было.
 *
 * Смысл в том, что переезд не должен пересчитывать прошлое. Сутки, которые
 * посчитали по внесённым руками значениям, обязаны остаться такими же —
 * иначе в день переезда накопленный эффект по идущим окнам сдвинулся бы сам,
 * без действия человека. Это деньги по договору, и двигаться сами они не
 * могут.
 *
 * В cache(), потому что за ряд в одном рендере приходят до шести раз
 * (жидкость, обводнённость, энергия — и для базы, и для окна).
 */
export const датаПерехода = cache(async (): Promise<Date | null> => {
  const rows = await query<{ vmap_from: Date | null }>(
    'SELECT vmap_from FROM rec.source_switch WHERE id = 1');
  return rows[0]?.vmap_from ?? null;
});

const днём = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

async function изВмап(
  wellId: number, parameterId: number, from: Date, to: Date,
): Promise<DailyPoint[]> {
  /* Запас назад обязателен: первым суткам периода нужно значение,
     действовавшее ДО них, иначе протягивать нечего и сутки начинаются с
     неизвестности. Он же спасает стык при склейке: ВМАП-половина найдёт
     последний замер, даже если он лежит до даты перехода. */
  const замеры = await vmap.getMeasurementsWithLookback(wellId, parameterId, from, to);
  return dailySeries(замеры, from, to);
}

/**
 * Суточный ряд параметра за период — единственный способ получить факт.
 *
 * Три случая. В ручном режиме ряд целиком из своей базы. Без даты перехода —
 * целиком со стенда. С датой перехода ряд СКЛЕИВАЕТСЯ: сутки до неё из
 * rec.daily_facts, начиная с неё — из замеров.
 *
 * Половины не пересекаются по датам, поэтому их достаточно соединить: обе
 * уже DailyPoint[] с одинаковым смыслом полей.
 */
export const dailySeriesFor = cache(async (
  wellId: number,
  parameterId: number,
  from: Date,
  to: Date,
): Promise<DailyPoint[]> => {
  if (РУЧНОЙ) return manual.dailySeriesFor(wellId, parameterId, from, to);

  const переход = await датаПерехода();
  if (!переход) return изВмап(wellId, parameterId, from, to);

  const граница = днём(переход);
  if (граница <= днём(from)) return изВмап(wellId, parameterId, from, to);
  if (граница > днём(to)) return manual.dailySeriesFor(wellId, parameterId, from, to);

  const конецРучных = new Date(граница);
  конецРучных.setDate(конецРучных.getDate() - 1);

  const [ручные, стенд] = await Promise.all([
    manual.dailySeriesFor(wellId, parameterId, from, конецРучных),
    изВмап(wellId, parameterId, граница, to),
  ]);
  return [...ручные, ...стенд];
});

/**
 * Берутся ли эти сутки из ручного ввода. Нужно экранам: календарь
 * раскрашивает только то, что действительно приходит из внесённых значений,
 * а не обещает влияние там, где считает телеметрия.
 */
export async function суткиРучные(день: Date): Promise<boolean> {
  if (РУЧНОЙ) return true;
  const переход = await датаПерехода();
  return переход !== null && днём(день) < днём(переход);
}

export type { VmapWell, RegistrationVmapWell } from './vmap';
export type { DailyPoint };
