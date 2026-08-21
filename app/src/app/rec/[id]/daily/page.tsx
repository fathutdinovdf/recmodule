/* Вкладка «Суточные данные» — ручной ввод факта по календарю.
 *
 * Появляется только при DATA_SOURCE=manual (см. tabs-def.ts): когда замеры
 * приходят со стенда, вводить их руками нечего.
 *
 * Почему календарь, а не таблица месяца. Вопрос, с которым сюда приходят, —
 * «где в окне дырки»: расчёт эффекта считает по фактическим суткам, и одна
 * незаполненная середина окна видна в итоге, а в списке из девяноста строк
 * нет. Календарь отвечает на него формой самой сетки, не заставляя читать.
 *
 * Отрезок показа — от начала периода базы до закрытия окна: ровно те сутки,
 * которые участвуют в расчёте ЭТОЙ рекомендации. Дальше календарь не пускает
 * не из вредности, а потому что вводить факт вне расчёта здесь незачем — для
 * этого есть та же вкладка в другой карточке.
 */

import { notFound } from 'next/navigation';
import { getCard } from '@/db/card';
import { currentUser } from '@/lib/session';
import { РУЧНОЙ_ИСТОЧНИК } from '@/db/wells-data';
import { factsInRange, editCounts } from '@/db/daily-facts';
import { КалендарьСуток, type ДеньКалендаря } from './calendar';

export const dynamic = 'force-dynamic';

const СУТКИ = 86_400_000;
const днём = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default async function Страница({ params }: { params: Promise<{ id: string }> }) {
  if (!РУЧНОЙ_ИСТОЧНИК) notFound();

  const { id } = await params;
  const card = await getCard(Number(id));
  if (!card || card.wellId === null) notFound();

  const user = await currentUser();
  const можноПравить = user?.side === 'executor';

  const сегодня = днём(new Date());

  /* Начало отрезка — период базы, если он посчитан; иначе трое суток до
     регистрации, то есть тот период, который базой станет. Без регистрации
     (черновик) — месяц назад: показать хоть что-то полезнее, чем пустоту. */
  const началоБазы = card.baseline?.periodFrom ? днём(card.baseline.periodFrom) : null;
  const регистрация = card.registeredAt ? днём(card.registeredAt) : null;
  const начало = началоБазы
    ?? (регистрация ? new Date(регистрация.getTime() - 3 * СУТКИ) : new Date(сегодня.getTime() - 30 * СУТКИ));

  /* Конец — закрытие окна. Окна ещё нет — сегодня: до фиксации реализации
     считать нечего, но факт уже стоит копить. */
  const конецОкна = card.implementation ? днём(card.implementation.windowCloseAt) : null;
  const конец = конецОкна && конецОкна > сегодня ? конецОкна : сегодня;

  const [факт, правок] = await Promise.all([
    factsInRange(card.wellId, начало, конец),
    editCounts(card.wellId, начало, конец),
  ]);

  const конецБазы = card.baseline?.periodTo ? днём(card.baseline.periodTo) : null;
  const началоОкна = card.implementation ? днём(card.implementation.windowOpenAt) : null;

  const дни: ДеньКалендаря[] = [];
  for (let t = начало.getTime(); t <= конец.getTime(); t += СУТКИ) {
    const д = new Date(t);
    const k = `${д.getFullYear()}-${д.getMonth() + 1}-${д.getDate()}`;
    const ф = факт.get(k);
    дни.push({
      iso: iso(д),
      qzh: ф?.qzh ?? null,
      watercut: ф?.watercut ?? null,
      ee: ф?.ee ?? null,
      правок: правок.get(k) ?? 0,
      вБазе: !!(началоБазы && конецБазы && д >= началоБазы && д <= конецБазы),
      вОкне: !!(началоОкна && конецОкна && д >= началоОкна && д <= конецОкна),
      будущее: д > сегодня,
    });
  }

  return (
    <КалендарьСуток
      recId={card.id}
      wellNumber={card.wellNumber}
      дни={дни}
      от={iso(начало)}
      до={iso(конец)}
      сегодня={iso(сегодня)}
      можноПравить={можноПравить}
      окноЗакрыто={!!card.implementation?.closedAt}
    />
  );
}
