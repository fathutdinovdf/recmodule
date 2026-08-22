import { describe, it, expect } from 'vitest';
import { dayStart, dailyAverage, dailySeries, oilFromLiquid, liquidMass } from './measurements';

const d = (s: string) => new Date(s);

describe('dayStart', () => {
  it('обнуляет время суток', () => {
    expect(dayStart(d('2026-03-05T14:37:00')).getHours()).toBe(0);
    expect(dayStart(d('2026-03-05T14:37:00')).getMinutes()).toBe(0);
  });
});

describe('dailyAverage', () => {
  it('null, если на начало суток ничего не известно и внутри суток замеров нет', () => {
    const res = dailyAverage([{ at: d('2026-03-06T10:00:00'), value: 10 }], d('2026-03-05'));
    expect(res).toBeNull();
  });

  it('одно значение за все сутки, если замеров внутри нет, но есть предыдущее', () => {
    const res = dailyAverage([{ at: d('2026-03-04T10:00:00'), value: 42 }], d('2026-03-05'));
    expect(res?.value).toBe(42);
    expect(res?.points).toBe(0);
    expect(res?.coverage).toBe(0);
  });

  it('интеграл по времени, а не среднее арифметическое замеров', () => {
    // Один замер 100 держится до 08:00, затем 200 до конца суток — не (100+200)/2.
    const res = dailyAverage([
      { at: d('2026-03-04T00:00:00'), value: 100 },
      { at: d('2026-03-05T08:00:00'), value: 200 },
    ], d('2026-03-05'));
    // 8ч * 100 + 16ч * 200 = 800 + 3200 = 4000 / 24 = 166.67
    expect(res?.value).toBeCloseTo(4000 / 24, 5);
    expect(res?.points).toBe(1);
  });

  it('покрытие считается от первого замера этих суток до конца суток', () => {
    const res = dailyAverage([
      { at: d('2026-03-04T00:00:00'), value: 100 },
      { at: d('2026-03-05T06:00:00'), value: 200 },
    ], d('2026-03-05'));
    expect(res?.coverage).toBeCloseTo(18 / 24, 5);
  });

  it('несколько замеров внутри суток без предыдущего значения — тянет первый замер назад', () => {
    const res = dailyAverage([
      { at: d('2026-03-05T12:00:00'), value: 50 },
    ], d('2026-03-05'));
    expect(res?.value).toBe(50);
    expect(res?.points).toBe(1);
  });
});

describe('dailySeries', () => {
  it('строит ряд по каждым суткам периода включительно', () => {
    const series = dailySeries(
      [{ at: d('2026-03-01T00:00:00'), value: 10 }],
      d('2026-03-01'),
      d('2026-03-03'),
    );
    expect(series).toHaveLength(3);
    expect(series.every((p) => p.value === 10)).toBe(true);
  });
});

describe('oilFromLiquid', () => {
  it('null при отсутствии любого из аргументов', () => {
    expect(oilFromLiquid(null, 50, 850)).toBeNull();
    expect(oilFromLiquid(100, null, 850)).toBeNull();
    expect(oilFromLiquid(100, 50, null)).toBeNull();
  });

  it('нулевая обводнённость и нулевая плотность — законные значения, не null', () => {
    // Плотность 0 — незаполненное поле на стенде трактуется отдельно (не здесь),
    // но сама формула не должна путать 0 с null.
    expect(oilFromLiquid(100, 0, 850)).toBeCloseTo(85, 5);
  });

  it('считает по формуле Qн = Qж × (1 − обводнённость/100) × плотность/1000', () => {
    expect(oilFromLiquid(100, 20, 860)).toBeCloseTo(100 * 0.8 * 0.86, 5);
  });
});

describe('liquidMass', () => {
  it('null, если объём или масса нефти не заданы', () => {
    expect(liquidMass(null, 10, 850, 1010)).toBeNull();
    expect(liquidMass(100, null, 850, 1010)).toBeNull();
  });

  it('null, если плотность не задана (0 или null трактуются одинаково — незаполненное поле)', () => {
    expect(liquidMass(100, 10, 0, 1010)).toBeNull();
    expect(liquidMass(100, 10, 850, 0)).toBeNull();
  });

  it('отрицательный объём воды — законный случай для прироста', () => {
    // Объём нефти больше объёма жидкости целиком — с точки зрения прироста
    // это «нефти прибавилось больше, чем жидкости», вода ушла в минус.
    const oilVolume = (10 * 1000) / 850;
    const result = liquidMass(oilVolume - 1, 10, 850, 1010);
    expect(result).not.toBeNull();
    expect(result as number).toBeLessThan(10);
  });

  it('масса жидкости = масса нефти + масса воды', () => {
    // 100 м³ жидкости, 10 т нефти (объём нефти = 10000/850 ≈ 11.76 м³),
    // вода = 100 - 11.76 = 88.24 м³ × 1010/1000 = 89.12 т, итого ≈ 99.12
    const result = liquidMass(100, 10, 850, 1010);
    const oilVolume = (10 * 1000) / 850;
    const waterVolume = 100 - oilVolume;
    const expected = 10 + (waterVolume * 1010) / 1000;
    expect(result).toBeCloseTo(expected, 5);
  });
});
