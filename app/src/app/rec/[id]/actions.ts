'use server';

/* Действия по карточке. Первая запись в базу из интерфейса вообще: до сих пор
 * приложение только читало.
 *
 * Решение Заказчика — это сразу три записи: сам ответ в `decisions`, новый
 * статус рекомендации и строка в хронологии. Поэтому транзакция: статус
 * «Отклонено» без обоснования отказа — это карточка, противоречащая себе, и
 * разбирать её потом будет некому.
 *
 * Валидация вынесена сюда целиком, а не в браузер: форма отправляется обычным
 * POST и без JavaScript, а проверка прав — тем более не дело клиента.
 *
 * Ошибка возвращается ЗНАЧЕНИЕМ (`ОтветФормы`), а не редиректом на
 * `?form=…&err=…`: окно решения теперь стоит в разметке сводки закрытым и
 * открывается состоянием (`summary/decision-forms.tsx`), тот же приём, что у
 * спора о базе. Редирект закрывал бы окно и открывал заново.
 */

import { revalidatePath } from 'next/cache';
import { transaction } from '@/db/pool';
import { currentUser } from '@/lib/session';
import { этоРешающий, НЕТ_ПРАВА } from '@/lib/access';
import { workHoursBetween } from '@/domain/workhours';

type Kind = 'accept' | 'reject' | 'clarify';

/** Ответ формы. `null` — форму ещё не отправляли. */
export type ОтветФормы = { ошибка: string } | { готово: true } | null;

/* Статусы, на которых решение вообще возможно. «Передано» и «На рассмотрении»
   различаются только тем, открывал ли Заказчик карточку; отвечать можно с
   обоих. На всех прочих ответ уже дан, отменён или ещё не запрошен. */
const МОЖНО_РЕШАТЬ = ['sent', 'review'];

const НОВЫЙ_СТАТУС: Record<Kind, string> = {
  accept: 'approved',
  reject: 'rejected',
  clarify: 'clarify',
};

const СОБЫТИЕ: Record<Kind, string> = {
  accept: 'Согласовано к реализации',
  reject: 'Отклонено',
  clarify: 'Запрошено уточнение',
};

/* Хвост к тексту события: было ли решение принято в норматив ответа.
   Без часов (норматив неизвестен или карточка ещё не передавалась в этом
   круге — например, повторно после уточнения без сохранённого остатка)
   хвоста нет: писать «просрочено» без сравнения не с чем. */
function срокОтвета(норматив: number | null, израсходовано: number | null): string {
  if (норматив === null || израсходовано === null) return '';
  if (израсходовано <= норматив) return ` — в срок (${Math.round(норматив - израсходовано)} ч в запасе)`;
  return ` — с просрочкой на ${Math.round(израсходовано - норматив)} ч`;
}

export async function решить(
  kind: Kind, recId: number, _прошлый: ОтветФормы, form: FormData,
): Promise<ОтветФормы> {
  const текст = String(form.get('text') ?? '').trim();
  const причина = String(form.get('reason') ?? '').trim();
  const план = String(form.get('planned') ?? '').trim();

  /* Обоснование обязательно при отклонении и при запросе уточнения: это
     единственное, что остаётся Исполнителю на входе следующего круга, и
     единственное, чем Заказчик объясняет отказ в отчётности по договору
     (решение 50). */
  if ((kind === 'reject' || kind === 'clarify') && !текст) {
    return вернуться(kind === 'reject'
      ? 'Обоснование отказа обязательно: без него Исполнитель не поймёт, что делать дальше, а Заказчику нечего показать в отчётности по договору.'
      : 'Опишите, что именно требуется уточнить: рекомендация вернётся Исполнителю с этим текстом.');
  }
  if (kind === 'reject' && !причина) {
    return вернуться('Выберите причину отклонения из списка.');
  }

  const user = await currentUser();
  if (!user || !этоРешающий(user)) {
    return вернуться(НЕТ_ПРАВА.решение);
  }

  const ошибка = await transaction(async (client) => {
    /* Строка блокируется на время решения: два ответа по одной рекомендации
       из двух вкладок дали бы два решения и два перевода статуса. */
    const { rows } = await client.query(`
      SELECT r.status, r.sent_at, p.response_hours
      FROM rec.recommendations r
      LEFT JOIN rec.priorities p ON p.code = r.priority
      WHERE r.id = $1 AND r.deleted_at IS NULL
      FOR UPDATE OF r
    `, [recId]);

    const rec = rows[0];
    if (!rec) return 'Рекомендация не найдена.';
    if (!МОЖНО_РЕШАТЬ.includes(rec.status)) {
      return 'Решение по этой рекомендации уже принято или она больше не ждёт ответа. Обновите страницу.';
    }

    /* Израсходованные часы считаются один раз и хранятся: пересчитывать их
       задним числом нельзя, производственный календарь может измениться. */
    const израсходовано = rec.sent_at ? workHoursBetween(rec.sent_at, new Date()) : null;
    const норматив = rec.response_hours === null || rec.response_hours === undefined
      ? null : Number(rec.response_hours);

    await client.query(`
      INSERT INTO rec.decisions (rec_id, kind, actor_id, actor_name, reason_text, comment, planned_at, sla_spent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [recId, kind, user!.id, user!.fullName,
      kind === 'reject' ? причина : null,
      текст || null,
      kind === 'accept' && план ? план : null,
      израсходовано]);

    /* Запрос уточнения возвращает рекомендацию Исполнителю и приостанавливает
       норматив: по редакции договора от 30.07.2026 он продолжается с остатка
       после повторной передачи, а не начинается заново. Поэтому остаток
       сохраняется, а срок ответа снимается — до новой передачи его нет. */
    const остаток = kind === 'clarify' && норматив !== null && израсходовано !== null
      ? Math.max(0, норматив - израсходовано) : null;

    await client.query(`
      UPDATE rec.recommendations
         SET status = $2,
             due_at = CASE WHEN $3::boolean THEN NULL ELSE due_at END,
             sla_hours_left = COALESCE($4, sla_hours_left),
             updated_at = now()
       WHERE id = $1
    `, [recId, НОВЫЙ_СТАТУС[kind], kind === 'clarify', остаток]);

    await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, from_status, to_status, text)
      VALUES ($1,'decision',$2,$3,$4,$5,$6)
    `, [recId, user!.id, user!.fullName, rec.status, НОВЫЙ_СТАТУС[kind],
      СОБЫТИЕ[kind] + срокОтвета(норматив, израсходовано)]);

    return null;
  });

  if (ошибка) return вернуться(ошибка);

  revalidatePath(`/rec/${recId}`, 'layout');
  return { готово: true };
}

/**
 * Первое открытие карточки Заказчиком.
 *
 * Фиксируются два разных момента: когда Заказчик открыл рекомендацию и когда
 * ответил. Норматив по договору меряет ответ, но по разрыву между открытием и
 * ответом видно, читали рекомендацию или подписали не глядя.
 *
 * Единственное место, где модуль пишет при показе страницы, а не по нажатию.
 * Поэтому запись строго однократная — вторая попытка отсекается уникальным
 * индексом `recommendation_events_opened_once` (миграция 007), а не проверкой
 * перед вставкой: `WHERE NOT EXISTS` внутри транзакции не атомарен под READ
 * COMMITTED и пропускал дубль, когда карточку открывали в двух вкладках сразу
 * или Next.js успевал prefetch-нуть страницу вплотную к настоящей навигации.
 */
export async function отметитьОткрытие(recId: number, status: string): Promise<void> {
  if (status !== 'sent') return;

  const user = await currentUser();
  if (!user || user.side !== 'customer') return;

  await transaction(async (client) => {
    const { rowCount } = await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, from_status, to_status, text)
      VALUES ($1, 'opened', $2, $3, 'sent', 'review', 'Карточка открыта Заказчиком')
      ON CONFLICT (rec_id) WHERE kind = 'opened' DO NOTHING
    `, [recId, user.id, user.fullName]);

    if (rowCount) {
      await client.query(`
        UPDATE rec.recommendations SET status = 'review', updated_at = now()
         WHERE id = $1 AND status = 'sent'
      `, [recId]);
    }
  });
}

const вернуться = (ошибка: string): ОтветФормы => ({ ошибка });
