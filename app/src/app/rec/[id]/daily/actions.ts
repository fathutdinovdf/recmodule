'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/session';
import { saveDay, factHistory, type FactEvent } from '@/db/daily-facts';
import { getCard } from '@/db/card';

export interface DayActionState {
  error?: string;
  /** Сколько значений изменилось. 0 — человек ничего не поменял. */
  changed?: number;
  /** Обновлённая история этих суток: окно показывает её сразу после записи. */
  history?: Array<Omit<FactEvent, 'at'> & { at: string }>;
  /** Эхо суток: у формы в окне нет своего состояния, ответ нужно сопоставить. */
  day?: string;
}

/* Пустая строка — стереть значение, отсутствие поля — не трогать. Разница
   существенная: стереть и «не трогать» дают разные записи в журнале. */
function значение(form: FormData, key: string): number | null | undefined {
  if (!form.has(key)) return undefined;
  const s = String(form.get(key) ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/* История подгружается на открытие окна дня, а не вместе со страницей: по
   девяноста суткам окна это девяносто списков, из которых человек посмотрит
   один. */
export async function историяСуток(recId: number, iso: string): Promise<
  Array<Omit<FactEvent, 'at'> & { at: string }>
> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return [];
  const card = await getCard(recId);
  if (!card || card.wellId === null) return [];
  const события = await factHistory(
    card.wellId, new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  );
  return события.map((e) => ({ ...e, at: e.at.toISOString() }));
}

export async function сохранитьСутки(
  _state: DayActionState,
  form: FormData,
): Promise<DayActionState> {
  const user = await currentUser();
  /* Факт по телеметрии определяет Исполнитель — то же правило, что и у
     фиксации реализации. Заказчик цифры, от которых считается его же
     обязательство, править не может. */
  if (!user || user.side !== 'executor') {
    return { error: 'Вводить суточные данные может только Исполнитель.' };
  }

  const recId = Number(String(form.get('recId') ?? ''));
  const iso = String(form.get('day') ?? '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { error: 'Не разобрать дату.' };
  const дата = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  const card = await getCard(recId);
  if (!card || card.wellId === null) return { error: 'Карточка или скважина не найдены.' };

  /* Сутки вперёд заполнять нечем: факта за них ещё нет. Проверка серверная,
     потому что выключенное поле в форме — подсказка человеку, а не защита. */
  const завтра = new Date();
  завтра.setHours(0, 0, 0, 0);
  if (дата > завтра) return { error: 'Эти сутки ещё не наступили.' };

  const qzh = значение(form, 'qzh');
  const watercut = значение(form, 'watercut');

  if (qzh !== undefined && qzh !== null && qzh < 0) {
    return { error: 'Дебит не может быть отрицательным.' };
  }
  if (watercut !== undefined && watercut !== null && (watercut < 0 || watercut > 100)) {
    return { error: 'Обводнённость задаётся в процентах, от 0 до 100.' };
  }

  const { changed } = await saveDay({
    wellId: card.wellId,
    date: дата,
    qzh,
    watercut,
    actorId: user.id,
    actorName: user.fullName,
    recId,
  });

  /* Пересчёт эффекта не трогаем: он идёт своим ходом (см. scripts/dev.mjs и
     /api/effect/recalc). Здесь только обновляем страницу карточки, чтобы
     календарь и расчёт увидели новые сутки. */
  if (changed) revalidatePath(`/rec/${recId}`, 'layout');

  const история = await factHistory(card.wellId, дата);
  return {
    changed,
    day: iso,
    history: история.map((e) => ({ ...e, at: e.at.toISOString() })),
  };
}
