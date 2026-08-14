/* Рабочее окно и норматив ответа.
 *
 * Срок считается рабочими часами: иначе норматив в 4 часа по рекомендации,
 * переданной в 22:00, истекал бы в два часа ночи. Окно — пн–пт 09:00–00:00
 * по времени Когалыма; пояс договором назван прямо, поэтому не настраивается.
 */

export const WORK_FROM = 9;
export const WORK_TO = 24;

const рабочийДень = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5;

/** Ближайший момент внутри рабочего окна, не раньше заданного. */
export function toWindow(t: Date): Date {
  const d = new Date(t);
  for (;;) {
    if (!рабочийДень(d)) {
      d.setDate(d.getDate() + 1);
      d.setHours(WORK_FROM, 0, 0, 0);
      continue;
    }
    if (d.getHours() < WORK_FROM) { d.setHours(WORK_FROM, 0, 0, 0); return d; }
    if (d.getHours() >= WORK_TO) {
      d.setDate(d.getDate() + 1);
      d.setHours(WORK_FROM, 0, 0, 0);
      continue;
    }
    return d;
  }
}

/** Сколько рабочих часов между двумя моментами. */
export function workHoursBetween(a: Date, b: Date): number {
  if (b <= a) return 0;
  let cur = toWindow(a);
  let acc = 0;
  while (cur < b) {
    const конецДня = new Date(cur);
    конецДня.setHours(WORK_TO, 0, 0, 0);
    const stop = b < конецДня ? b : конецДня;
    acc += (stop.getTime() - cur.getTime()) / 3_600_000;
    if (b <= конецДня) break;
    cur = toWindow(конецДня);
  }
  return acc;
}

/**
 * Момент, наступающий через заданное число РАБОЧИХ часов после `from`.
 *
 * Обратная к `workHoursBetween`: ею считается срок ответа при передаче
 * рекомендации Заказчику. Отсчёт начинается с ближайшего рабочего момента —
 * переданная в пятницу вечером рекомендация тратит норматив с утра
 * понедельника, а не всю субботу.
 */
export function addWorkHours(from: Date, hours: number): Date {
  let cur = toWindow(from);
  let осталось = hours;

  while (осталось > 0) {
    const конецДня = new Date(cur);
    конецДня.setHours(WORK_TO, 0, 0, 0);
    const вДне = (конецДня.getTime() - cur.getTime()) / 3_600_000;

    if (осталось <= вДне) {
      cur = new Date(cur.getTime() + осталось * 3_600_000);
      break;
    }
    осталось -= вДне;
    cur = toWindow(конецДня);
  }
  return cur;
}

export type ControlKind = 'none' | 'pending' | 'ok' | 'late' | 'overdue' | 'waiting';

export interface Control {
  kind: ControlKind;
  /** Часы: сколько осталось, просрочено или на сколько ответили раньше срока. */
  hours: number;
}

/**
 * Состояние норматива ответа.
 *
 * У черновика и отменённой норматив не действует: первый ещё не выпущен,
 * вторая снята до передачи. Без этой ветки отменённая попадала бы в
 * «просрочено» и красила строку красной кромкой, хотя просрочивать нечего.
 */
export function control(rec: {
  status: string;
  sentAt: Date | null;
  dueAt: Date | null;
  repliedAt: Date | null;
}, now: Date = new Date()): Control {
  if (rec.status === 'draft' || rec.status === 'cancelled') return { kind: 'none', hours: 0 };
  if (rec.status === 'registered') {
    return { kind: 'pending', hours: 0 };
  }
  if (!rec.dueAt) return { kind: 'none', hours: 0 };

  if (rec.repliedAt) {
    const вСрок = rec.repliedAt <= rec.dueAt;
    return {
      kind: вСрок ? 'ok' : 'late',
      hours: workHoursBetween(rec.dueAt, rec.repliedAt),
    };
  }
  if (now > rec.dueAt) return { kind: 'overdue', hours: workHoursBetween(rec.dueAt, now) };
  return { kind: 'waiting', hours: workHoursBetween(now, rec.dueAt) };
}

/** Длительность словами: «9 ч 20 мин», «2 д 2 ч». */
export function fmtDur(hours: number): string {
  const всего = Math.round(hours * 60);
  const д = Math.floor(всего / (60 * 24));
  const ч = Math.floor((всего - д * 60 * 24) / 60);
  const м = всего % 60;
  if (д > 0) return `${д} д${ч ? ` ${ч} ч` : ''}`;
  if (ч > 0) return `${ч} ч${м ? ` ${м} мин` : ''}`;
  return `${м} мин`;
}
