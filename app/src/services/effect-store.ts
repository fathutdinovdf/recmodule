/* Кэш посуточного расчёта эффекта в rec.effect_daily.
 *
 * Зачем вообще кэш. Расчёт окна — это два запроса к чужому контуру на девяносто
 * суток замеров плюс интегрирование ряда; делать это при каждом открытии
 * вкладки расточительно. Но главное не скорость: расчёт должен быть
 * ВОСПРОИЗВОДИМ. В споре с Заказчиком нужно показать, из чего сложилась цифра
 * в акте, а не пересчитать её заново по сегодняшним данным — замеры приходят
 * задним числом, и «та же» рекомендация через месяц дала бы другой итог.
 *
 * Отсюда правило пересчёта:
 *
 *   окно открыто  — считаем заново при каждом открытии и переписываем кэш;
 *                   замеры за прошедшие сутки ещё догружаются и меняют их;
 *   окно закрыто  — отдаём кэш как есть и не трогаем ВМАП вовсе. Закрытие окна
 *                   фиксирует цифру. Если кэша нет (окно закрылось до того, как
 *                   модуль научился считать), считаем один раз и сохраняем.
 */

import { modulePool, query } from '@/db/pool';
import { getWellEconomy } from '@/db/economy';
import { dayStart } from '@/domain/measurements';
import { missingRates, sumBreakdowns, type EffectBreakdown, type WellEconomy } from '@/domain/effect';
import { calculateEffect, type EffectDay } from './effect-window';
import type { Card } from '@/db/card';

export interface EffectView {
  days: EffectDay[];
  total: EffectBreakdown;
  daysTotal: number;
  daysWithData: number;
  /** Суток, целиком собранных из протянутых значений: замеров в них не было. */
  daysCarried: number;
  problems: string[];
  economy: WellEconomy | null;
  oilDensity: number | null;
  waterDensity: number | null;
  /** Границы посчитанного отрезка окна и его полная длина. */
  windowFrom: Date;
  windowTo: Date;
  windowDays: number;
  elapsedDays: number;
  /** Итог окончательный: окно закрыто и незакрытых споров нет. */
  isFinal: boolean;
  calculatedAt: Date;
  fromCache: boolean;
}

/** Полная длина окна подтверждения эффекта, суток. Раздел 7 договора. */
export const WINDOW_DAYS = 90;

const день = (d: Date) => dayStart(new Date(d));
const суток = (a: Date, b: Date) => Math.round((день(b).getTime() - день(a).getTime()) / 86400000);

/**
 * Расчёт по карточке: из кэша или свежий. Возвращает null, если окна ещё нет —
 * до фиксации реализации считать нечего, и это не ошибка.
 */
export async function getEffect(card: Card): Promise<EffectView | null> {
  const impl = card.implementation;
  if (!impl || card.wellId === null || card.fieldId === null) return null;

  const открыто = день(impl.windowOpenAt);
  const плановоеЗакрытие = день(impl.windowCloseAt);
  const сегодня = день(new Date());

  /* Досрочное закрытие обрезает окно по дате закрытия: сутки после него в
     эффект не входят, иначе досрочное закрытие ничего не закрывало бы. */
  const закрытие = impl.closedAt ? день(impl.closedAt) : null;
  const конец = закрытие ?? (сегодня < плановоеЗакрытие ? сегодня : плановоеЗакрытие);

  const спорОткрыт = card.disputes.some((d) => d.state === 'open');
  const окноЗакрыто = impl.closedAt !== null || сегодня >= плановоеЗакрытие;

  const econ = await getWellEconomy(card.fieldId, card.wellNumber);

  const кэш = окноЗакрыто ? await readCache(card.id) : null;
  if (кэш && кэш.days.length) {
    /* Плотности в кэше не хранятся: они нужны были, чтобы получить нефть из
       жидкости и массу из объёма, и это уже сделано в сохранённых сутках. */
    return собрать(кэш.days, кэш.calculatedAt, true, null, null, []);
  }

  const расчёт = await calculateEffect({
    wellId: card.wellId,
    fieldId: card.fieldId,
    wellNumber: card.wellNumber,
    windowFrom: открыто,
    windowTo: конец,
    baseline: {
      baseQzh: card.baseline?.baseQzh ?? null,
      baseQn: card.baseline?.baseQn ?? null,
      baseEe: card.baseline?.baseEe ?? null,
    },
  });

  const сейчас = new Date();
  await writeCache(card.id, card.baseline?.id ?? null, расчёт.days, сейчас);

  /* Плотности берутся из ВМАП мимо замеров и остаются единственной причиной,
     по которой расчёт может встать при живых ставках и живых замерах. */
  const плотности = расчёт.problems.filter((p) => p.startsWith('Нет плотности'));

  return собрать(расчёт.days, сейчас, false, расчёт.oilDensity, расчёт.waterDensity, плотности);

  function собрать(
    days: EffectDay[],
    calculatedAt: Date,
    fromCache: boolean,
    oilDensity: number | null,
    waterDensity: number | null,
    ещёПроблемы: string[],
  ): EffectView {
    const деньги = days.map((d) => d.money).filter((m): m is EffectBreakdown => m !== null);
    const проблемы: string[] = [];
    const нехватка = missingRates(econ);
    if (нехватка.length) проблемы.push(`Ставки не заведены: ${нехватка.join(', ')}`);
    if (card.baseline === null) проблемы.push('Базовые значения не заданы');
    else if (card.baseline.baseQzh === null || card.baseline.baseQn === null) {
      проблемы.push('В базе заполнены не все показатели');
    }
    if (!days.some((d) => d.factQzh !== null)) проблемы.push('За окно нет ни одного замера дебита');
    проблемы.push(...ещёПроблемы);

    return {
      days,
      total: sumBreakdowns(деньги),
      daysTotal: days.length,
      daysWithData: days.filter((d) => d.factQzh !== null).length,
      daysCarried: days.filter((d) => d.factQzh !== null && d.points === 0).length,
      problems: проблемы,
      economy: econ,
      oilDensity,
      waterDensity,
      windowFrom: открыто,
      windowTo: конец,
      windowDays: WINDOW_DAYS,
      /* Сутки открытия считаются прошедшими: окно открылось в этот день, и
         первые сутки эффекта — они и есть. */
      elapsedDays: Math.max(0, Math.min(WINDOW_DAYS, суток(открыто, конец) + 1)),
      isFinal: окноЗакрыто && !спорОткрыт,
      calculatedAt,
      fromCache,
    };
  }
}

async function readCache(recId: number): Promise<{ days: EffectDay[]; calculatedAt: Date } | null> {
  const rows = await query<Record<string, unknown>>(`
    SELECT day, fact_qzh, fact_qzh_t, fact_qn, delta_qzh, delta_qzh_t, delta_qn,
           points, coverage,
           revenue, ndpi, cost_ee_liquid, cost_ee_oil, cost_chem, total, calculated_at
    FROM rec.effect_daily WHERE rec_id = $1 ORDER BY day
  `, [recId]);
  if (!rows.length) return null;

  const ч = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

  return {
    calculatedAt: rows[0].calculated_at as Date,
    days: rows.map((r) => ({
      date: день(r.day as Date),
      factQzh: ч(r.fact_qzh),
      factQzhT: ч(r.fact_qzh_t),
      factQn: ч(r.fact_qn),
      deltaQzh: ч(r.delta_qzh),
      deltaQzhT: ч(r.delta_qzh_t),
      deltaQn: ч(r.delta_qn),
      points: Number(r.points),
      coverage: Number(r.coverage),
      money: r.total === null ? null : {
        revenue: Number(r.revenue),
        ndpi: Number(r.ndpi),
        eeLiquid: Number(r.cost_ee_liquid),
        eeOil: Number(r.cost_ee_oil),
        chem: Number(r.cost_chem),
        total: Number(r.total),
      },
    })),
  };
}

const ПОЛЯ_КЭША = [
  'rec_id', 'day', 'fact_qzh', 'fact_qzh_t', 'fact_qn',
  'delta_qzh', 'delta_qzh_t', 'delta_qn', 'points', 'coverage',
  'revenue', 'ndpi', 'cost_ee_liquid', 'cost_ee_oil', 'cost_chem', 'total',
  'baseline_id', 'calculated_at',
];

/* Перезапись целиком, а не по суткам: окно могло сдвинуться (спор о дате
   реализации принят) или укоротиться досрочным закрытием, и старые сутки
   остались бы в таблице как призраки, попав потом в Форму 5.
 *
 * Две защиты от одновременных пересчётов одной рекомендации — а они бывают
 * буквально всегда: браузер предзагружает страницу и тут же открывает её,
 * получается два рендера в один момент.
 *
 * Консультативная блокировка по rec_id выстраивает пересчёты в очередь: без
 * неё оба соединения удаляли свои строки (в READ COMMITTED удаление чужой
 * незакоммиченной строки просто не видно), а потом оба вставляли — и второй
 * падал на уникальном ключе (rec_id, day).
 *
 * ON CONFLICT нужен на случай, когда блокировка не спасёт: пересчёт из другого
 * процесса, например из скрипта. Тогда сутки просто перезапишутся последним. */
async function writeCache(
  recId: number,
  baselineId: number | null,
  days: EffectDay[],
  at: Date,
): Promise<void> {
  const client = await modulePool.connect();
  try {
    await client.query('BEGIN');
    /* Блокировка транзакционная: снимется коммитом или откатом сама, даже если
       запрос упадёт посередине. */
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [ЗАМОК_ЭФФЕКТА, recId]);
    await client.query('DELETE FROM rec.effect_daily WHERE rec_id = $1', [recId]);

    if (days.length) {
      const параметры: unknown[] = [];
      const строки = days.map((d) => {
        const i = параметры.length;
        параметры.push(recId, d.date, d.factQzh, d.factQzhT, d.factQn,
          d.deltaQzh, d.deltaQzhT, d.deltaQn, d.points, d.coverage,
          d.money?.revenue ?? null, d.money?.ndpi ?? null, d.money?.eeLiquid ?? null,
          d.money?.eeOil ?? null, d.money?.chem ?? null, d.money?.total ?? null,
          baselineId, at);
        return `(${ПОЛЯ_КЭША.map((_, k) => `$${i + k + 1}`).join(',')})`;
      });
      await client.query(`
        INSERT INTO rec.effect_daily (${ПОЛЯ_КЭША.join(', ')})
        VALUES ${строки.join(',')}
        ON CONFLICT (rec_id, day) DO UPDATE SET
          ${ПОЛЯ_КЭША.slice(2).map((f) => `${f} = EXCLUDED.${f}`).join(', ')}
      `, параметры);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* Первое слово ключа консультативной блокировки: pg_advisory_lock работает на
   общем для базы пространстве, и разные подсистемы обязаны различаться первым
   числом, иначе они блокируют друг друга без всякой связи по смыслу. */
const ЗАМОК_ЭФФЕКТА = 1;
