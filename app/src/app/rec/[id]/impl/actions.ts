'use server';

/* Действия вкладки «Реализация»: фиксация факта Исполнителем и спор Заказчика
 * о дате.
 *
 * Отдельно от actions.ts карточки намеренно: там решение Заказчика — один
 * переход, здесь четыре действия двух сторон вокруг одной даты, и общий файл
 * читался бы как свалка.
 *
 * Главное правило вкладки: факт и дату реализации определяет Исполнитель по
 * телеметрии, а не Заказчик отчётом о работах (решение 21). Заказчик вправе
 * дату оспорить, пока окно не закрыто, но не вправе её поставить.
 *
 * Валидация вся здесь, а не в браузере: формы отправляются обычным POST и
 * работают без JavaScript, а права — тем более не дело клиента.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { transaction } from '@/db/pool';
import { currentUser } from '@/lib/session';
import { WINDOW_DAYS } from '@/services/effect-store';
import { дата as датаНаЭкран } from '@/lib/format';

/* Дата приходит из календаря в ISO. Разбираем руками, а не через `new Date`:
   строка без часового пояса читается как UTC, и в Когалыме дата уезжает на
   сутки назад. */
function датаИзФормы(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const сутки = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const плюсСуток = (d: Date, n: number) => {
  const x = сутки(d);
  x.setDate(x.getDate() + n);
  return x;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* Ошибка возвращается в адресе, как и на сводке: форма раскрыта параметром
   `form`, и обе половины должны переживать обычную перезагрузку страницы. */
function вернуться(recId: number, form: string, ошибка: string): never {
  redirect(`/rec/${recId}/impl?form=${form}&err=${encodeURIComponent(ошибка)}`);
}

function готово(recId: number): never {
  revalidatePath(`/rec/${recId}`, 'layout');
  redirect(`/rec/${recId}/impl`);
}

/* ------------------------------ фиксация реализации ------------------------------ */

/**
 * Фиксация факта реализации. Тем же действием открывается окно подтверждения
 * эффекта: разделять их нечем — окно отсчитывается от даты реализации, и
 * «зафиксировал, но окно не открыл» состояния в договоре нет.
 */
export async function зафиксировать(recId: number, form: FormData): Promise<void> {
  const дата = датаИзФормы(String(form.get('fact_date') ?? ''));
  const полнота = String(form.get('completeness') ?? '');
  const чтоНеВыполнено = String(form.get('completeness_note') ?? '').trim();
  const комментарий = String(form.get('note') ?? '').trim();

  if (!дата) вернуться(recId, 'fact', 'Укажите дату фактической реализации.');
  if (дата > сутки(new Date())) {
    вернуться(recId, 'fact', 'Дата реализации не может быть в будущем: фиксируется то, что уже видно в телеметрии.');
  }
  if (полнота !== 'full' && полнота !== 'partial') {
    вернуться(recId, 'fact', 'Укажите полноту реализации.');
  }
  /* Полнота — поле, а не статус (решение 12), и «частично» без объяснения
     превращает поле в пустую отметку: без перечня невыполненного ни спорить о
     базе, ни объяснять недобор эффекта потом нечем. */
  if (полнота === 'partial' && !чтоНеВыполнено) {
    вернуться(recId, 'fact', 'При частичной реализации опишите, что именно не выполнено.');
  }

  const user = await currentUser();
  if (!user || user.side !== 'executor') {
    вернуться(recId, 'fact', 'Факт реализации фиксирует Исполнитель по телеметрии: у вашей учётной записи такого права нет.');
  }

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT r.status, r.registered_at
      FROM rec.recommendations r
      WHERE r.id = $1 AND r.deleted_at IS NULL
      FOR UPDATE OF r
    `, [recId]);

    const rec = rows[0];
    if (!rec) return 'Рекомендация не найдена.';
    if (rec.status !== 'approved') {
      return rec.status === 'windowOpen' || rec.status === 'windowClosed'
        ? 'Реализация по этой рекомендации уже зафиксирована. Обновите страницу.'
        : 'Фиксировать реализацию можно только после согласования Заказчиком.';
    }
    /* Раньше регистрации мероприятие выполнено быть не могло: рекомендации
       ещё не существовало. Сверяемся с регистрацией, а не с решением
       Заказчика, — бригада иногда выезжает в тот же день, и час решения
       против часа работ здесь не показатель. */
    if (rec.registered_at && дата < сутки(new Date(rec.registered_at))) {
      return 'Дата реализации раньше даты регистрации рекомендации — проверьте дату.';
    }

    const открытие = дата;
    const закрытие = плюсСуток(открытие, WINDOW_DAYS);

    await client.query(`
      INSERT INTO rec.implementations
        (rec_id, fact_date, fixed_by, fixed_by_name, note, window_open_at, window_close_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [recId, iso(дата), user!.id, user!.fullName, комментарий || null,
      iso(открытие), iso(закрытие)]);

    await client.query(`
      UPDATE rec.recommendations
         SET status = 'windowOpen', completeness = $2, completeness_note = $3, updated_at = now()
       WHERE id = $1
    `, [recId, полнота, полнота === 'partial' ? чтоНеВыполнено : null]);

    await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, from_status, to_status, text)
      VALUES ($1,'fact',$2,$3,'approved','windowOpen',$4)
    `, [recId, user!.id, user!.fullName,
      `Зафиксирована реализация ${полнота === 'partial' ? 'частично' : 'полностью'}, открыто окно подтверждения эффекта`]);

    return null;
  });

  if (ошибка) вернуться(recId, 'fact', ошибка);
  готово(recId);
}

/* ------------------------------ спор о дате ------------------------------ */

/**
 * Возражение Заказчика по дате реализации.
 *
 * Окно при этом не останавливается: суточные значения фиксируются расчётом по
 * настоящим замерам, и смена даты просто сдвигает те же 90 суток. До снятия
 * возражения расчёт помечается предварительным — это делает `effect-store` по
 * наличию открытого спора.
 */
export async function оспоритьДату(recId: number, form: FormData): Promise<void> {
  const дата = датаИзФормы(String(form.get('proposed_date') ?? ''));
  const обоснование = String(form.get('text') ?? '').trim();

  if (!дата) вернуться(recId, 'dispute', 'Укажите дату, которую считаете верной.');
  if (дата > сутки(new Date())) {
    вернуться(recId, 'dispute', 'Предлагаемая дата не может быть в будущем.');
  }
  if (!обоснование) {
    вернуться(recId, 'dispute', 'Обоснование обязательно: Исполнителю нужно понять, что в его дате не так.');
  }

  const user = await currentUser();
  if (!user || user.side !== 'customer') {
    вернуться(recId, 'dispute', 'Оспорить дату реализации может только Заказчик.');
  }

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT r.status, i.fact_date, i.closed_at
      FROM rec.recommendations r
      LEFT JOIN rec.implementations i ON i.rec_id = r.id
      WHERE r.id = $1 AND r.deleted_at IS NULL
      FOR UPDATE OF r
    `, [recId]);

    const rec = rows[0];
    if (!rec || !rec.fact_date) return 'Реализация ещё не зафиксирована — оспаривать нечего.';
    /* После закрытия окна эффект финализирован: спорить о дате, по которой
       уже посчитан окончательный итог, поздно — это разбирательство по
       разделу 10 договора, а не действие в модуле. */
    if (rec.status !== 'windowOpen' || rec.closed_at) {
      return 'Окно подтверждения эффекта закрыто: дату реализации больше не оспорить.';
    }
    if (iso(дата) === iso(new Date(rec.fact_date))) {
      return 'Предлагаемая дата совпадает с той, что зафиксировал Исполнитель.';
    }

    const { rows: открытые } = await client.query(`
      SELECT 1 FROM rec.disputes
       WHERE rec_id = $1 AND subject = 'fact_date' AND state = 'open'
    `, [recId]);
    if (открытые.length) return 'Возражение по дате уже подано и ещё не рассмотрено.';

    await client.query(`
      INSERT INTO rec.disputes (rec_id, subject, opened_by, opened_by_name, reason, proposed_date)
      VALUES ($1,'fact_date',$2,$3,$4,$5)
    `, [recId, user!.id, user!.fullName, обоснование, iso(дата)]);

    await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, text)
      VALUES ($1,'dispute',$2,$3,$4)
    `, [recId, user!.id, user!.fullName,
      `Заказчик оспорил дату реализации, предлагает ${датаНаЭкран(дата)}`]);

    return null;
  });

  if (ошибка) вернуться(recId, 'dispute', ошибка);
  готово(recId);
}

/**
 * Исполнитель принимает дату Заказчика.
 *
 * Окно переезжает целиком: новая дата — новое открытие и новые 90 суток.
 * Кэш расчёта при этом удаляется, а не правится: он посчитан по суткам старого
 * окна, и часть из них в новое не входит.
 */
export async function принятьДату(recId: number, disputeId: number): Promise<void> {
  const user = await currentUser();
  if (!user || user.side !== 'executor') {
    вернуться(recId, 'declineDispute', 'Разбирать возражение по дате может только Исполнитель.');
  }

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT d.proposed_date, d.state, i.closed_at
      FROM rec.disputes d
      JOIN rec.implementations i ON i.rec_id = d.rec_id
      WHERE d.id = $1 AND d.rec_id = $2 AND d.subject = 'fact_date'
      FOR UPDATE OF d
    `, [disputeId, recId]);

    const d = rows[0];
    if (!d) return 'Возражение не найдено.';
    if (d.state !== 'open') return 'Возражение уже рассмотрено. Обновите страницу.';
    if (d.closed_at) return 'Окно закрыто: изменить дату реализации уже нельзя.';

    const новая = сутки(new Date(d.proposed_date));

    await client.query(`
      UPDATE rec.implementations
         SET fact_date = $2, window_open_at = $2, window_close_at = $3
       WHERE rec_id = $1
    `, [recId, iso(новая), iso(плюсСуток(новая, WINDOW_DAYS))]);

    await client.query('DELETE FROM rec.effect_daily WHERE rec_id = $1', [recId]);

    await client.query(`
      UPDATE rec.disputes
         SET state = 'accepted', resolved_at = now(), resolved_by = $2
       WHERE id = $1
    `, [disputeId, user!.id]);

    await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, text)
      VALUES ($1,'dispute',$2,$3,$4)
    `, [recId, user!.id, user!.fullName,
      `Дата реализации изменена на ${датаНаЭкран(новая)} по возражению Заказчика, окно пересчитано`]);

    return null;
  });

  if (ошибка) вернуться(recId, 'declineDispute', ошибка);
  готово(recId);
}

/** Исполнитель отклоняет возражение: дата остаётся прежней, спор — в истории. */
export async function отклонитьВозражение(recId: number, disputeId: number, form: FormData): Promise<void> {
  const обоснование = String(form.get('text') ?? '').trim();
  if (!обоснование) {
    вернуться(recId, 'declineDispute', 'Обоснование обязательно: Заказчику нужно знать, что показывает телеметрия в спорные сутки.');
  }

  const user = await currentUser();
  if (!user || user.side !== 'executor') {
    вернуться(recId, 'declineDispute', 'Разбирать возражение по дате может только Исполнитель.');
  }

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT state FROM rec.disputes
       WHERE id = $1 AND rec_id = $2 AND subject = 'fact_date'
       FOR UPDATE
    `, [disputeId, recId]);

    const d = rows[0];
    if (!d) return 'Возражение не найдено.';
    if (d.state !== 'open') return 'Возражение уже рассмотрено. Обновите страницу.';

    await client.query(`
      UPDATE rec.disputes
         SET state = 'rejected', resolved_at = now(), resolved_by = $2, resolution_note = $3
       WHERE id = $1
    `, [disputeId, user!.id, обоснование]);

    await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, text)
      VALUES ($1,'dispute',$2,$3,'Возражение Заказчика по дате реализации отклонено')
    `, [recId, user!.id, user!.fullName]);

    return null;
  });

  if (ошибка) вернуться(recId, 'declineDispute', ошибка);
  готово(recId);
}
