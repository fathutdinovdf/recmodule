'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/session';
import { saveDay, factHistory, type FactEvent } from '@/db/daily-facts';
import { getCard } from '@/db/card';
import { query } from '@/db/pool';
import { recalcEffect } from '@/services/effect-store';

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
  const ee = значение(form, 'ee');

  if (qzh !== undefined && qzh !== null && qzh < 0) {
    return { error: 'Дебит не может быть отрицательным.' };
  }
  if (watercut !== undefined && watercut !== null && (watercut < 0 || watercut > 100)) {
    return { error: 'Обводнённость задаётся в процентах, от 0 до 100.' };
  }
  if (ee !== undefined && ee !== null && ee < 0) {
    return { error: 'Потребление электроэнергии не может быть отрицательным.' };
  }

  const { changed } = await saveDay({
    wellId: card.wellId,
    date: дата,
    qzh,
    watercut,
    ee,
    actorId: user.id,
    actorName: user.fullName,
    recId,
  });

  /* Пересчёт делается ЗДЕСЬ, сразу после правки.
     Вкладка «Расчёт эффекта» не считает сама: она читает сохранённое из
     rec.effect_daily и считает только на холодном старте (см.
     services/effect-store.ts). Без пересчёта человек, внёсший замер, видел бы
     на соседней вкладке прежние деньги и прежнее качество данных — и решил
     бы, что ввод не сработал.

     Пересчитываются ВСЕ затронутые рекомендации, а не только та, из которой
     правили: факт принадлежит скважине, и эти сутки могут попадать в окно
     соседней карточки по той же скважине. Закрытые окна не трогаются — у них
     цифра зафиксирована, акт мог уйти Заказчику. */
  if (changed) {
    for (const id of await затронутыеКарточки(card.wellId, дата)) {
      try {
        const затронутая = await getCard(id);
        if (затронутая) await recalcEffect(затронутая);
      } catch {
        /* Одна не пересчитавшаяся карточка не должна ронять сохранение
           данных: они уже записаны и в журнале, а расчёт догонит фоновым
           проходом /api/effect/recalc. */
      }
      revalidatePath(`/rec/${id}`, 'layout');
    }
  }

  const история = await factHistory(card.wellId, дата);
  return {
    changed,
    day: iso,
    history: история.map((e) => ({ ...e, at: e.at.toISOString() })),
  };
}

/* Рекомендации, чей расчёт зависит от этих суток: та же скважина, окно
   открыто и накрывает дату. Дата сравнивается по суткам — окно хранится
   отметками времени, и правка за день открытия иначе не попала бы. */
async function затронутыеКарточки(wellId: number, дата: Date): Promise<number[]> {
  const rows = await query<{ id: string }>(`
    SELECT r.id::text
      FROM rec.recommendations r
      JOIN rec.implementations i ON i.rec_id = r.id
     WHERE r.well_id = $1
       AND r.deleted_at IS NULL
       AND i.closed_at IS NULL
       AND $2::date >= i.window_open_at::date
       AND $2::date <= i.window_close_at::date
     ORDER BY r.id
  `, [wellId, дата]);
  return rows.map((r) => Number(r.id));
}
