'use server';

/* Жизненный цикл рекомендации — операции меню действий в шапке карточки.
 *
 * Всё здесь делает Исполнитель: он выпускает рекомендацию, снимает её,
 * дописывает после уточнения, закрывает окно эффекта и выпускает новую взамен
 * отклонённой. Заказчик в этом файле не действует вовсе — его единственное
 * действие, решение по рекомендации, лежит в actions.ts.
 *
 * Каждая операция — транзакция со сменой статуса и записью в хронологию:
 * статус без события в истории означает «непонятно, кто и когда», а история
 * рекомендации по договору — доказательство исполнения.
 *
 * Ошибка возвращается ЗНАЧЕНИЕМ (`ОтветФормы`), а не редиректом на
 * `?form=…&err=…`: окна этих действий теперь стоят в разметке закрытыми и
 * открываются состоянием (`summary/lifecycle-forms.tsx`), а не переходом по
 * адресу — тот же приём, что у спора о базе. Редирект их закрывал бы и
 * открывал заново. Успех, где он остаётся навигацией (удаление черновика — на
 * реестр, копия отклонённой — на новую карточку), — это переход на другую
 * страницу, а не закрытие окна, и `redirect()` здесь уместен по-прежнему.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { transaction } from '@/db/pool';
import { currentUser } from '@/lib/session';
import { addWorkHours, toWindow } from '@/domain/workhours';

/** Ответ формы. `null` — форму ещё не отправляли. */
export type ОтветФормы = { ошибка: string } | { готово: true } | null;

const ошибкой = (текст: string): ОтветФормы => ({ ошибка: текст });

/* Буквенные коды месторождений для номера рекомендации. В ВМАП код числовой и
   у четырёх Южно-Ягунских общий, поэтому список свой — тот же, что в макете и
   в генераторе демо. Номер читается как адрес объекта, и код после выдачи
   неизменен. */
const КОДЫ: Record<string, string> = {
  'Южно-Ягунское / ЦДНГ-1 (Я)': 'ЮЯ1', 'Южно-Ягунское / ЦДНГ-2 (Я)': 'ЮЯ2',
  'Южно-Ягунское / ЦДНГ-3 (Я)': 'ЮЯ3', 'Южно-Ягунское / ЦДНГ-4 (Я)': 'ЮЯ4',
  'Кустовое (Видное и Восточно-Ягунское) / ЦДНГ-2 (Я)': 'КВ2',
  'Кустовое (Видное и Восточно-Ягунское) / ЦДНГ-7 (Я)': 'КВ7',
  'Восточно-Икилорское': 'ВИ', 'Западно-Икилорское-обнова': 'ЗИ',
  'Тевлинско-Русскинское': 'ТР', 'Северо-Ягунское': 'СЯ', 'Грибное': 'ГР',
  'Дружное (Кумалиягунское и Танеевское)': 'ДР', 'Новоортьягунское': 'НО',
  'Свободное': 'СВ', 'Яркое': 'ЯР', 'Восточно-Придорожное': 'ВП',
  'Равенское': 'РВ', 'Разведочные площади': 'РП',
};

type Клиент = Parameters<Parameters<typeof transaction>[0]>[0];

/* Успех не редиректит: адрес и так тот, что нужен, а `revalidatePath`
   перерисовывает карточку целиком. Окно закрывает клиент, увидев `готово`. */
function готово(recId: number): ОтветФормы {
  revalidatePath(`/rec/${recId}`, 'layout');
  return { готово: true };
}

async function событие(client: Клиент, recId: number, kind: string, actor: { id: number; fullName: string },
  from: string | null, to: string | null, text: string): Promise<void> {
  await client.query(`
    INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, from_status, to_status, text)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [recId, kind, actor.id, actor.fullName, from, to, text]);
}

/** Исполнитель за экраном — общая проверка для всех операций этого файла. */
async function исполнитель() {
  const user = await currentUser();
  return user && user.side === 'executor' ? user : null;
}

const НЕТ_ПРАВА = 'Это действие выполняет Исполнитель: у вашей учётной записи такого права нет.';

/* ------------------------------ регистрация ------------------------------ */

/**
 * Регистрация черновика: выдача номера и передача Заказчику.
 *
 * Передача отделена от регистрации не формально: рабочее окно Заказчика —
 * пн–пт 09:00–24:00, и рекомендация, выпущенная в субботу, ждёт открытия окна.
 * Норматив ответа считается от передачи, поэтому у ждущей срок ещё не идёт —
 * статус «Зарегистрировано» ровно об этом.
 */
export async function зарегистрировать(
  recId: number, _прошлый: ОтветФормы, _form: FormData,
): Promise<ОтветФормы> {
  const user = await исполнитель();
  if (!user) return ошибкой(НЕТ_ПРАВА);
  const сейчас = new Date();

  /* Базу при регистрации НЕ считаем и не пишем.
     Раньше здесь автоматически создавалась версия со source = 'measured' по
     трём суткам до регистрации. От этого отказались: договор (Приложение № 2)
     называет основным способом утверждённый технологический режим месяца
     выдачи, а трёхсуточный ставит под условие и прямо помечает как
     применяемый «по согласованию с Заказчиком» — односторонне и молча он не
     применяется. Плюс расчёт лез на чужой стенд в транзакции регистрации и мог
     её завалить, а на первом этапе (ручной ввод факта) замеров за период базы
     к моменту регистрации не существует вовсе.
     Базу вносит человек на вкладке «Расчёт эффекта», указывая договорный
     способ и прикладывая документ; до фиксации реализации это обязательно. */

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT r.status, r.field_name, r.priority, r.problem, r.action, p.response_hours
      FROM rec.recommendations r
      LEFT JOIN rec.priorities p ON p.code = r.priority
      WHERE r.id = $1 AND r.deleted_at IS NULL
      FOR UPDATE OF r
    `, [recId]);

    const rec = rows[0];
    if (!rec) return 'Рекомендация не найдена.';
    if (rec.status !== 'draft') return 'Рекомендация уже зарегистрирована. Обновите страницу.';
    /* Без приоритета норматив ответа неизвестен, а по договору Заказчик
       обязан ответить в срок — выпускать рекомендацию без срока нельзя. */
    if (!rec.priority) return 'У черновика не выбран приоритет: без него неизвестен норматив ответа Заказчика.';
    if (!rec.problem?.trim() || !rec.action?.trim()) {
      return 'В черновике не заполнены проблема или рекомендуемое мероприятие.';
    }
    const код = КОДЫ[rec.field_name] ?? 'XX';
    const год = сейчас.getFullYear();

    /* Счётчик, а не max(number): при двух одновременных регистрациях max()
       выдал бы один номер дважды. Строка счётчика блокируется UPSERT-ом. */
    const { rows: сч } = await client.query(`
      INSERT INTO rec.number_counters (field_code, year, last_number) VALUES ($1,$2,1)
      ON CONFLICT (field_code, year) DO UPDATE SET last_number = rec.number_counters.last_number + 1
      RETURNING last_number
    `, [код, год]);

    const номер = `${код}-${String(год % 100).padStart(2, '0')}-${String(сч[0].last_number).padStart(4, '0')}`;

    const передача = toWindow(сейчас);
    const внутриОкна = передача.getTime() === сейчас.getTime();
    const срок = rec.response_hours === null || rec.response_hours === undefined
      ? null : addWorkHours(передача, Number(rec.response_hours));

    await client.query(`
      UPDATE rec.recommendations
         SET number = $2, status = $3, registered_at = $4, sent_at = $5, due_at = $6, updated_at = now()
       WHERE id = $1
    `, [recId, номер, внутриОкна ? 'sent' : 'registered', сейчас, передача, срок]);

    await событие(client, recId, 'status', user!, 'draft', 'registered',
      `Зарегистрировано под номером ${номер}`);
    if (внутриОкна) {
      await событие(client, recId, 'status', user!, 'registered', 'sent', 'Передано Заказчику');
    }

    return null;
  });

  if (ошибка) return ошибкой(ошибка);
  return готово(recId);
}

/* ------------------------------ удаление черновика ------------------------------ */

/**
 * Удаление черновика — мягкое, как во всей базе ВМАП.
 *
 * Удалить можно только черновик: у зарегистрированной есть номер, она ушла
 * Заказчику, и «удаления» для неё не существует — есть отмена.
 */
export async function удалить(
  recId: number, _прошлый: ОтветФормы, _form: FormData,
): Promise<ОтветФормы> {
  const user = await исполнитель();
  if (!user) return ошибкой(НЕТ_ПРАВА);

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT status FROM rec.recommendations WHERE id = $1 AND deleted_at IS NULL FOR UPDATE
    `, [recId]);

    const rec = rows[0];
    if (!rec) return 'Рекомендация не найдена.';
    if (rec.status !== 'draft') return 'Удалить можно только черновик: у выпущенной рекомендации есть номер и история.';

    await client.query('UPDATE rec.recommendations SET deleted_at = now() WHERE id = $1', [recId]);
    await событие(client, recId, 'status', user!, 'draft', null, 'Черновик удалён');
    return null;
  });

  if (ошибка) return ошибкой(ошибка);

  /* Удаление уводит с карточки — на реестр, её больше нет. Настоящий переход,
     а не закрытие окна, поэтому redirect() здесь остаётся уместным. */
  revalidatePath('/', 'layout');
  redirect('/');
}

/* ------------------------------ отмена ------------------------------ */

/**
 * Отмена зарегистрированной рекомендации до ответа Заказчика.
 *
 * Причина обязательна: рекомендация уже получила номер и попала в отчётность,
 * и «отменено» без объяснения через месяц нечитаемо.
 */
export async function отменить(
  recId: number, _прошлый: ОтветФормы, form: FormData,
): Promise<ОтветФормы> {
  const причина = String(form.get('text') ?? '').trim();
  if (!причина) return ошибкой('Укажите причину отмены: рекомендация уже выпущена под номером.');

  const user = await исполнитель();
  if (!user) return ошибкой(НЕТ_ПРАВА);

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT status FROM rec.recommendations WHERE id = $1 AND deleted_at IS NULL FOR UPDATE
    `, [recId]);

    const rec = rows[0];
    if (!rec) return 'Рекомендация не найдена.';
    /* Отменять можно и переданную: Заказчик мог ещё не ответить, а скважина
       уже ушла в ремонт — тогда рекомендация теряет смысл раньше ответа. */
    if (!['registered', 'sent', 'review', 'clarify'].includes(rec.status)) {
      return 'Отменить можно только рекомендацию, по которой ещё нет решения Заказчика.';
    }

    await client.query(`
      UPDATE rec.recommendations SET status = 'cancelled', due_at = NULL, updated_at = now()
       WHERE id = $1
    `, [recId]);
    await событие(client, recId, 'status', user!, rec.status, 'cancelled', `Отменено Исполнителем: ${причина}`);
    return null;
  });

  if (ошибка) return ошибкой(ошибка);
  return готово(recId);
}

/* ------------------------------ повторная передача ------------------------------ */

/**
 * Ответ на запрос уточнения и повторная передача.
 *
 * Норматив продолжается с остатка, а не начинается заново, — редакция договора
 * от 30.07.2026. Остаток посчитан при запросе уточнения и лежит в
 * `sla_hours_left`; здесь он превращается в новый срок ответа.
 */
export async function передатьПовторно(
  recId: number, _прошлый: ОтветФормы, form: FormData,
): Promise<ОтветФормы> {
  const текст = String(form.get('text') ?? '').trim();
  if (!текст) {
    return ошибкой('Опишите уточнение: Заказчик запросил его, и рекомендация вернётся к нему с этим текстом.');
  }

  const user = await исполнитель();
  if (!user) return ошибкой(НЕТ_ПРАВА);

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT r.status, r.sla_hours_left, p.response_hours
      FROM rec.recommendations r
      LEFT JOIN rec.priorities p ON p.code = r.priority
      WHERE r.id = $1 AND r.deleted_at IS NULL
      FOR UPDATE OF r
    `, [recId]);

    const rec = rows[0];
    if (!rec) return 'Рекомендация не найдена.';
    if (rec.status !== 'clarify') return 'Повторная передача возможна только из статуса «На уточнении».';

    const передача = toWindow(new Date());
    const остаток = rec.sla_hours_left === null || rec.sla_hours_left === undefined
      ? (rec.response_hours === null ? null : Number(rec.response_hours))
      : Number(rec.sla_hours_left);
    const срок = остаток === null ? null : addWorkHours(передача, остаток);

    await client.query(`
      UPDATE rec.recommendations
         SET status = 'sent', sent_at = $2, due_at = $3, updated_at = now()
       WHERE id = $1
    `, [recId, передача, срок]);

    /* Уточнение — комментарий Исполнителя в общей ленте: следующий круг должен
       читаться подряд, вопрос Заказчика и ответ на него рядом. */
    await client.query(`
      INSERT INTO rec.comments (rec_id, author_id, author_name, text)
      VALUES ($1,$2,$3,$4)
    `, [recId, user!.id, user!.fullName, текст]);

    await событие(client, recId, 'status', user!, 'clarify', 'sent',
      'Внесено уточнение, рекомендация передана Заказчику повторно');
    return null;
  });

  if (ошибка) return ошибкой(ошибка);
  return готово(recId);
}

/* ------------------------------ досрочное закрытие окна ------------------------------ */

/**
 * Досрочное закрытие окна подтверждения эффекта.
 *
 * Штатное действие, а не аварийное: режим скважины изменился по другой причине,
 * скважина встала в ремонт, эффект вышел на полку — дальше считать нечего.
 * Сутки после закрытия в расчёт не входят, и итог становится окончательным.
 */
export async function закрытьОкноДосрочно(
  recId: number, _прошлый: ОтветФормы, form: FormData,
): Promise<ОтветФормы> {
  const причина = String(form.get('text') ?? '').trim();
  if (!причина) {
    return ошибкой('Укажите причину досрочного закрытия: она объясняет, почему эффект посчитан не за полные 90 суток.');
  }

  const user = await currentUser();
  if (!user || user.side !== 'executor') {
    return ошибкой('Окно закрывает Исполнитель: у вашей учётной записи такого права нет.');
  }

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT r.status, i.closed_at
      FROM rec.recommendations r
      LEFT JOIN rec.implementations i ON i.rec_id = r.id
      WHERE r.id = $1 AND r.deleted_at IS NULL
      FOR UPDATE OF r
    `, [recId]);

    const rec = rows[0];
    if (!rec) return 'Рекомендация не найдена.';
    if (rec.status !== 'windowOpen' || rec.closed_at) return 'Окно уже закрыто. Обновите страницу.';

    await client.query(`
      UPDATE rec.implementations SET closed_at = now(), closed_early = true WHERE rec_id = $1
    `, [recId]);
    await client.query(`
      UPDATE rec.recommendations SET status = 'windowClosed', updated_at = now() WHERE id = $1
    `, [recId]);

    /* Кэш расчёта удаляется: он посчитан по суткам открытого окна, а закрытие
       окно обрезает. Следующее открытие вкладки посчитает заново и сохранит
       уже окончательный вариант. */
    await client.query('DELETE FROM rec.effect_daily WHERE rec_id = $1', [recId]);

    await событие(client, recId, 'status', user!, 'windowOpen', 'windowClosed',
      `Окно закрыто досрочно: ${причина}`);
    return null;
  });

  if (ошибка) return ошибкой(ошибка);
  return готово(recId);
}

/* ------------------------------ новая на основе ------------------------------ */

/**
 * Новая рекомендация на основе отклонённой или отменённой.
 *
 * Копируется содержание, а не история: номера, решений, базы и окна у копии
 * нет — это новый черновик, который пойдёт свой круг. Связь с исходной пока
 * хранится только событием в хронологии обеих: таблицы связей ещё нет, а
 * терять родство нельзя — по нему видно, что вопрос поднимался второй раз.
 */
export async function создатьНаОснове(
  recId: number, _прошлый: ОтветФормы, _form: FormData,
): Promise<ОтветФормы> {
  const user = await исполнитель();
  if (!user) return ошибкой(НЕТ_ПРАВА);

  const новый = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT number, status, direction_id, priority, well_id, well_number, kust,
             field_id, field_name, problem, action, rationale,
             expect_qzh, expect_qn, expect_ee
      FROM rec.recommendations WHERE id = $1 AND deleted_at IS NULL
    `, [recId]);

    const r = rows[0];
    if (!r) return { ошибка: 'Рекомендация не найдена.' };
    if (r.status !== 'rejected' && r.status !== 'cancelled') {
      return { ошибка: 'Новую на основе делают из отклонённой или отменённой: у остальных круг ещё не закончен.' };
    }

    const { rows: созданные } = await client.query(`
      INSERT INTO rec.recommendations
        (status, direction_id, priority, well_id, well_number, kust, field_id, field_name,
         problem, action, rationale, expect_qzh, expect_qn, expect_ee, author_id, executor_id)
      VALUES ('draft',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
      RETURNING id
    `, [r.direction_id, r.priority, r.well_id, r.well_number, r.kust, r.field_id, r.field_name,
      r.problem, r.action, r.rationale, r.expect_qzh, r.expect_qn, r.expect_ee, user!.id]);

    const новыйId = Number(созданные[0].id);

    await событие(client, новыйId, 'status', user!, null, 'draft',
      `Создано на основе рекомендации ${r.number ?? `№${recId}`}`);
    await событие(client, recId, 'link', user!, null, null,
      'На основе этой рекомендации создан новый черновик');

    return { id: новыйId };
  });

  if ('ошибка' in новый) return ошибкой(новый.ошибка!);

  /* Копия — другая рекомендация: настоящий переход на её карточку, а не
     закрытие окна на этой, поэтому redirect() здесь остаётся уместным. */
  revalidatePath('/', 'layout');
  redirect(`/rec/${новый.id}/summary`);
}
