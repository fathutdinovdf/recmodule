/* Промпт для ИИ-резюме расчёта эффекта (вкладка «Расчёт эффекта»).
 *
 * Строится из уже посчитанных данных (см. eff/page.tsx: eff, forecastTotal) —
 * ИИ не смотрит ни в ВМАП, ни в базу сам, только облекает готовый расчёт в
 * связный текст. Домен без Next и без БД: вход — примитивы, выход — строка.
 *
 * Посуточный ряд не отдаётся модели построчно: 90 строк на скважину — это
 * шум, в котором тренд теряется, а токены расходуются на даты, а не на
 * содержание. Вместо этого ряд собирается в 8–9 блоков по несколько суток —
 * ровно тот масштаб, которым читает график «Факт против базы» на этой же
 * вкладке человек: не суточный дребезг, а форма линии.
 */

export interface DailyPoint {
  date: Date;
  factQzh: number | null;
  factQn: number | null;
  /** Доля суток, покрытая собственными замерами (0 — протянуто целиком). */
  coverage: number;
  /** Замеров за сутки. 0 при протяжке — так же, как в eff.days на странице. */
  points: number;
}

export interface EffectSummaryInput {
  wellLabel: string;
  problem: string;
  action: string;
  isFinal: boolean;
  windowDays: number;
  elapsedDays: number;
  totalEffect: number;
  forecastEffect: number | null;
  baseQzh: number | null;
  baseQn: number | null;
  days: DailyPoint[];
  openDisputeBaseline: boolean;
  openDisputeDate: boolean;
  /** Причины, по которым часть суток не легла в деньги (eff.problems). */
  problems: string[];
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

/** Сколько суток на блок, чтобы окно любой длины (7–90 суток) укладывалось
 *  в 8–9 блоков — это масштаб, на котором виден тренд, а не отдельная точка. */
function bucketSize(total: number): number {
  return Math.max(1, Math.ceil(total / 9));
}

interface Bucket {
  from: Date;
  to: Date;
  avgQzh: number | null;
  avgQn: number | null;
  avgCoverage: number;
  daysWithData: number;
  daysTotal: number;
}

function toBuckets(days: DailyPoint[]): Bucket[] {
  const size = bucketSize(days.length);
  const buckets: Bucket[] = [];
  for (let i = 0; i < days.length; i += size) {
    const slice = days.slice(i, i + size);
    const withData = slice.filter((d) => d.factQzh !== null);
    buckets.push({
      from: slice[0].date,
      to: slice[slice.length - 1].date,
      avgQzh: withData.length ? withData.reduce((s, d) => s + (d.factQzh ?? 0), 0) / withData.length : null,
      avgQn: withData.length ? withData.reduce((s, d) => s + (d.factQn ?? 0), 0) / withData.length : null,
      avgCoverage: slice.reduce((s, d) => s + d.coverage, 0) / slice.length,
      daysWithData: withData.length,
      daysTotal: slice.length,
    });
  }
  return buckets;
}

/** Динамика факта против базы — сжатая построчно в блоки, чтобы модель видела
 *  форму линии (рост/спад/полка/разрыв), а не путалась в 90 отдельных суток. */
function describeDynamics(days: DailyPoint[], baseQzh: number | null, baseQn: number | null): string {
  if (days.length === 0) return 'Суточных данных нет вовсе.';
  const baseLine = `База, от которой считается прирост: жидкость ${baseQzh ?? '—'} м³/сут, нефть ${baseQn ?? '—'} т/сут.`;
  const lines = toBuckets(days).map((b) => {
    const период = b.from.getTime() === b.to.getTime() ? fmtDate(b.from) : `${fmtDate(b.from)}–${fmtDate(b.to)}`;
    if (b.daysWithData === 0) return `${период}: данных нет (разрыв, протяжка невозможна)`;
    const qzh = b.avgQzh !== null ? `${b.avgQzh.toFixed(1)} м³/сут` : '—';
    const qn = b.avgQn !== null ? `${b.avgQn.toFixed(1)} т/сут` : '—';
    return `${период}: жидкость ${qzh}, нефть ${qn}, опора на собственные замеры ${Math.round(b.avgCoverage * 100)}%`;
  });
  return [baseLine, ...lines].join('\n');
}

/** Насколько заполнены суточные данные: своё / протянутое / совсем пусто,
 *  и самый длинный сплошной разрыв — по нему видно, можно ли доверять итогу. */
function describeQuality(days: DailyPoint[]): string {
  if (days.length === 0) return 'Суточных данных нет вовсе.';
  const total = days.length;
  const withData = days.filter((d) => d.factQzh !== null).length;
  const ownData = days.filter((d) => d.points > 0).length;
  const carried = withData - ownData;
  const noData = total - withData;
  let longestGap = 0;
  let run = 0;
  for (const d of days) {
    run = d.factQzh === null ? run + 1 : 0;
    longestGap = Math.max(longestGap, run);
  }
  const avgCoverage = days.reduce((s, d) => s + d.coverage, 0) / total;
  return `Суток в окне на сегодня: ${total}. Со своими замерами: ${ownData}. `
    + `Протянуто от последнего известного значения: ${carried}. Совсем без данных: ${noData}`
    + `${longestGap > 1 ? ` (самый длинный сплошной разрыв — ${longestGap} суток подряд)` : ''}. `
    + `Средняя опора на собственные замеры: ${Math.round(avgCoverage * 100)}%.`;
}

export function buildEffectSummaryPrompt(i: EffectSummaryInput): string {
  const исполнение = i.forecastEffect && i.forecastEffect > 0
    ? `${Math.round((i.totalEffect / i.forecastEffect) * 100)} % прогноза`
    : 'прогноз не задан или неположителен, сравнить не с чем';

  const споры = [
    i.openDisputeBaseline && 'открыт спор о базовых значениях',
    i.openDisputeDate && 'открыт спор о дате реализации',
  ].filter(Boolean).join(', ');

  return `Ты помогаешь эксперту по механизированному фонду скважин кратко и нейтрально пересказать расчёт экономического эффекта по рекомендации — для карточки в системе сопровождения, не для публикации Заказчику напрямую.

Скважина: ${i.wellLabel}
Проблема: ${i.problem}
Рекомендуемое мероприятие: ${i.action}

Статус окна: ${i.isFinal ? 'окончательный (окно закрыто)' : 'предварительный (окно ещё идёт)'}
Прошло суток: ${i.elapsedDays} из ${i.windowDays}
Прогнозный эффект: ${i.forecastEffect !== null ? `${Math.round(i.forecastEffect).toLocaleString('ru-RU')} руб` : 'не рассчитан'}
Накопленный факт: ${Math.round(i.totalEffect).toLocaleString('ru-RU')} руб
Выполнение прогноза: ${исполнение}
${споры ? `Открытые споры: ${споры}.` : ''}
${i.problems.length ? `Замечания к расчёту: ${i.problems.join('; ')}.` : ''}

Динамика факта по суткам, блоками (жидкость и нефть — суточные дебиты):
${describeDynamics(i.days, i.baseQzh, i.baseQn)}

Качество суточных данных:
${describeQuality(i.days)}

Сформируй короткий ответ — не больше 3 предложений на русском языке: что обещали и что получилось по факту с учётом динамики по блокам выше (рост, спад, полка, скачки); насколько выводу можно доверять с учётом качества данных; если есть открытый спор — что именно он ограничивает. Только на основе приведённых цифр, без домыслов и без оценки, стоило ли внедрять мероприятие. Не используй Markdown-разметку — обычный текст.`;
}
