/* Фасад над источником данных о скважинах и замерах.
 *
 * Переключатель между дев-стендом ВМАП и своей базой — DATA_SOURCE. По
 * умолчанию (переменная не задана) источник — ВМАП: поведение текущих
 * окружений с доступом к стенду не меняется. DATA_SOURCE=manual — режим
 * первого этапа, облачный сервер без ландшафта Заказчика (см. app/BRIEF.md).
 *
 * vmap.ts не меняется ни строкой — этот модуль лишь выбирает, откуда взять
 * реализацию. Все потребители (baseline.ts, effect-window.ts, мастер
 * регистрации, карточка) импортируют функции отсюда вместо '@/db/vmap'.
 */

import * as vmap from './vmap';
import * as manual from './manual';

const РУЧНОЙ = process.env.DATA_SOURCE === 'manual';

/** Для экранов, которым нужно объяснить человеку, откуда сейчас данные. */
export const РУЧНОЙ_ИСТОЧНИК = РУЧНОЙ;

export const PARAM = vmap.PARAM;
export const getWell = РУЧНОЙ ? manual.getWell : vmap.getWell;
export const getRegistrationWell = РУЧНОЙ ? manual.getRegistrationWell : vmap.getRegistrationWell;
export const listRegistrationWells = РУЧНОЙ ? manual.listRegistrationWells : vmap.listRegistrationWells;
export const getMeasurementsWithLookback = РУЧНОЙ
  ? manual.getMeasurementsWithLookback : vmap.getMeasurementsWithLookback;

export type { VmapWell, RegistrationVmapWell } from './vmap';
