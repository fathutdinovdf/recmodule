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
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { transaction } from '@/db/pool';
import { currentUser } from '@/lib/session';
import { workHoursBetween } from '@/domain/workhours';

type Kind = 'accept' | 'reject' | 'clarify';

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

export async function решить(kind: Kind, recId: number, form: FormData): Promise<void> {
  const текст = String(form.get('text') ?? '').trim();
  const причина = String(form.get('reason') ?? '').trim();
  const план = String(form.get('planned') ?? '').trim();

  /* Обоснование обязательно при отклонении и при запросе уточнения: это
     единственное, что остаётся Исполнителю на входе следующего круга, и
     единственное, чем Заказчик объясняет отказ в отчётности по договору
     (решение 50). */
  if ((kind === 'reject' || kind === 'clarify') && !текст) {
    вернуться(recId, kind, kind === 'reject'
      ? 'Обоснование отказа обязательно: без него Исполнитель не поймёт, что делать дальше, а Заказчику нечего показать в отчётности по договору.'
      : 'Опишите, что именно требуется уточнить: рекомендация вернётся Исполнителю с этим текстом.');
  }
  if (kind === 'reject' && !причина) {
    вернуться(recId, kind, 'Выберите причину отклонения из списка.');
  }

  const user = await currentUser();
  if (!user || user.side !== 'customer' || !user.canDecide) {
    вернуться(recId, kind, 'Решение принимает уполномоченный сотрудник Заказчика; у вашей учётной записи права решения нет.');
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
    `, [recId, user!.id, user!.fullName, rec.status, НОВЫЙ_СТАТУС[kind], СОБЫТИЕ[kind]]);

    return null;
  });

  if (ошибка) вернуться(recId, kind, ошибка);

  revalidatePath(`/rec/${recId}`, 'layout');
  redirect(`/rec/${recId}/summary`);
}

/**
 * Первое открытие карточки Заказчиком.
 *
 * Фиксируются два разных момента: когда Заказчик открыл рекомендацию и когда
 * ответил. Норматив по договору меряет ответ, но по разрыву между открытием и
 * ответом видно, читали рекомендацию или подписали не глядя.
 *
 * Единственное место, где модуль пишет при показе страницы, а не по нажатию.
 * Поэтому запись строго однократная — вторая попытка отсекается в самом SQL,
 * а не проверкой перед ним: карточку открывают и в двух вкладках сразу.
 */
export async function отметитьОткрытие(recId: number, status: string): Promise<void> {
  if (status !== 'sent') return;

  const user = await currentUser();
  if (!user || user.side !== 'customer') return;

  await transaction(async (client) => {
    const { rowCount } = await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, from_status, to_status, text)
      SELECT $1, 'opened', $2, $3, 'sent', 'review', 'Карточка открыта Заказчиком'
       WHERE NOT EXISTS (
         SELECT 1 FROM rec.recommendation_events WHERE rec_id = $1 AND kind = 'opened'
       )
    `, [recId, user.id, user.fullName]);

    if (rowCount) {
      await client.query(`
        UPDATE rec.recommendations SET status = 'review', updated_at = now()
         WHERE id = $1 AND status = 'sent'
      `, [recId]);
    }
  });
}

/* Ошибка возвращается в адресе, а не состоянием: форма раскрыта параметром
   `form`, и обе половины должны переживать обычную перезагрузку страницы. */
function вернуться(recId: number, form: Kind, ошибка: string): never {
  redirect(`/rec/${recId}/summary?form=${form}&err=${encodeURIComponent(ошибка)}`);
}
