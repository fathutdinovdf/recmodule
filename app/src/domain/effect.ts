/* Расчёт экономического эффекта мероприятия.
 *
 * Формула взята из рабочего шаблона Заказчика — «Шаблон оценки эффективности
 * АЛЬМА» от 05.08.2026, лист «Модель оценка добычи»:
 *
 *     выручка       = Qн × цена нефти
 *     НДПИ          = Qн × ставка по паре «месторождение + пласт»
 *     ЭЭ жидкость   = Qж × ставка месторождения
 *     ЭЭ нефть      = Qн × ставка месторождения
 *     деэмульгаторы = Qн × ставка месторождения
 *     эффект        = выручка − НДПИ − ЭЭ жидкость − ЭЭ нефть − деэмульгаторы
 *
 * Здесь всё то же самое, но применяется к ПРИРОСТУ, а не к добыче: мероприятие
 * приносит разницу между фактом и базой, и считать надо её.
 *
 * Три вещи, которые легко сделать неправильно.
 *
 * НДПИ берётся с нефти, а не с жидкости. Налог платится с товарной нефти, вода
 * в базу не входит; в шаблоне это столбец M, умножающий ставку на добычу нефти
 * (столбец J), — не на жидкость.
 *
 * Прежний набор статей — подъём, ППД, транспорт, подготовка, обслуживание
 * ГНО — остался в более ранней модели Заказчика и здесь не воспроизводится.
 * В рабочем шаблоне их нет, а держать в модуле формулу, которой Заказчик не
 * пользуется, значит заранее разойтись с ним в цифрах при сверке.
 *
 * Коэффициента эксплуатации в формуле нет намеренно. Он нужен, когда суточный
 * дебит растягивают на календарный период и надо снять простои. Мы считаем по
 * фактическим суткам: день простоя приходит нулевым приростом сам, и поправка
 * на простой задвоилась бы.
 */

export interface WellEconomy {
  fieldName: string;
  /** Как месторождение названо в модели Заказчика. */
  sourceName: string;
  /** Пласт по объекту разработки, из ВМАП. Справочный. */
  plast: string | null;
  /** Пласт в налоговом смысле — по нему выбрана ставка. */
  taxPlast: string;
  /** Ставка НДПИ+НДД, руб/т нефти. */
  ndpi: number;
  /** руб/т жидкости. */
  eeLiquid: number;
  /** руб/т нефти. */
  eeOil: number;
  /** Деэмульгаторы, руб/т нефти. */
  chem: number;
  /** Цена нефти (МСУ), руб/т. */
  oilPrice: number;
}

export interface EffectBreakdown {
  revenue: number;
  ndpi: number;
  eeLiquid: number;
  eeOil: number;
  chem: number;
  total: number;
}

/** Чего не хватает, чтобы посчитать. Пустой список — можно считать. */
export function missingRates(econ: Partial<WellEconomy> | null): string[] {
  if (!econ) return ['ставки по скважине не заведены'];
  const нет: string[] = [];
  const проверить: [keyof WellEconomy, string][] = [
    ['oilPrice', 'цена нефти'],
    ['ndpi', 'ставка НДПИ'],
    ['eeLiquid', 'электроэнергия на жидкость'],
    ['eeOil', 'электроэнергия на нефть'],
    ['chem', 'деэмульгаторы'],
  ];
  for (const [ключ, имя] of проверить) {
    const v = econ[ключ];
    /* Ноль — законное значение ставки («затрат нет»), а вот null или
       undefined означают, что ставку не завели, и расчёт с ней врал бы молча. */
    if (v === null || v === undefined || !Number.isFinite(v as number)) нет.push(имя);
  }
  return нет;
}

/**
 * Эффект за сутки, руб. На вход — приросты к базе: жидкость м³/сут, нефть т/сут.
 *
 * Возвращает разложение по статьям, а не одно число: спор с Заказчиком идёт
 * по статьям, и в карточке нужно показать, из чего сложилась сумма.
 *
 * Отрицательный прирост — законный случай (мероприятие не дало эффекта или
 * дебит упал), и знак проходит через формулу насквозь.
 */
export function dailyEffect(
  econ: WellEconomy,
  deltaQzh: number,
  deltaQn: number,
): EffectBreakdown {
  const revenue = deltaQn * econ.oilPrice;
  const ndpi = deltaQn * econ.ndpi;
  const eeLiquid = deltaQzh * econ.eeLiquid;
  const eeOil = deltaQn * econ.eeOil;
  const chem = deltaQn * econ.chem;
  return {
    revenue,
    ndpi,
    eeLiquid,
    eeOil,
    chem,
    total: revenue - ndpi - eeLiquid - eeOil - chem,
  };
}

/** Сумма разложений — для накопленного итога по окну. */
export function sumBreakdowns(items: EffectBreakdown[]): EffectBreakdown {
  return items.reduce<EffectBreakdown>((acc, b) => ({
    revenue: acc.revenue + b.revenue,
    ndpi: acc.ndpi + b.ndpi,
    eeLiquid: acc.eeLiquid + b.eeLiquid,
    eeOil: acc.eeOil + b.eeOil,
    chem: acc.chem + b.chem,
    total: acc.total + b.total,
  }), { revenue: 0, ndpi: 0, eeLiquid: 0, eeOil: 0, chem: 0, total: 0 });
}
