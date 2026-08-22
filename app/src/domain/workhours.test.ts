import { describe, it, expect } from 'vitest';
import { toWindow, workHoursBetween, addWorkHours, control, fmtDur } from './workhours';

const d = (s: string) => new Date(s);
// 2026-03-02 пн, 2026-03-06 пт, 07/08 выходные, 2026-03-09 пн.

describe('toWindow', () => {
  it('момент внутри окна не двигает', () => {
    const t = d('2026-03-02T12:00:00');
    expect(toWindow(t).getTime()).toBe(t.getTime());
  });

  it('до открытия окна — двигает на начало окна тех же суток', () => {
    const res = toWindow(d('2026-03-02T06:00:00'));
    expect(res.getDate()).toBe(2);
    expect(res.getHours()).toBe(9);
  });

  it('окно открыто до полуночи — поздний вечер не двигает', () => {
    const t = d('2026-03-02T23:30:00');
    expect(toWindow(t).getTime()).toBe(t.getTime());
  });

  it('выходные целиком пропускаются', () => {
    const res = toWindow(d('2026-03-07T10:00:00'));
    expect(res.getDate()).toBe(9);
  });
});

describe('workHoursBetween', () => {
  it('ноль, если конец не позже начала', () => {
    const t = d('2026-03-02T12:00:00');
    expect(workHoursBetween(t, t)).toBe(0);
    expect(workHoursBetween(t, d('2026-03-02T10:00:00'))).toBe(0);
  });

  it('внутри одного рабочего дня — простая разница', () => {
    expect(workHoursBetween(d('2026-03-02T10:00:00'), d('2026-03-02T14:00:00'))).toBe(4);
  });

  it('через выходные считает только рабочие часы', () => {
    // Пятница 20:00 (в окне) до понедельника 10:00: пт 20:00-00:00 = 4ч, пн 09:00-10:00 = 1ч.
    const hours = workHoursBetween(d('2026-03-06T20:00:00'), d('2026-03-09T10:00:00'));
    expect(hours).toBeCloseTo(5, 5);
  });
});

describe('addWorkHours', () => {
  it('обратная к workHoursBetween внутри одного дня', () => {
    const from = d('2026-03-02T10:00:00');
    const to = addWorkHours(from, 4);
    expect(to.getHours()).toBe(14);
  });

  it('часы, выходящие за конец дня, переносятся на следующий рабочий день', () => {
    const from = d('2026-03-06T22:00:00'); // пятница
    const to = addWorkHours(from, 5); // 2ч до конца пятницы + 3ч понедельника
    expect(to.getDate()).toBe(9);
    expect(to.getHours()).toBe(12);
  });

  it('старт до открытия окна отсчитывается с открытия', () => {
    const to = addWorkHours(d('2026-03-02T06:00:00'), 2);
    expect(to.getHours()).toBe(11);
  });
});

describe('control', () => {
  const base = { status: 'sent', sentAt: d('2026-03-02T10:00:00'), dueAt: d('2026-03-02T14:00:00'), repliedAt: null as Date | null };

  it('черновик — норматив не действует', () => {
    expect(control({ ...base, status: 'draft' }).kind).toBe('none');
  });

  it('отменённая — норматив не действует', () => {
    expect(control({ ...base, status: 'cancelled' }).kind).toBe('none');
  });

  it('registered — норматив ещё не начался', () => {
    expect(control({ ...base, status: 'registered', dueAt: null }).kind).toBe('pending');
  });

  it('нет dueAt — норматив не определён', () => {
    expect(control({ ...base, dueAt: null }).kind).toBe('none');
  });

  it('ответили в срок', () => {
    const res = control({ ...base, repliedAt: d('2026-03-02T13:00:00') });
    expect(res.kind).toBe('ok');
  });

  it('ответили с опозданием', () => {
    const res = control({ ...base, repliedAt: d('2026-03-02T15:00:00') });
    expect(res.kind).toBe('late');
  });

  it('не ответили и срок прошёл — просрочено', () => {
    const res = control(base, d('2026-03-02T16:00:00'));
    expect(res.kind).toBe('overdue');
  });

  it('не ответили, срок ещё не наступил — ожидание', () => {
    const res = control(base, d('2026-03-02T12:00:00'));
    expect(res.kind).toBe('waiting');
  });
});

describe('fmtDur', () => {
  it('минуты', () => expect(fmtDur(0.5)).toBe('30 мин'));
  it('часы и минуты', () => expect(fmtDur(2 + 20 / 60)).toBe('2 ч 20 мин'));
  it('ровные часы без минут', () => expect(fmtDur(3)).toBe('3 ч'));
  it('дни и часы', () => expect(fmtDur(24 + 2)).toBe('1 д 2 ч'));
  it('ровные дни без часов', () => expect(fmtDur(48)).toBe('2 д'));
});
