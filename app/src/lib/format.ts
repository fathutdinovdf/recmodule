/* Форматирование чисел и дат для экрана.
 *
 * Правила интерфейса: даты ДД.ММ.ГГГГ, время ЧЧ:ММ, разряды разделены пробелом,
 * минус — типографский «−», а не дефис. Собрано в одном месте, потому что
 * разъехавшееся форматирование одной и той же величины на двух экранах читается
 * как расхождение данных.
 */

const пусто = '—';

export function дата(d: Date | string | null | undefined, сВременем = false): string {
  if (!d) return пусто;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return пусто;
  const п = (n: number) => String(n).padStart(2, '0');
  const день = `${п(x.getDate())}.${п(x.getMonth() + 1)}.${x.getFullYear()}`;
  return сВременем ? `${день} ${п(x.getHours())}:${п(x.getMinutes())}` : день;
}

/** Число с разделением разрядов. Знак ставится только у отрицательных. */
export function число(v: number | null | undefined, знаков = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return пусто;
  return v.toLocaleString('ru-RU', {
    minimumFractionDigits: знаков, maximumFractionDigits: знаков,
  }).replace('-', '−');
}

/** Прирост: знак показывается всегда, включая плюс — иначе не видно направления. */
export function прирост(v: number | null | undefined, знаков = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return пусто;
  const s = число(Math.abs(v), знаков);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

/** Рубли: копейки на экране не нужны — эффект считается сотнями тысяч. */
export function рубли(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return пусто;
  return Math.round(v).toLocaleString('ru-RU').replace('-', '−');
}

/** «1 сутки», «11 суток», «21 сутки»: слово только во множественном числе. */
export function сутки(n: number): string {
  const сотня = Math.abs(n) % 100;
  const один = сотня % 10 === 1 && сотня !== 11;
  return `${n} ${один ? 'сутки' : 'суток'}`;
}
