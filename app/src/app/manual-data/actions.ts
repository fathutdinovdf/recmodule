'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/session';
import { factsForMonth, saveFacts, type FactEdit } from '@/db/daily-facts';
import { getRegistrationWell } from '@/db/wells-data';
import { PARAM } from '@/db/vmap-sql';

export interface SaveFactsState {
  error?: string;
  saved?: number;
}

/* Поля формы приходят именами вида «q-14» и «w-14», где число — день месяца.
   Так форма остаётся обычным POST-ом без клиентского состояния: браузер сам
   соберёт тридцать одну пару, а сервер разберёт их по имени. */
const ЧИСЛО = (raw: FormDataEntryValue | null): number | null | undefined => {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!s) return null;                       // пусто — стереть значение
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined; // undefined — мусор, не трогаем
};

export async function сохранитьФакт(
  _state: SaveFactsState,
  form: FormData,
): Promise<SaveFactsState> {
  const user = await currentUser();
  if (!user || user.side !== 'executor') {
    return { error: 'Вводить суточные данные может только Исполнитель.' };
  }

  const wellId = Number(String(form.get('wellId') ?? ''));
  const year = Number(String(form.get('year') ?? ''));
  const month = Number(String(form.get('month') ?? ''));
  if (!Number.isInteger(wellId) || wellId <= 0) return { error: 'Не выбрана скважина.' };
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: 'Не выбран период.' };
  }

  /* Скважина проверяется в справочнике, а не принимается на слово из формы:
     идентификатор приходит с клиента, и записать факт по чужому объекту
     нельзя даже случайно. */
  const well = await getRegistrationWell(wellId);
  if (!well) return { error: 'Скважина не найдена в справочнике объектов.' };

  /* Пишем только то, что человек реально изменил. Без сверки с текущим
     состоянием каждое сохранение слало бы шесть десятков запросов, из которых
     почти все ничего не меняют, а «сохранено N» показывало бы длину месяца
     вместо числа правок. */
  const было = new Map<string, number | null>();
  for (const сутки of await factsForMonth(wellId, year, month)) {
    было.set(`q-${сутки.day}`, сутки.qzh);
    было.set(`w-${сутки.day}`, сутки.watercut);
  }

  const суток = new Date(year, month, 0).getDate();
  const правки: FactEdit[] = [];

  for (let day = 1; day <= суток; day++) {
    const дата = new Date(year, month - 1, day);
    for (const [префикс, parameterId] of [
      ['q', PARAM.QZH_MEASURED], ['w', PARAM.WATERCUT],
    ] as const) {
      const ключ = `${префикс}-${day}`;
      const значение = ЧИСЛО(form.get(ключ));
      if (значение === undefined) continue;
      if (значение !== null && значение < 0) {
        return { error: `Отрицательное значение ${day}-го числа — проверьте ввод.` };
      }
      if (префикс === 'w' && значение !== null && значение > 100) {
        return { error: `Обводнённость ${day}-го числа больше 100 % — проверьте ввод.` };
      }
      if ((было.get(ключ) ?? null) === значение) continue;
      правки.push({ wellId, date: дата, parameterId, value: значение });
    }
  }

  if (правки.length === 0) return { saved: 0 };

  const затронуто = await saveFacts(правки, user.id);
  revalidatePath('/manual-data');
  return { saved: затронуто };
}
