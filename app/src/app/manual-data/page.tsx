/* Ручной ввод суточного факта — экран первого этапа, когда стенда ВМАП нет.
 *
 * Скважина и месяц стоят в адресе, а не в состоянии компонента: страница
 * серверная, данные за месяц тянутся сразу нужные, а ссылку на конкретный
 * месяц конкретной скважины можно переслать. Это же снимает вопрос
 * синхронизации таблицы с выбором — новый выбор просто перерисовывает
 * страницу.
 */

import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { listRegistrationWells, getRegistrationWell } from '@/db/wells-data';
import { factsForMonth } from '@/db/daily-facts';
import { РУЧНОЙ_ИСТОЧНИК } from '@/db/wells-data';
import { ФормаСуток } from './entry';

export const dynamic = 'force-dynamic';

export default async function Страница({ searchParams }: {
  searchParams: Promise<{ well?: string; month?: string }>;
}) {
  const user = await currentUser();
  /* Экран принадлежит Исполнителю: факт по телеметрии — его зона
     ответственности, ровно как и фиксация реализации (решение о том, что
     факт определяет Исполнитель, а не Заказчик). */
  if (user?.side !== 'executor') notFound();

  const params = await searchParams;
  const сегодня = new Date();

  const wellId = Number(params.well ?? '');
  const [year, month] = разобратьМесяц(params.month, сегодня);

  const [скважины, скважина] = await Promise.all([
    listRegistrationWells().catch(() => []),
    Number.isInteger(wellId) && wellId > 0 ? getRegistrationWell(wellId) : null,
  ]);

  const сутки = скважина ? await factsForMonth(скважина.wellId, year, month) : [];

  return (
    <ФормаСуток
      скважины={скважины}
      скважина={скважина}
      year={year}
      month={month}
      сутки={сутки}
      ручнойРежим={РУЧНОЙ_ИСТОЧНИК}
    />
  );
}

/* Месяц в адресе — «ГГГГ-ММ». Мусор и будущее не принимаются: вводить факт
   за ещё не наступивший месяц нечего, а незаметно показанный не тот период
   привёл бы к вводу чисел не в те сутки. */
function разобратьМесяц(raw: string | undefined, сегодня: Date): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? '');
  if (m) {
    const y = Number(m[1]);
    const mm = Number(m[2]);
    const первое = new Date(y, mm - 1, 1);
    const валиден = mm >= 1 && mm <= 12 && y >= 2020
      && первое <= new Date(сегодня.getFullYear(), сегодня.getMonth(), 1);
    if (валиден) return [y, mm];
  }
  return [сегодня.getFullYear(), сегодня.getMonth() + 1];
}
