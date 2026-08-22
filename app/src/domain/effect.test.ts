import { describe, it, expect } from 'vitest';
import { missingRates, dailyEffect, forecastTotal, sumBreakdowns, type WellEconomy } from './effect';

const econ: WellEconomy = {
  fieldName: 'Тестовое',
  sourceName: 'Тестовое (модель)',
  plast: 'БС10',
  taxPlast: 'БС10',
  ndpi: 1000,
  eeLiquid: 50,
  eeOil: 200,
  chem: 30,
  oilPrice: 20000,
};

describe('missingRates', () => {
  it('null-экономика — не считать', () => {
    expect(missingRates(null)).toEqual(['ставки по скважине не заведены']);
  });

  it('ноль — законное значение ставки, не считается отсутствующим', () => {
    expect(missingRates({ ...econ, chem: 0 })).toEqual([]);
  });

  it('null или undefined — ставка не заведена, отдельно от нуля', () => {
    expect(missingRates({ ...econ, ndpi: null as unknown as number })).toEqual(['ставка НДПИ']);
    expect(missingRates({ ...econ, oilPrice: undefined })).toEqual(['цена нефти']);
  });

  it('NaN считается отсутствующей ставкой', () => {
    expect(missingRates({ ...econ, eeOil: NaN })).toEqual(['электроэнергия на нефть']);
  });
});

describe('dailyEffect', () => {
  it('считает разложение по статьям, НДПИ и деэмульгаторы — с нефти, не с жидкости', () => {
    const b = dailyEffect(econ, 10, 5);
    expect(b.revenue).toBe(5 * 20000);
    expect(b.ndpi).toBe(5 * 1000);
    expect(b.eeLiquid).toBe(10 * 50);
    expect(b.eeOil).toBe(5 * 200);
    expect(b.chem).toBe(5 * 30);
    expect(b.total).toBe(b.revenue - b.ndpi - b.eeLiquid - b.eeOil - b.chem);
  });

  it('отрицательный прирост — законный случай, знак проходит насквозь', () => {
    const b = dailyEffect(econ, -10, -5);
    expect(b.revenue).toBeLessThan(0);
    expect(b.total).toBeLessThan(0);
  });

  it('нулевой прирост даёт нулевое разложение', () => {
    const b = dailyEffect(econ, 0, 0);
    expect(b.total).toBe(0);
  });
});

describe('forecastTotal', () => {
  it('null без экономики', () => {
    expect(forecastTotal(null, 10, 5, 850, 1010, 90)).toBeNull();
  });

  it('null при незаполненных ставках', () => {
    expect(forecastTotal({ ...econ, chem: null as unknown as number }, 10, 5, 850, 1010, 90)).toBeNull();
  });

  it('null без ожидаемых приростов', () => {
    expect(forecastTotal(econ, null, 5, 850, 1010, 90)).toBeNull();
    expect(forecastTotal(econ, 10, null, 850, 1010, 90)).toBeNull();
  });

  it('null без плотностей — массу жидкости не посчитать', () => {
    expect(forecastTotal(econ, 10, 5, null, 1010, 90)).toBeNull();
  });

  it('умножает суточный эффект на длину окна', () => {
    const total90 = forecastTotal(econ, 10, 5, 850, 1010, 90);
    const total1 = forecastTotal(econ, 10, 5, 850, 1010, 1);
    expect(total90).not.toBeNull();
    expect(total90 as number).toBeCloseTo((total1 as number) * 90, 5);
  });
});

describe('sumBreakdowns', () => {
  it('пустой список — все нули', () => {
    const s = sumBreakdowns([]);
    expect(s).toEqual({ revenue: 0, ndpi: 0, eeLiquid: 0, eeOil: 0, chem: 0, total: 0 });
  });

  it('суммирует статьи поэлементно', () => {
    const a = dailyEffect(econ, 10, 5);
    const b = dailyEffect(econ, 20, 10);
    const s = sumBreakdowns([a, b]);
    expect(s.total).toBeCloseTo(a.total + b.total, 5);
    expect(s.revenue).toBeCloseTo(a.revenue + b.revenue, 5);
  });
});
