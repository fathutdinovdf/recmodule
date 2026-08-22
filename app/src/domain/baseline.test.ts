import { describe, it, expect } from 'vitest';
import { baselineFromSeries } from './baseline';
import type { DailyPoint } from './measurements';

const d = (s: string) => new Date(s);
const point = (date: string, value: number | null, points = 1): DailyPoint => ({
  date: d(date), value, coverage: value === null ? 0 : 1, points,
});

describe('baselineFromSeries', () => {
  it('день без данных о дебите исключается с причиной "нет данных о дебите"', () => {
    const res = baselineFromSeries({
      qzh: [point('2026-03-01', null, 0)],
      watercut: [point('2026-03-01', 50)],
      oilDensity: 850,
      waterDensity: 1010,
    });
    expect(res.days[0].used).toBe(false);
    expect(res.days[0].reason).toBe('нет данных о дебите');
  });

  it('протянутое значение (points=0) исключается, даже если value не null', () => {
    const res = baselineFromSeries({
      qzh: [point('2026-03-01', 30, 0)],
      watercut: [point('2026-03-01', 50)],
      oilDensity: 850,
      waterDensity: 1010,
    });
    expect(res.days[0].used).toBe(false);
    expect(res.days[0].reason).toBe('нет собственного замера, значение протянуто');
  });

  it('нулевой дебит — скважина не работала, тоже исключается', () => {
    const res = baselineFromSeries({
      qzh: [point('2026-03-01', 0, 2)],
      watercut: [point('2026-03-01', 50)],
      oilDensity: 850,
      waterDensity: 1010,
    });
    expect(res.days[0].used).toBe(false);
    expect(res.days[0].reason).toBe('нулевой дебит — скважина не работала');
  });

  it('без обводнённости нефть не посчитать — день исключается', () => {
    const res = baselineFromSeries({
      qzh: [point('2026-03-01', 30, 2)],
      watercut: [],
      oilDensity: 850,
      waterDensity: 1010,
    });
    expect(res.days[0].used).toBe(false);
    expect(res.days[0].reason).toBe('нет обводнённости, нефть не посчитать');
  });

  it('обводнённость может быть протянутой — это не мешает отбору суток', () => {
    // points у watercut не участвует в отборе, только у qzh.
    const res = baselineFromSeries({
      qzh: [point('2026-03-01', 30, 2)],
      watercut: [{ date: d('2026-03-01'), value: 50, coverage: 0, points: 0 }],
      oilDensity: 850,
      waterDensity: 1010,
    });
    expect(res.days[0].used).toBe(true);
  });

  it('среднее считается только по отобранным суткам, не протяжкой по всем', () => {
    const res = baselineFromSeries({
      qzh: [
        point('2026-03-01', 30, 2),
        point('2026-03-02', 0, 1), // исключён
        point('2026-03-03', 50, 3),
      ],
      watercut: [
        point('2026-03-01', 50),
        point('2026-03-02', 50),
        point('2026-03-03', 50),
      ],
      oilDensity: 850,
      waterDensity: 1010,
    });
    expect(res.usedDays).toBe(2);
    expect(res.baseQzh).toBeCloseTo((30 + 50) / 2, 5);
  });

  it('нет отобранных суток — база null, а не ноль', () => {
    const res = baselineFromSeries({
      qzh: [point('2026-03-01', 0, 1)],
      watercut: [point('2026-03-01', 50)],
      oilDensity: 850,
      waterDensity: 1010,
    });
    expect(res.baseQzh).toBeNull();
    expect(res.baseQn).toBeNull();
    expect(res.baseQzhT).toBeNull();
  });
});
