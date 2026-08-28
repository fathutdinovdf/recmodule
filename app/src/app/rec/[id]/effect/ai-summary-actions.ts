'use server';

/* ИИ-резюме расчёта эффекта: кнопка в поповере на вкладке «Расчёт эффекта».
 *
 * Проба, не постоянная функция — поэтому без таблицы и без upsert, как это
 * сделано для управленческого резюме в CycleOp Grade (assessment.aiSummary):
 * результат не персистится, каждый клик считает заново. Понадобится
 * кэширование — добавлять таблицу и признак устаревания уже под конкретную
 * частоту использования, а не заранее.
 *
 * Тот же шлюз, что в Grade: provod.ai ждёт "Authorization: Bearer", а не
 * нативный заголовок Anthropic "x-api-key" — с ним отвечает 401.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getCard } from '@/db/card';
import { getEffect, WINDOW_DAYS } from '@/services/effect-store';
import { forecastTotal } from '@/domain/effect';
import { getWell } from '@/db/wells-data';
import { buildEffectSummaryPrompt } from '@/domain/effectSummaryPrompt';

const AI_MODEL = 'anthropic/claude-sonnet-4.6';

function getClient() {
  return new Anthropic({
    authToken: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });
}

export type EffectSummaryState = { error?: string; text?: string } | undefined;

export async function generateEffectSummary(
  _prev: EffectSummaryState,
  formData: FormData,
): Promise<EffectSummaryState> {
  const cardId = Number(formData.get('cardId'));
  if (!cardId) return { error: 'Не указана рекомендация' };

  const card = await getCard(cardId);
  if (!card) return { error: 'Рекомендация не найдена' };

  const [eff, скважина] = await Promise.all([
    getEffect(card),
    card.wellId === null ? null : getWell(card.wellId).catch(() => null),
  ]);
  if (!eff || !eff.economy) return { error: 'Эффект в деньгах ещё не посчитан — резюмировать нечего' };

  const прогноз = forecastTotal(eff.economy, card.expectQzh, card.expectQn,
    скважина?.oilDensity ?? null, скважина?.waterDensity ?? null, WINDOW_DAYS);

  const prompt = buildEffectSummaryPrompt({
    wellLabel: `скв. ${card.wellNumber}${card.kust ? `, куст ${card.kust}` : ''}, ${card.fieldName}`,
    problem: card.problem,
    action: card.action,
    isFinal: eff.isFinal,
    windowDays: eff.windowDays,
    elapsedDays: eff.elapsedDays,
    totalEffect: eff.total.total,
    forecastEffect: прогноз,
    baseQzh: card.baseline?.baseQzh ?? null,
    baseQn: card.baseline?.baseQn ?? null,
    days: eff.days.map((d) => ({
      date: d.date, factQzh: d.factQzh, factQn: d.factQn, coverage: d.coverage, points: d.points,
    })),
    openDisputeBaseline: card.disputes.some((d) => d.subject === 'baseline' && d.state === 'open'),
    openDisputeDate: card.disputes.some((d) => d.subject === 'fact_date' && d.state === 'open'),
    problems: eff.problems,
  });

  try {
    const response = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: 350,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return { error: 'ИИ не вернул текст' };
    return { text: block.text.trim() };
  } catch (e) {
    return { error: `Ошибка обращения к ИИ: ${e instanceof Error ? e.message : 'неизвестная ошибка'}` };
  }
}
