/* Наполнение базы демонстрационным набором.
 *
 * Набор строится ОТНОСИТЕЛЬНО текущего момента, а не от зашитой даты: на
 * дев-версии должны быть настоящие дата и время. Чтобы набор не протухал,
 * в rec.demo_state кладётся якорь, а скрипт refresh-demo потом сдвигает все
 * даты на разницу между якорем и сегодняшним днём.
 *
 * Две вещи, которые пришлось учесть в датах.
 *
 * Услуги по договору идут с 01.07.2026, поэтому рекомендаций раньше этой даты
 * быть не может. Отсюда следствие: окно эффекта в 90 суток, открытое в
 * пределах договора, к сегодняшнему дню закрыться само ещё не успело. Статус
 * «Закрыто окно» получают те рекомендации, у которых окно закрыто ДОСРОЧНО, —
 * это штатное действие, а не натяжка.
 *
 * Скважины для окон эффекта берутся не любые, а те, по которым на стенде есть
 * замеры и заведена плотность нефти: иначе расчёт эффекта окажется пустым
 * ровно там, где он нужнее всего.
 *
 * Запуск: node scripts/seed-demo.mjs
 */

import { readFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const здесь = dirname(fileURLToPath(import.meta.url));
const скважины = JSON.parse(readFileSync(join(здесь, 'wells-with-data.json'), 'utf8'));

/* Детерминированный генератор: один и тот же набор при каждом запуске.
   Иначе скриншоты, номера в переписке и заведённые вручную примеры
   разъезжаются при каждом пересоздании базы. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260814);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const НАЧАЛО_ДОГОВОРА = new Date('2026-07-01T09:00:00');

/* Роли демо-набора покрывают все ветки интерфейса: два эксперта (у них
   рекомендации именные), руководитель АКЭ с правом на экономику, инженер
   Заказчика с правом решения, руководитель Заказчика и технолог без права
   решения. Сторону договора проставит триггер по роли — здесь она не задаётся.

   Пароль у всех совпадает с логином. Это демонстрационный набор: он
   пересоздаётся целиком и живёт только на стенде разработки. */
const ПОЛЬЗОВАТЕЛИ = [
  { login: 'matrosov', full_name: 'Матросов А.В.', position: 'Эксперт по механизированному фонду', role: 'expert', can_decide: false, can_edit_economy: false },
  { login: 'aliverdiev', full_name: 'Аливердиев Э.А.', position: 'Руководитель проекта, АКЭ', role: 'expertLead', can_decide: false, can_edit_economy: true },
  { login: 'tevs', full_name: 'Тевс И.О.', position: 'Эксперт по механизированному фонду', role: 'expert', can_decide: false, can_edit_economy: false },
  { login: 'gadayatov', full_name: 'Гадаятов Ф.Г.', position: 'Ведущий технолог ЦДНГ', role: 'engineer', can_decide: true, can_edit_economy: false },
  { login: 'safin', full_name: 'Сафин Р.М.', position: 'Начальник технологического отдела', role: 'customerLead', can_decide: true, can_edit_economy: false },
  /* Наблюдатель Заказчика — это инженер без права решения, а не своя роль
     (решение 89): карточку он видит целиком, не хватает только кнопок. */
  { login: 'shakirov', full_name: 'Шакиров И.Р.', position: 'Технолог', role: 'engineer', can_decide: false, can_edit_economy: false },
  /* Администратор модуля: рекомендаций у него не бывает (решение 82), но без
     него не открыть экран «Пользователи и роли» — он там единственный, кому
     этот экран показывают. */
  { login: 'admin', full_name: 'Фатхутдинов Д.Ф.', position: 'Администратор модуля', role: 'admin', can_decide: false, can_edit_economy: false },
];

/* Тот же формат хеша, что в src/lib/password.ts. Продублирован намеренно:
   скрипты сборки демо на TypeScript не собираются, а тащить ради одной
   функции сборщик — дороже пяти строк. Параметры облегчены (N=2^14): демо
   пересоздаётся часто, и шесть паролей по 100 мс на каждом прогоне заметны. */
function хешПароля(пароль) {
  const соль = randomBytes(16);
  const N = 2 ** 14, r = 8, p = 1;
  const хеш = scryptSync(пароль.normalize('NFKC'), соль, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${соль.toString('base64')}$${хеш.toString('base64')}`;
}

const ПРОБЛЕМЫ = [
  'Снижение дебита жидкости', 'Рост обводнённости', 'Работа насоса вне рабочей зоны НРХ',
  'Повышенное удельное энергопотребление', 'Частые внутрисменные простои',
  'Снижение динамического уровня', 'Отклонение подачи от режимной',
  'Работа в периодическом режиме с низким КЭ', 'Солеотложение в НКТ',
  'Повышенный ток двигателя', 'Отклонение давления на приёме',
  'Снижение коэффициента подачи', 'Незапланированный останов по ЗСП',
];

const МЕРОПРИЯТИЯ = [
  'Контрольная Ндин с последующей корректировкой частоты вращения.',
  'Вывод насоса в рабочую зону НРХ снижением частоты на 2 Гц.',
  'Оптимизация программы периодического режима: пересмотр времени накопления.',
  'Смена ГНО на типоразмер меньшей подачи.',
  'Промывка НКТ растворителем с последующим контролем давления на приёме.',
  'Корректировка уставок ЗСП по току и давлению приёма.',
  'Перевод на непрерывный режим работы с контролем динамического уровня.',
];

const ОБОСНОВАНИЯ = [
  'По телеметрии за последние 14 суток дебит снизился на 12 % при неизменной частоте. Насос работает левее рабочей зоны, что подтверждается расчётом физической модели.',
  'Удельное энергопотребление превышает норматив по фонду на 18 %. Снижение частоты выводит насос в рабочую зону без потери дебита.',
  'Динамический уровень стабильно выше расчётного, приток недоиспользуется. Расчёт показывает потенциал прироста.',
  'Число внутрисменных простоев выросло вдвое за месяц. Причина — некорректные уставки ЗСП.',
  'Тренд давления на приёме указывает на образование отложений в НКТ.',
];

const ПРИЧИНЫ_ОТКАЗА = [
  'Скважина в плане ГТМ на ближайший месяц',
  'Мероприятие выполнялось ранее, эффект не подтвердился',
  'Технически невыполнимо на текущем оборудовании',
];

const ЗАПРОСЫ_УТОЧНЕНИЯ = [
  'Требуется расчёт ожидаемого эффекта с учётом текущей обводнённости.',
  'Не приложен график динамического уровня за период наблюдения.',
  'Уточните, учитывалось ли плановое отключение ППД на кусте.',
];

/* Сколько рекомендаций какого статуса. Набор подобран так, чтобы на экране
   были видны все состояния, включая редкие: без черновиков и отменённых
   реестр выглядел бы стерильным, а именно на них проверяются фильтры. */
const РАСКЛАД = [
  ['draft', 4], ['registered', 6], ['sent', 8], ['review', 7], ['clarify', 5],
  ['approved', 9], ['windowOpen', 12], ['windowClosed', 6], ['rejected', 5], ['cancelled', 3],
];

const client = new pg.Client({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5433),
  database: process.env.PGDATABASE ?? 'recmodule',
  user: process.env.PGUSER ?? 'recmodule',
  password: process.env.PGPASSWORD ?? 'recmodule',
});

/** Рабочее окно пн–пт 09:00–00:00 по Когалыму: передача Заказчику происходит
 *  только внутри него. Всё, что зарегистрировано вне окна, ждёт его открытия. */
function вРабочееОкно(d) {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  if (x.getHours() < 9) x.setHours(9, int(0, 55), 0, 0);
  return x;
}

function плюсЧасов(d, h) {
  const x = new Date(d);
  x.setHours(x.getHours() + h);
  return x;
}

function плюсСуток(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const день = (d) => d.toISOString().slice(0, 10);

await client.connect();

try {
  await client.query('BEGIN');

  /* Демо пересоздаётся целиком: записи, сделанные руками в интерфейсе, не
     помечены is_demo и не трогаются. */
  await client.query('DELETE FROM rec.recommendations WHERE is_demo');
  await client.query('DELETE FROM rec.claims WHERE is_demo');
  await client.query('DELETE FROM rec.number_counters');

  /* ---------- пользователи ---------- */
  const userId = new Map();
  for (const u of ПОЛЬЗОВАТЕЛИ) {
    const { rows } = await client.query(`
      INSERT INTO rec.users (login, full_name, position, role_key, can_decide, can_edit_economy,
                             only_own, password_hash, side)
      SELECT $1,$2,$3,$4,$5,$6, ro.only_own, $7, ro.side FROM rec.roles ro WHERE ro.key = $4
      ON CONFLICT (login) DO UPDATE SET full_name = EXCLUDED.full_name,
        position = EXCLUDED.position, role_key = EXCLUDED.role_key,
        can_decide = EXCLUDED.can_decide, can_edit_economy = EXCLUDED.can_edit_economy,
        only_own = EXCLUDED.only_own, password_hash = EXCLUDED.password_hash
      RETURNING id
    `, [u.login, u.full_name, u.position, u.role, u.can_decide, u.can_edit_economy,
      хешПароля(u.login)]);
    userId.set(u.login, rows[0].id);
  }

  /* Зона ответственности: у технолога — три месторождения, у начальника отдела
     и у Исполнителя зона пустая, что означает «все». */
  await client.query('DELETE FROM rec.user_fields');
  const зона = [...new Set(скважины.slice(0, 12).map((w) => `${w.field_id}|${w.field}`))].slice(0, 3);
  for (const пара of зона) {
    const [fid, fname] = пара.split('|');
    for (const login of ['gadayatov', 'shakirov']) {
      await client.query(
        'INSERT INTO rec.user_fields (user_id, field_id, field_name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [userId.get(login), Number(fid), fname]);
    }
  }

  const исполнители = ['matrosov', 'tevs'].map((l) => userId.get(l));
  const решающие = ['gadayatov', 'safin'];

  /* ---------- рекомендации ---------- */
  const сейчас = new Date();
  const коды = JSON.parse(readFileSync(join(здесь, '..', '..', 'вмап.json'), 'utf8'));
  const кодПоля = new Map();
  for (const f of коды.fields) кодПоля.set(f.id, f.code ?? null);

  /* Буквенные коды для номера рекомендации. В ВМАП код числовой и у четырёх
     Южно-Ягунских общий, поэтому берём тот же список, что в макете. */
  const БУКВЫ = {
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

  const счётчики = new Map();
  async function номер(fieldName) {
    const код = БУКВЫ[fieldName] ?? 'XX';
    const год = сейчас.getFullYear() % 100;
    const ключ = `${код}-${год}`;
    const n = (счётчики.get(ключ) ?? 0) + 1;
    счётчики.set(ключ, n);
    await client.query(`
      INSERT INTO rec.number_counters (field_code, year, last_number) VALUES ($1,$2,$3)
      ON CONFLICT (field_code, year) DO UPDATE SET last_number = EXCLUDED.last_number
    `, [код, сейчас.getFullYear(), n]);
    return `${код}-${год}-${String(n).padStart(4, '0')}`;
  }

  const нормативы = { I: 4, II: 8, III: 24 };
  let создано = 0;
  let сОкном = 0;
  let индексСкважины = 0;

  for (const [статус, сколько] of РАСКЛАД) {
    for (let i = 0; i < сколько; i++) {
      /* Для окон эффекта берём скважины по порядку из списка «с замерами»:
         так у каждой рекомендации с окном будет что показать в расчёте. */
      const скв = скважины[индексСкважины % скважины.length];
      индексСкважины++;

      /* Приоритет есть и у черновика: он часть содержания рекомендации, его
         выбирают при составлении, а не при регистрации. Без него черновик
         невозможно зарегистрировать — норматив ответа брать неоткуда. */
      const приоритет = pick(['I', 'II', 'III']);
      const направление = int(1, 6);
      const автор = pick(исполнители);

      /* Момент регистрации. Разный по статусам: свежие статусы — недавние
         записи, окна эффекта — те, что успели пройти путь. */
      let сутокНазад;
      if (статус === 'draft') сутокНазад = int(0, 3);
      else if (статус === 'registered') сутокНазад = int(0, 1);
      else if (статус === 'sent' || статус === 'review') сутокНазад = int(0, 2);
      else if (статус === 'clarify') сутокНазад = int(3, 9);
      else if (статус === 'approved') сутокНазад = int(5, 20);
      else if (статус === 'windowOpen') сутокНазад = int(20, 40);
      else if (статус === 'windowClosed') сутокНазад = int(30, 44);
      else сутокНазад = int(4, 30);

      let regDate = плюсСуток(сейчас, -сутокНазад);
      if (regDate < НАЧАЛО_ДОГОВОРА) regDate = new Date(НАЧАЛО_ДОГОВОРА);
      regDate.setHours(int(9, 20), int(0, 55), 0, 0);
      regDate = вРабочееОкно(regDate);
      /* Час дня разыгрывается независимо от даты, и у сегодняшних записей он
         легко оказывается позже текущего момента — в реестре появлялась
         рекомендация, зарегистрированная «сегодня в 17:34», когда на часах
         11:05. Отодвигаем такие на пару часов назад. */
      if (regDate > сейчас) regDate = плюсЧасов(сейчас, -int(1, 3));

      const черновик = статус === 'draft';
      const num = черновик ? null : await номер(скв.field);

      const sentAt = черновик || статус === 'registered' ? null : плюсЧасов(regDate, int(1, 6));
      const dueAt = sentAt ? плюсЧасов(sentAt, нормативы[приоритет]) : null;

      const { rows } = await client.query(`
        INSERT INTO rec.recommendations
          (number, status, direction_id, priority, well_id, well_number, kust,
           field_id, field_name, problem, action, rationale,
           expect_qzh, expect_qn, expect_ee, author_id, executor_id,
           registered_at, sent_at, due_at, is_demo, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,true,$18,$18)
        RETURNING id
      `, [num, статус, направление, приоритет,
        скв.well_id, скв.name, скв.kust, скв.field_id, скв.field,
        pick(ПРОБЛЕМЫ), pick(МЕРОПРИЯТИЯ), pick(ОБОСНОВАНИЯ),
        +(2 + rnd() * 16).toFixed(2), +(1 + rnd() * 6).toFixed(2), int(-400, 300),
        автор, автор, regDate, sentAt, dueAt]);

      const recId = rows[0].id;
      создано++;

      const событие = async (at, kind, actorId, actorName, from, to, text) =>
        client.query(`
          INSERT INTO rec.recommendation_events (rec_id, at, kind, actor_id, actor_name, from_status, to_status, text)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [recId, at, kind, actorId, actorName, from, to, text]);

      const имяАвтора = ПОЛЬЗОВАТЕЛИ.find((u) => userId.get(u.login) === автор).full_name;
      if (!черновик) {
        await событие(regDate, 'status', автор, имяАвтора, null, 'registered', 'Рекомендация зарегистрирована');
      }
      if (sentAt) await событие(sentAt, 'status', автор, имяАвтора, 'registered', 'sent', 'Передано Заказчику');

      /* ---------- базовые значения ----------
         База вводится Исполнителем при регистрации. Дальше Заказчик вправе её
         оспорить — для этого она и хранится версиями, а не полями.

         Числа здесь — заглушка, и намеренно: генератор набора не ходит на стенд
         Заказчика и работает без сети. Настоящую базу по замерам ставит
         scripts/rebase-demo.mjs — его надо запускать сразу после seed, иначе
         база не связана с фактическим дебитом и эффект получается диким. */
      if (!черновик) {
        await client.query(`
          INSERT INTO rec.baselines (rec_id, base_qzh, base_qn, base_ee, source,
                                     period_from, period_to, status, created_at, created_by, author_name, note)
          VALUES ($1,$2,$3,$4,'manual',$5,$6,'accepted',$7,$8,$9,$10)
        `, [recId, +(5 + rnd() * 40).toFixed(3), +(2 + rnd() * 18).toFixed(3), int(300, 900),
          день(плюсСуток(regDate, -7)), день(плюсСуток(regDate, -1)), regDate, автор, имяАвтора,
          'Заглушка: настоящая база ставится скриптом rebase-demo по замерам ВМАП.']);
      }

      /* ---------- решения ---------- */
      const решающийLogin = pick(решающие);
      const решающий = userId.get(решающийLogin);
      const имяРешающего = ПОЛЬЗОВАТЕЛИ.find((u) => u.login === решающийLogin).full_name;

      if (статус === 'review' && sentAt) {
        /* Тот же текст и вид события, что у реального открытия карточки
           (`отметитьОткрытие` в actions.ts) — иначе демо и живая история
           называют один и тот же переход sent→review по-разному. */
        await событие(плюсЧасов(sentAt, 1), 'opened', решающий, имяРешающего, 'sent', 'review', 'Карточка открыта Заказчиком');
      }

      if (статус === 'clarify' && sentAt) {
        const at = плюсЧасов(sentAt, int(1, 3));
        await client.query(`
          INSERT INTO rec.decisions (rec_id, at, kind, actor_id, actor_name, reason_text, comment, sla_spent)
          VALUES ($1,$2,'clarify',$3,$4,$5,$5,$6)
        `, [recId, at, решающий, имяРешающего, pick(ЗАПРОСЫ_УТОЧНЕНИЯ), int(1, 3)]);
        await событие(at, 'decision', решающий, имяРешающего, 'review', 'clarify', 'Запрошено уточнение');
      }

      if (['approved', 'windowOpen', 'windowClosed'].includes(статус) && sentAt) {
        const at = плюсЧасов(sentAt, int(1, 5));
        await client.query(`
          INSERT INTO rec.decisions (rec_id, at, kind, actor_id, actor_name, comment, planned_at, sla_spent)
          VALUES ($1,$2,'accept',$3,$4,$5,$6,$7)
        `, [recId, at, решающий, имяРешающего,
          'Согласовано, работы включены в план.', день(плюсСуток(at, int(1, 5))), int(1, 4)]);
        await событие(at, 'decision', решающий, имяРешающего, 'review', 'approved', 'Согласовано к реализации');
      }

      if (статус === 'rejected' && sentAt) {
        const at = плюсЧасов(sentAt, int(1, 6));
        await client.query(`
          INSERT INTO rec.decisions (rec_id, at, kind, actor_id, actor_name, reason_text, comment, sla_spent)
          VALUES ($1,$2,'reject',$3,$4,$5,$6,$7)
        `, [recId, at, решающий, имяРешающего, pick(ПРИЧИНЫ_ОТКАЗА),
          'Мероприятие не принимается, обоснование направлено Исполнителю.', int(1, 5)]);
        await событие(at, 'decision', решающий, имяРешающего, 'review', 'rejected', 'Отклонено');
      }

      if (статус === 'cancelled') {
        await событие(плюсЧасов(regDate, int(2, 30)), 'status', автор, имяАвтора,
          'registered', 'cancelled', 'Отменено Исполнителем: скважина выведена в ремонт');
      }

      /* ---------- реализация и окно эффекта ---------- */
      if (статус === 'windowOpen' || статус === 'windowClosed') {
        const factDate = плюсСуток(regDate, int(2, 6));
        const openAt = factDate;
        const closeAt = плюсСуток(openAt, 90);
        const полнота = rnd() < 0.25 ? 'partial' : 'full';

        /* Окно на 90 суток, открытое в пределах договора, само закрыться ещё не
           успело: договор начался 01.07. Поэтому «Закрыто окно» — это досрочное
           закрытие, штатное действие Исполнителя, а не истёкший срок. */
        const закрытоДосрочно = статус === 'windowClosed';
        const closedAt = закрытоДосрочно ? плюсСуток(factDate, int(20, 35)) : null;

        await client.query(`
          INSERT INTO rec.implementations
            (rec_id, fact_date, fixed_at, fixed_by, fixed_by_name, note,
             window_open_at, window_close_at, closed_at, closed_early)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [recId, день(factDate), плюсЧасов(factDate, int(6, 40)), автор, имяАвтора,
          /* Примечание к фиксации — про телеметрию, а не про полноту: перечень
             невыполненного лежит в completeness_note, и два текста об одном и
             том же в карточке читались бы как дубль. */
          'Смена режима видна по частоте и давлению на приёме с начала суток.',
          день(openAt), день(closeAt), closedAt, закрытоДосрочно]);

        /* Перечень невыполненного — отдельное поле рекомендации, а не примечание
           к фиксации: на него смотрят при разборе недобора эффекта, и в карточке
           оно показывается заголовком «Что не выполнено». */
        await client.query(`
          UPDATE rec.recommendations SET completeness = $2, completeness_note = $3 WHERE id = $1
        `, [recId, полнота, полнота === 'partial'
          ? 'Частота выведена не до рекомендованной: 47 Гц вместо 50. Ревизия устьевой арматуры не проводилась.'
          : null]);

        await событие(плюсЧасов(factDate, 8), 'fact', автор, имяАвтора, 'approved', 'windowOpen',
          'Зафиксирована реализация, открыто окно подтверждения эффекта');
        if (closedAt) {
          await событие(closedAt, 'status', автор, имяАвтора, 'windowOpen', 'windowClosed',
            'Окно закрыто досрочно, эффект зафиксирован');
        }
        сОкном++;

        /* Спор Заказчика — примерно у каждой шестой рекомендации с окном.
           Предмет разный: у одних дата реализации, у других базовые значения. */
        if (rnd() < 0.18 && !закрытоДосрочно) {
          const предметДата = rnd() < 0.5;
          if (предметДата) {
            await client.query(`
              INSERT INTO rec.disputes (rec_id, subject, opened_at, opened_by, opened_by_name,
                                        reason, proposed_date, state)
              VALUES ($1,'fact_date',$2,$3,$4,$5,$6,'open')
            `, [recId, плюсСуток(factDate, int(2, 6)), решающий, имяРешающего,
              'Работы выполнены позже: бригада заехала на двое суток позднее указанной даты.',
              день(плюсСуток(factDate, 2))]);
          } else {
            const { rows: b } = await client.query(`
              INSERT INTO rec.baselines (rec_id, base_qzh, base_qn, base_ee, source,
                                         status, created_at, created_by, author_name, note)
              VALUES ($1,$2,$3,$4,'disputed','proposed',$5,$6,$7,$8) RETURNING id
            `, [recId, +(6 + rnd() * 38).toFixed(3), +(2.5 + rnd() * 16).toFixed(3), int(300, 900),
              плюсСуток(factDate, int(3, 8)), решающий, имяРешающего,
              'База завышена: в расчёт попали сутки после промывки.']);
            await client.query(`
              INSERT INTO rec.disputes (rec_id, subject, opened_at, opened_by, opened_by_name,
                                        reason, proposed_baseline_id, state)
              VALUES ($1,'baseline',$2,$3,$4,$5,$6,'open')
            `, [recId, плюсСуток(factDate, int(3, 8)), решающий, имяРешающего,
              'Базовый дебит определён по периоду, в который скважина работала после промывки. Просим пересчитать по семи суткам до неё.',
              b[0].id]);
          }
        }
      }

      /* ---------- обсуждение ---------- */
      if (!черновик && rnd() < 0.45) {
        await client.query(`
          INSERT INTO rec.comments (rec_id, at, author_id, author_name, text)
          VALUES ($1,$2,$3,$4,$5)
        `, [recId, плюсЧасов(regDate, int(2, 40)), решающий, имяРешающего,
          pick(['Принято в работу, уточним сроки у мастера по добыче.',
            'Прошу приложить график Ндин за период наблюдения.',
            'Согласовано с ЦДНГ, работы на этой неделе.'])]);
      }
    }
  }

  /* ---------- якорь демо-набора ---------- */
  await client.query(`
    INSERT INTO rec.demo_state (id, anchor, shifted_at) VALUES (1, $1, now())
    ON CONFLICT (id) DO UPDATE SET anchor = EXCLUDED.anchor, shifted_at = now(), total_shift_days = 0
  `, [сейчас]);

  await client.query('COMMIT');

  console.log(`пользователей: ${ПОЛЬЗОВАТЕЛИ.length}`);
  console.log(`рекомендаций: ${создано}, из них с окном эффекта: ${сОкном}`);
  console.log(`якорь набора: ${сейчас.toLocaleString('ru-RU')}`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
