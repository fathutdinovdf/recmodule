'use server';

/* Действия вкладки «Расчёт эффекта»: спор о базовых значениях.
 *
 * База — вторая после даты реализации величина, которую определяет одна
 * сторона, а живёт с ней другая: Исполнитель вносит базу при регистрации,
 * Заказчик потом принимает по ней эффект. Поэтому у базы тот же круг, что у
 * даты: Заказчик подаёт свою версию с обоснованием, Исполнитель принимает или
 * отклоняет.
 *
 * Отличие от спора о дате одно, но важное: предложенная версия — это не поле в
 * споре, а полноценная строка в `rec.baselines` со status = 'proposed'. Причина
 * в том, что база многозначна (три показателя, период, источник), и она же
 * ссылается из кэша расчёта: `effect_daily.baseline_id` должен указывать на
 * версию, по которой сутки посчитаны. Хранить предложение отдельным форматом
 * значило бы держать два описания одной сущности.
 *
 * Границы, которых в договоре нет и которые приняты по аналогии со спором о
 * дате (см. отчёт по задаче):
 *
 *   верхняя — закрытие окна эффекта. После закрытия итог финализирован, и
 *             спорить о базе, по которой он посчитан, поздно: это уже
 *             разбирательство по разделу 10 договора, а не действие в модуле;
 *   нижняя  — согласование рекомендации Заказчиком. До него база спорна вместе
 *             со всей рекомендацией: не согласен с базой — не согласовывай или
 *             запроси уточнение, отдельный спор для этого не нужен.
 *
 * Валидация вся здесь: права и границы операции — не дело клиента.
 *
 * Ошибка возвращается ЗНАЧЕНИЕМ, а не редиректом на `?form=…&err=…`, как было
 * раньше. Редирект — навигация: окно закрывалось, вкладка перерисовывалась с
 * заглушкой, и окно открывалось заново с подсвеченным полем. Теперь форма
 * читает ответ через `useActionState`, и отказ валидации ничего не двигает.
 * Цена — формы этих трёх окон требуют JavaScript; тот же размен уже принят для
 * меню действий.
 */

import { revalidatePath } from 'next/cache';
import { transaction } from '@/db/pool';
import { currentUser } from '@/lib/session';
import { число as числоНаЭкран } from '@/lib/format';

/** Ответ формы. `null` — форму ещё не отправляли, отсюда отдельное «готово»:
    начальное состояние useActionState иначе не отличить от успеха. */
export type ОтветФормы = { ошибка: string } | { готово: true } | null;

/** Статусы, на которых базу ещё можно оспорить. */
const СТАТУСЫ_СПОРА = new Set(['approved', 'windowOpen']);

/* Число приходит из поля ввода в том виде, в каком его набрали. Запятая
   принимается наравне с точкой: на русской раскладке десятичный разделитель —
   запятая, и «26,5» человек наберёт скорее, чем «26.5». */
function числоИзФормы(v: unknown): number | null {
  const s = String(v ?? '').trim().replace(',', '.').replace(/\s/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const вернуться = (ошибка: string): ОтветФормы => ({ ошибка });

/* Успех не редиректит: адрес и так тот, что нужен, а `revalidatePath`
   перерисовывает карточку целиком — и вкладку, и шапку со статусом. Окно
   закрывает клиент, увидев пустой ответ. */
function готово(recId: number): ОтветФормы {
  revalidatePath(`/rec/${recId}`, 'layout');
  return { готово: true };
}

/* ------------------------------ подача возражения ------------------------------ */

/**
 * Возражение Заказчика по базовым значениям.
 *
 * Пишет свою версию базы отдельной строкой со status = 'proposed' и спор,
 * который на неё ссылается. Действующая база при этом не трогается: пока спор
 * не разобран, эффект считается по ней, а итог помечается предварительным —
 * это делает `effect-store` по наличию открытого спора.
 */
export async function оспоритьБазу(
  recId: number, _прошлый: ОтветФормы, form: FormData,
): Promise<ОтветФормы> {
  const qzh = числоИзФормы(form.get('base_qzh'));
  const qn = числоИзФормы(form.get('base_qn'));
  const ee = числоИзФормы(form.get('base_ee'));
  const обоснование = String(form.get('text') ?? '').trim();

  /* Жидкость и нефть обязательны: без любой из них расчёт денег встаёт целиком
     (часть статей висит на жидкости, часть на нефти). ЭЭ необязательна — она в
     формулу не входит вовсе, источника факта по ней пока нет. */
  if (qzh === null || Number.isNaN(qzh)) return вернуться('Укажите базовый дебит жидкости числом.');
  if (qn === null || Number.isNaN(qn)) return вернуться('Укажите базовый дебит нефти числом.');
  if (Number.isNaN(ee)) return вернуться('Энергопотребление указано не числом.');
  if (qzh! < 0 || qn! < 0 || (ee ?? 0) < 0) return вернуться('Базовые значения не могут быть отрицательными.');
  /* Нефть не может превышать жидкость даже при нулевой обводнённости: нефть в
     тоннах, жидкость в кубометрах, и плотность нефти всегда меньше тонны на
     куб. Проверка грубая, но ловит перепутанные местами поля. */
  if (qn! > qzh!) return вернуться('Дебит нефти больше дебита жидкости — проверьте, не перепутаны ли поля.');
  if (!обоснование) {
    return вернуться('Заполните обоснование.');
  }

  const user = await currentUser();
  if (!user || user.side !== 'customer') {
    return вернуться('Оспорить базовые значения может только Заказчик.');
  }

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT r.status, i.closed_at,
             b.id AS baseline_id, b.base_qzh, b.base_qn, b.base_ee
      FROM rec.recommendations r
      LEFT JOIN rec.implementations i ON i.rec_id = r.id
      LEFT JOIN LATERAL (
        SELECT b2.id, b2.base_qzh, b2.base_qn, b2.base_ee
        FROM rec.baselines b2
        WHERE b2.rec_id = r.id AND b2.status = 'accepted'
        ORDER BY b2.created_at DESC, b2.id DESC LIMIT 1
      ) b ON true
      WHERE r.id = $1 AND r.deleted_at IS NULL
      FOR UPDATE OF r
    `, [recId]);

    const rec = rows[0];
    if (!rec) return 'Рекомендация не найдена.';
    if (!rec.baseline_id) return 'Базовые значения не заданы — оспаривать нечего.';
    if (!СТАТУСЫ_СПОРА.has(rec.status)) {
      return rec.status === 'windowClosed'
        ? 'Окно подтверждения эффекта закрыто: базовые значения больше не оспорить.'
        : 'Оспорить базовые значения можно после согласования рекомендации и до закрытия окна эффекта.';
    }
    if (rec.closed_at) return 'Окно подтверждения эффекта закрыто: базовые значения больше не оспорить.';

    /* Сравниваем через Number: numeric приезжает из pg строкой, и «26.494»
       против 26.494 разошлись бы как разные значения. */
    const тоЖе = (a: unknown, b: number | null) =>
      (a === null || a === undefined ? null : Number(a)) === b;
    if (тоЖе(rec.base_qzh, qzh) && тоЖе(rec.base_qn, qn) && тоЖе(rec.base_ee, ee)) {
      return 'Предлагаемые значения совпадают с действующей базой.';
    }

    const { rows: открытые } = await client.query(`
      SELECT 1 FROM rec.disputes
       WHERE rec_id = $1 AND subject = 'baseline' AND state = 'open'
    `, [recId]);
    if (открытые.length) return 'Возражение по базовым значениям уже подано и ещё не рассмотрено.';

    /* Период у предложенной версии не заполняется: Заказчик называет значения,
       а не считает их договорным способом за отрезок. Откуда они взялись —
       в обосновании спора. */
    const { rows: созданная } = await client.query(`
      INSERT INTO rec.baselines
        (rec_id, base_qzh, base_qn, base_ee, source, status, created_by, author_name, note)
      VALUES ($1,$2,$3,$4,'disputed','proposed',$5,$6,$7)
      RETURNING id
    `, [recId, qzh, qn, ee, user!.id, user!.fullName, обоснование]);

    await client.query(`
      INSERT INTO rec.disputes (rec_id, subject, opened_by, opened_by_name, reason, proposed_baseline_id)
      VALUES ($1,'baseline',$2,$3,$4,$5)
    `, [recId, user!.id, user!.fullName, обоснование, созданная[0].id]);

    await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, text)
      VALUES ($1,'dispute',$2,$3,$4)
    `, [recId, user!.id, user!.fullName,
      `Заказчик оспорил базовые значения, предлагает Qж ${числоНаЭкран(qzh)} м³/сут, Qн ${числоНаЭкран(qn)} т/сут`]);

    return null;
  });

  if (ошибка) return вернуться(ошибка);
  return готово(recId);
}

/* ------------------------------ разбор возражения ------------------------------ */

/**
 * Исполнитель принимает базу Заказчика.
 *
 * Предложенная версия становится действующей, прежняя уходит в `superseded` —
 * не удаляется: по ней уже был посчитан эффект, и в акте должно быть видно, от
 * чего считали раньше. Кэш `effect_daily` удаляется целиком: каждые сутки в нём
 * посчитаны как разность с прежней базой, и «поправить» их нечем.
 */
export async function принятьБазу(
  recId: number, disputeId: number, _прошлый: ОтветФормы, _form: FormData,
): Promise<ОтветФормы> {
  const user = await currentUser();
  /* Ошибка возвращается в окно ПРИНЯТИЯ, а не отклонения: иначе на нажатие
     «Принять» открывается окно «Отклонить» с претензией, и человек читает
     ответ не на свой вопрос. */
  if (!user || user.side !== 'executor') {
    return вернуться('Разбирать возражение по базе может только Исполнитель.');
  }

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT d.state, d.proposed_baseline_id, r.status, i.closed_at,
             b.base_qzh, b.base_qn
      FROM rec.disputes d
      JOIN rec.recommendations r ON r.id = d.rec_id
      LEFT JOIN rec.implementations i ON i.rec_id = d.rec_id
      LEFT JOIN rec.baselines b ON b.id = d.proposed_baseline_id
      WHERE d.id = $1 AND d.rec_id = $2 AND d.subject = 'baseline'
      FOR UPDATE OF d
    `, [disputeId, recId]);

    const d = rows[0];
    if (!d) return 'Возражение не найдено.';
    if (d.state !== 'open') return 'Возражение уже рассмотрено. Обновите страницу.';
    if (!d.proposed_baseline_id) return 'К возражению не приложена предложенная версия базы.';
    if (d.closed_at || d.status === 'windowClosed') {
      return 'Окно закрыто: менять базу, по которой посчитан окончательный итог, уже нельзя.';
    }

    /* Прежние принятые версии закрываются все разом, а не «последняя»: если в
       базе почему-то оказалось две accepted, молча оставить одну хуже, чем
       закрыть обе. Действующей карточка считает последнюю accepted. */
    await client.query(`
      UPDATE rec.baselines SET status = 'superseded'
       WHERE rec_id = $1 AND status = 'accepted'
    `, [recId]);

    await client.query(`
      UPDATE rec.baselines SET status = 'accepted' WHERE id = $1
    `, [d.proposed_baseline_id]);

    /* Кэш посчитан по старой базе — сутки в нём неверны все до одного.
       Пересчёт произойдёт сам при следующем открытии вкладки. */
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
      `Базовые значения изменены по возражению Заказчика на Qж ${числоНаЭкран(Number(d.base_qzh))} м³/сут, `
      + `Qн ${числоНаЭкран(Number(d.base_qn))} т/сут, эффект пересчитан`]);

    return null;
  });

  if (ошибка) return вернуться(ошибка);
  return готово(recId);
}

/**
 * Исполнитель отклоняет возражение: действующая база остаётся, предложенная
 * версия уходит в `rejected` и остаётся в карточке — по ней видно, что именно
 * предлагал Заказчик и чем ему ответили.
 */
export async function отклонитьВозражениеПоБазе(
  recId: number, disputeId: number, _прошлый: ОтветФормы, form: FormData,
): Promise<ОтветФормы> {
  const обоснование = String(form.get('text') ?? '').trim();
  if (!обоснование) {
    return вернуться('Заполните обоснование.');
  }

  const user = await currentUser();
  if (!user || user.side !== 'executor') {
    return вернуться('Разбирать возражение по базе может только Исполнитель.');
  }

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query(`
      SELECT state, proposed_baseline_id FROM rec.disputes
       WHERE id = $1 AND rec_id = $2 AND subject = 'baseline'
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

    if (d.proposed_baseline_id) {
      await client.query(`
        UPDATE rec.baselines SET status = 'rejected' WHERE id = $1
      `, [d.proposed_baseline_id]);
    }

    await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, text)
      VALUES ($1,'dispute',$2,$3,'Возражение Заказчика по базовым значениям отклонено')
    `, [recId, user!.id, user!.fullName]);

    return null;
  });

  if (ошибка) return вернуться(ошибка);
  return готово(recId);
}

/* ------------------------------ внесение базы ------------------------------ */

const МАКС_ФАЙЛОВ = 5;
const МАКС_РАЗМЕР = 10 * 1024 * 1024;

const СПОСОБЫ = new Set(['techregime', 'threeDays', 'agreedPeriod']);
const СПОСОБЫ_ЭЭ = new Set(['factual', 'threeDays', 'design']);

/**
 * Внесение базовых значений Исполнителем.
 *
 * Раньше база вводилась в мастере регистрации. Место было неудачное сразу по
 * трём причинам, и все три — из договора: основной способ требует документа
 * утверждённого технологического режима, которого при регистрации может не
 * быть; трёхсуточный способ требует согласования Заказчика, которого на момент
 * регистрации нет по определению; а при ручном вводе фактических суток (первый
 * этап, без стенда ВМАП) данных за период базы ещё попросту не существует —
 * их некому было внести.
 *
 * Договор ставит только две границы: «определяются ДО МОМЕНТА РЕАЛИЗАЦИИ
 * рекомендации Исполнителя» и «после открытия окна подтверждения эффекта
 * изменению не подлежат, за исключением случаев выявления ошибок в исходных
 * данных либо по взаимному письменному согласованию Сторон». Отсюда три
 * режима, и определяет их СЕРВЕР по состоянию карточки, а не клиент:
 *
 *   окно не открыто — обычное внесение или замена;
 *   окно идёт       — исправление ошибки, обоснование обязательно;
 *   окно закрыто    — нельзя: итог финализирован, и это уже разбирательство по
 *                     разделу 10 договора, а не действие в модуле.
 */
export async function внестиБазу(
  recId: number, _прошлый: ОтветФормы, form: FormData,
): Promise<ОтветФормы> {
  const user = await currentUser();
  if (!user || user.side !== 'executor') {
    return вернуться('Вносить базовые значения может только Исполнитель.');
  }

  const qzh = числоИзФормы(form.get('base_qzh'));
  const qn = числоИзФормы(form.get('base_qn'));
  const ee = числоИзФормы(form.get('base_ee'));
  const method = String(form.get('method') ?? '');
  const methodEe = String(form.get('method_ee') ?? '');
  const безИзменений = String(form.get('no_regime_changes') ?? '') === 'on';
  const реквизиты = String(form.get('agreement_ref') ?? '').trim();
  const обоснование = String(form.get('note') ?? '').trim();

  if (qzh === null || Number.isNaN(qzh)) return вернуться('Укажите базовый дебит жидкости числом.');
  if (qn === null || Number.isNaN(qn)) return вернуться('Укажите базовый дебит нефти числом.');
  if (Number.isNaN(ee)) return вернуться('Энергопотребление указано не числом.');
  if (qzh! < 0 || qn! < 0 || (ee ?? 0) < 0) return вернуться('Базовые значения не могут быть отрицательными.');
  /* Та же грубая проверка, что и в возражении: нефть в тоннах, жидкость в
     кубометрах, и плотность нефти всегда меньше тонны на куб — превышение
     означает перепутанные местами поля. */
  if (qn! > qzh!) return вернуться('Дебит нефти больше дебита жидкости — проверьте, не перепутаны ли поля.');

  if (!СПОСОБЫ.has(method)) return вернуться('Выберите способ определения базы по договору.');
  if (method === 'techregime' && !безИзменений) {
    return вернуться('Технологический режим применим, только если изменений режима эксплуатации до регистрации не было. Подтвердите это или выберите другой способ.');
  }
  /* Иной расчётный период договор допускает лишь «по взаимному письменному
     соглашению Сторон» — значит документ существует, и его реквизиты должны
     быть записаны. О трёхсуточном способе договор говорит мягче, просто
     «(по согласованию с Заказчиком)», поэтому отсутствие согласования там не
     запрещает ввод, а остаётся видимым признаком в карточке. */
  if (method === 'agreedPeriod' && !реквизиты) {
    return вернуться('Иной расчётный период применяется по письменному соглашению Сторон — укажите его реквизиты.');
  }
  if (ee !== null && !СПОСОБЫ_ЭЭ.has(methodEe)) {
    return вернуться('Выберите, как определено базовое энергопотребление.');
  }

  const файлы = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (файлы.length > МАКС_ФАЙЛОВ) return вернуться(`К базе можно приложить не больше ${МАКС_ФАЙЛОВ} файлов.`);
  if (файлы.some((f) => f.size > МАКС_РАЗМЕР)) return вернуться('Размер каждого файла не должен превышать 10 МБ.');

  const ошибка = await transaction(async (client) => {
    const { rows } = await client.query<{
      status: string; closed_at: Date | null; window_open_at: Date | null;
    }>(`
      SELECT r.status, i.closed_at, i.window_open_at
      FROM rec.recommendations r
      LEFT JOIN rec.implementations i ON i.rec_id = r.id
      WHERE r.id = $1 AND r.deleted_at IS NULL
      FOR UPDATE OF r
    `, [recId]);
    const c = rows[0];
    if (!c) return 'Рекомендация не найдена.';
    if (c.closed_at) {
      return 'Окно эффекта закрыто, итог финализирован — база не пересматривается.';
    }

    const окноИдёт = Boolean(c.window_open_at);
    if (окноИдёт && !обоснование) {
      return 'Окно эффекта уже открыто. Договор допускает изменение базы только при выявлении ошибки в исходных данных или по соглашению Сторон — опишите основание.';
    }

    /* Хотя бы один файл-обоснование обязателен. Каждый договорный способ
       опирается на внешний документ: техрежим — на утверждённый режим месяца
       выдачи, иной период — на соглашение Сторон, расчёт ЭЭ — на выгрузку
       модуля Design. Число без документа в споре по разделу 10 не защитить, а
       на первом этапе, где значения берут руками, документ остаётся
       единственным основанием вообще.

       Проверяются и уже приложенные к прежней версии файлы: при исправлении
       описки в одном числе заново прикладывать тот же документ незачем. */
    const { rows: [{ n }] } = await client.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM rec.attachments a
      JOIN rec.baselines b ON b.id = a.baseline_id
      WHERE b.rec_id = $1
    `, [recId]);
    if (файлы.length === 0 && Number(n) === 0) {
      return 'Приложите хотя бы один файл-обоснование: документ режима, выгрузку замеров или соглашение Сторон.';
    }

    /* Прежняя действующая версия не удаляется, а замещается: по цепочке версий
       видно, от чего считался эффект до исправления, и на неё может ссылаться
       effect_daily.baseline_id. */
    await client.query(`
      UPDATE rec.baselines SET status = 'superseded'
      WHERE rec_id = $1 AND status = 'accepted'
    `, [recId]);

    const { rows: [{ id: baselineId }] } = await client.query<{ id: string }>(`
      INSERT INTO rec.baselines
        (rec_id, base_qzh, base_qn, base_ee, source, status,
         method, method_ee, no_regime_changes,
         customer_agreed_at, customer_agreed_by, agreement_ref,
         created_by, author_name, note)
      VALUES ($1,$2,$3,$4,'manual','accepted',$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id::text
    `, [recId, qzh, qn, ee, method, ee === null ? null : methodEe, безИзменений,
      реквизиты ? new Date() : null, реквизиты ? user.id : null,
      реквизиты || null, user.id, user.fullName, обоснование || null]);

    for (const файл of файлы) {
      const содержимое = Buffer.from(await файл.arrayBuffer());
      await client.query(`
        INSERT INTO rec.attachments
          (rec_id, baseline_id, file_name, mime_type, size_bytes, storage_key,
           uploaded_by, context, content)
        VALUES ($1,$2,$3,$4,$5,NULL,$6,'baseline',$7)
      `, [recId, Number(baselineId), файл.name, файл.type || null, файл.size,
        user.id, содержимое]);
    }

    await client.query(`
      INSERT INTO rec.recommendation_events (rec_id, kind, actor_id, actor_name, text)
      VALUES ($1,'baseline',$2,$3,$4)
    `, [recId, user.id, user.fullName,
      окноИдёт
        ? `Базовые значения исправлены при открытом окне: ${обоснование}`
        : 'Внесены базовые значения']);

    return null;
  });

  if (ошибка) return вернуться(ошибка);
  return готово(recId);
}
