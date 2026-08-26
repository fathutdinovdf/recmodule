/* Разовый импорт реального реестра рекомендаций взамен демо-данных.
 *
 * Источник — «Форма 2 Единый реестр мероприятий.xlsx» (выгрузка 26.08.2026,
 * 116 рекомендаций) и «Косынка ЛЗС.xlsx» (суточные факты по 90-суточным
 * окнам эффекта), разобранные заранее в JSON (см. app/BRIEF.md, раздел про
 * переход демо-стенда на реальные данные). Готовит только продовую БД —
 * локальный дев-ландшафт этим скриптом не трогают никогда.
 *
 * У 44 рекомендаций (+ №75, где «Косынка» прямо говорит «на согласовании»
 * вопреки статусу Формы 2) нет ни одной честной даты фактического внедрения
 * ни в одном источнике — окно эффекта им заводить нельзя (rec.implementations
 * требует fact_date NOT NULL). Такие заведены статусом approved
 * («Согласовано к реализации»), настоящий текст статуса ALMA сохранён
 * комментарием на карточке — дозаполнить дату вручную через интерфейс,
 * когда она станет известна.
 *
 * Запуск (по умолчанию — сухой прогон, ничего не пишет):
 *   node scripts/import-real-registry.mjs --recs=<path>
 *   node scripts/import-real-registry.mjs --recs=<path> --wipe-demo --apply
 *
 * Параметры подключения — как у остальных db:*-скриптов, через переменные
 * окружения PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD. Направлять на прод
 * нужно ЯВНО через них — скрипт не знает, где он выполняется.
 */

import { readFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const WIPE_DEMO = args.includes('--wipe-demo');
const argVal = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const recsPath = argVal('recs');
if (!recsPath) {
  console.error('нужен --recs=<путь к real-recommendations-final.json>');
  process.exit(1);
}

const РЕКОМЕНДАЦИИ = JSON.parse(readFileSync(recsPath, 'utf8'));

/* Та же нормализация номера, что в load-economy.mjs и seed-demo.mjs. */
function normWell(s) {
  let x = String(s ?? '').trim().toLowerCase().replace(/\s/g, '');
  for (const [lat, cyr] of [['a', 'а'], ['c', 'с'], ['e', 'е'], ['o', 'о'], ['p', 'р'],
    ['x', 'х'], ['k', 'к'], ['m', 'м'], ['t', 'т'], ['b', 'в'], ['h', 'н'], ['g', 'г']]) {
    x = x.split(lat).join(cyr);
  }
  return x;
}

/* Буквенные коды месторождений для номера рекомендации — тот же список,
 * что в scripts/seed-demo.mjs, ключ — истинное имя узла ВМАП (rec.ref_wells
 * .field_name), не упрощённая подпись Заказчика из Формы 2. */
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
  /* Упрощённые подписи Заказчика из Формы 2 — на случай, когда скважину
   * не удалось привязать к rec.ref_wells (см. resolveWell) и код берётся
   * прямо из текста реестра, а не из истинного имени узла ВМАП. */
  'Кустовое': 'КВ', 'Дружное': 'ДР',
};

const ПАРАМЕТР = { QZH_MEASURED: 1, WATERCUT: 7, EE_FACT: 93 };

/* Новые пользователи со стороны Заказчика — их нет в демо-наборе
 * (scripts/seed-demo.mjs), там только Гадаятов и Сафин. Пароль = логин,
 * как у всех остальных; параметры хеша — боевые (src/lib/password.ts),
 * не облегчённые демо-версии. */
const НОВЫЕ_ПОЛЬЗОВАТЕЛИ = [
  { login: 'yarashov', full_name: 'Ярашов Д.Р.', position: 'Технолог ЦДНГ', role_key: 'engineer', can_decide: true },
  { login: 'vasin', full_name: 'Васин Н.А.', position: 'Технолог ЦДНГ', role_key: 'engineer', can_decide: true },
  { login: 'chernyshov', full_name: 'Чернышов А.А.', position: 'Технолог ЦДНГ', role_key: 'engineer', can_decide: true },
  { login: 'arzhanikov', full_name: 'Аржаников А.Е.', position: 'Технолог ЦДНГ', role_key: 'engineer', can_decide: true },
];

function хешПароля(пароль) {
  const соль = randomBytes(16);
  const N = 2 ** 16, r = 8, p = 1;
  const хеш = scryptSync(пароль.normalize('NFKC'), соль, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${соль.toString('base64')}$${хеш.toString('base64')}`;
}

const client = new pg.Client({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5433),
  database: process.env.PGDATABASE ?? 'recmodule',
  user: process.env.PGUSER ?? 'recmodule',
  password: process.env.PGPASSWORD ?? 'recmodule',
});

await client.connect();

const предупреждения = [];

try {
  console.log(`== ${APPLY ? 'ПРИМЕНЯЮ' : 'СУХОЙ ПРОГОН'} на ${process.env.PGHOST ?? 'localhost'}:${process.env.PGPORT ?? 5433}/${process.env.PGDATABASE ?? 'recmodule'} ==`);

  /* ---------- справочник скважин ---------- */
  const { rows: refWells } = await client.query('SELECT * FROM rec.ref_wells');
  const поСкважине = new Map();
  const поКустуИЧислу = new Map();
  for (const w of refWells) {
    const k = `${normWell(w.kust)}|${normWell(w.well_number)}`;
    if (!поСкважине.has(k)) поСкважине.set(k, []);
    поСкважине.get(k).push(w);
    /* Числовой префикс номера без буквенного суффикса: Форма 2 местами
     * пишет скважину без литеры («129» вместо «129К», «184» вместо «184Р»),
     * а rec.ref_wells её хранит полностью. Вторая карта — запасной путь,
     * когда точного совпадения с суффиксом не нашлось. */
    const числоМатч = normWell(w.well_number).match(/^\d+/);
    if (числоМатч) {
      const k2 = `${normWell(w.kust)}|${числоМатч[0]}`;
      if (!поКустуИЧислу.has(k2)) поКустуИЧислу.set(k2, []);
      поКустуИЧислу.get(k2).push(w);
    }
  }
  function resolveWell(rec) {
    const k = `${normWell(rec.kust)}|${normWell(rec.well_number)}`;
    let candidates = поСкважине.get(k) ?? [];
    if (candidates.length === 0) {
      const числоМатч = normWell(rec.well_number).match(/^\d+/);
      if (числоМатч) {
        const k2 = `${normWell(rec.kust)}|${числоМатч[0]}`;
        candidates = поКустуИЧислу.get(k2) ?? [];
      }
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    return candidates.find((c) => c.field_name.includes(rec.field_name) || rec.field_name.includes(c.field_name))
      ?? candidates[0];
  }

  /* ---------- пользователи ---------- */
  const { rows: users } = await client.query('SELECT id, login FROM rec.users');
  const userId = new Map(users.map((u) => [u.login, u.id]));
  for (const u of НОВЫЕ_ПОЛЬЗОВАТЕЛИ) {
    if (userId.has(u.login)) continue;
    console.log(`новый пользователь: ${u.login} (${u.full_name})`);
    if (APPLY) {
      /* Тот же INSERT, что заведение пользователя из интерфейса
       * (src/app/users/actions.ts) — can_decide/only_own/side берутся из
       * rec.roles по role_key, а не проставляются руками. */
      const { rows } = await client.query(`
        INSERT INTO rec.users (login, full_name, position, role_key, can_decide, only_own, side, password_hash)
        SELECT $1, $2, $3, r.key, r.can_decide, r.only_own, r.side, $4 FROM rec.roles r WHERE r.key = $5
        RETURNING id
      `, [u.login, u.full_name, u.position, хешПароля(u.login), u.role_key]);
      userId.set(u.login, rows[0].id);
    } else {
      /* В сухом прогоне пользователя ещё нет — подставляем плейсхолдер,
       * чтобы дальнейший резолвинг «представитель заказчика» отработал так
       * же, как отработает после --apply, а не сыпал ложными «не найден». */
      userId.set(u.login, -1);
    }
  }
  const ИСПОЛНИТЕЛЬ_ЛОГИН = { 'Матросов': 'matrosov', 'Тевс': 'tevs', 'Аливердиев': 'aliverdiev' };
  const ЗАКАЗЧИК_ЛОГИН = {
    'Гадаятов Ф.Г': 'gadayatov', 'Ярашов Д.Р': 'yarashov', 'Васин Н.А': 'vasin',
    'Чернышов А.А': 'chernyshov', 'Аржаников А.Е': 'arzhanikov',
  };
  const adminId = userId.get('admin');

  if (WIPE_DEMO) {
    console.log('-- удаляю демо-данные (is_demo = true) --');
    if (APPLY) {
      await client.query('BEGIN');
      await client.query('DELETE FROM rec.recommendations WHERE is_demo');
      await client.query('DELETE FROM rec.claims WHERE is_demo');
      await client.query('DELETE FROM rec.daily_facts WHERE is_demo');
      await client.query('DELETE FROM rec.daily_fact_events WHERE is_demo');
      await client.query('DELETE FROM rec.number_counters');
      await client.query('COMMIT');
    }
  }

  if (APPLY) await client.query('BEGIN');

  const счётчики = new Map();
  async function номер(fieldName) {
    const код = БУКВЫ[fieldName] ?? 'XX';
    if (код === 'XX') предупреждения.push(`нет буквенного кода для месторождения «${fieldName}», использован XX`);
    const год = 2026 % 100;
    const ключ = `${код}-${год}`;
    const n = (счётчики.get(ключ) ?? 0) + 1;
    счётчики.set(ключ, n);
    if (APPLY) {
      await client.query(`
        INSERT INTO rec.number_counters (field_code, year, last_number) VALUES ($1,$2,$3)
        ON CONFLICT (field_code, year) DO UPDATE SET last_number = EXCLUDED.last_number
      `, [код, 2026, n]);
    }
    return `${код}-${год}-${String(n).padStart(4, '0')}`;
  }

  let создано = 0, безСкважины = 0, сОкном = 0, сКомментарием = 0;

  for (const r of РЕКОМЕНДАЦИИ) {
    /* Часть строк (АГЗУ, узлы учёта, скважины, которых нет в дампе
     * rec.ref_wells) не привязывается к конкретному объекту ВМАП — well_id
     * и field_id в схеме необязательны именно на этот случай (см. 001_init.sql,
     * «остальное денормализовано намеренно»). Рекомендацию всё равно заводим,
     * с текстом из Формы 2 как есть, а не пропускаем: пропуск потерял бы
     * реальную рекомендацию, только потому что справочник объектов неполон. */
    const found = resolveWell(r);
    const well = found ?? {
      well_id: null, field_id: null,
      well_number: r.well_number, kust: r.kust, field_name: r.field_name,
    };
    if (!found) {
      предупреждения.push(`ID${r.id}: скважина не найдена в rec.ref_wells (куст ${r.kust}, скважина ${r.well_number}, месторождение «${r.field_name}») — заведена без привязки к объекту ВМАП`);
      безСкважины++;
    }

    const executorLogin = ИСПОЛНИТЕЛЬ_ЛОГИН[r.executor_raw];
    const executorId = executorLogin ? userId.get(executorLogin) : null;
    if (r.executor_raw && !executorId) предупреждения.push(`ID${r.id}: исполнитель «${r.executor_raw}» не найден в rec.users`);

    const number = await номер(well.field_name);

    let recId = null;
    if (APPLY) {
      const { rows } = await client.query(`
        INSERT INTO rec.recommendations
          (number, status, direction_id, priority, well_id, well_number, kust, field_id, field_name,
           problem, action, rationale, completeness, author_id, executor_id,
           registered_at, sent_at, due_at, is_demo, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,false,now(),now())
        RETURNING id
      `, [
        number, r.status_code, r.direction_id, r.priority,
        well.well_id, well.well_number, well.kust, well.field_id, well.field_name,
        r.problem ?? '(не указано)', r.action ?? '(не указано)', r.rationale,
        r.completeness, executorId, executorId,
        r.form_date, r.sent_at, r.expected_reply_by,
      ]);
      recId = rows[0].id;

      await client.query(`
        INSERT INTO rec.recommendation_events (rec_id, at, kind, actor_id, actor_name, to_status, text)
        VALUES ($1, now(), 'imported', $2, 'Импорт реестра', $3, $4)
      `, [recId, adminId, r.status_code,
        `Перенесено из «Форма 2 Единый реестр мероприятий» (ID ${r.id} в исходном реестре, статус ALMA «${r.status_raw ?? '—'}»).`]);
    }
    создано++;

    /* ---------- решение заказчика ---------- */
    if (r.decision_kind) {
      const custKey = (r.customer_raw ?? '').replace(/[,.]$/, '').trim();
      const actorLogin = ЗАКАЗЧИК_ЛОГИН[custKey];
      const actorId = actorLogin ? userId.get(actorLogin) : null;
      if (r.customer_raw && !actorId) предупреждения.push(`ID${r.id}: представитель заказчика «${r.customer_raw}» не найден`);
      if (APPLY && actorId) {
        await client.query(`
          INSERT INTO rec.decisions (rec_id, at, kind, actor_id, actor_name, reason_text, comment)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [recId, r.replied_at ?? r.sent_at ?? r.form_date, r.decision_kind, actorId,
          r.customer_raw, r.decision_rationale, r.decision_rationale]);
      }
    }

    /* ---------- окно эффекта ---------- */
    if (r.implementation) {
      сОкном++;
      const impl = r.implementation;
      if (APPLY) {
        await client.query(`
          INSERT INTO rec.implementations
            (rec_id, fact_date, fixed_by, fixed_by_name, window_open_at, window_close_at, note)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [recId, impl.fact_date, executorId, r.executor_raw ?? 'Импорт реестра',
          impl.window_open_at, impl.window_close_at,
          'Дата и суточные значения — из файла «Косынка ЛЗС.xlsx» (снимок на 26.08.2026).']);

        await client.query(`
          INSERT INTO rec.baselines (rec_id, base_qzh, base_qn, base_ee, source, created_by, author_name, note)
          VALUES ($1,$2,$3,$4,'measured',$5,$6,$7)
        `, [recId, impl.base_qzh, impl.base_qn, impl.base_ee, adminId, 'Импорт реестра',
          'База — колонка «База» из «Косынка ЛЗС.xlsx».']);

        const серии = [
          [ПАРАМЕТР.QZH_MEASURED, impl.daily_qzh],
          [ПАРАМЕТР.WATERCUT, impl.daily_watercut],
          [ПАРАМЕТР.EE_FACT, impl.daily_ee],
        ];
        for (const [parameterId, byDate] of серии) {
          if (!byDate) continue;
          for (const [date, value] of Object.entries(byDate)) {
            if (value === null || value === undefined) continue;
            await client.query(`
              INSERT INTO rec.daily_facts (well_id, parameter_id, date, value, entered_by)
              VALUES ($1,$2,$3,$4,$5)
              ON CONFLICT (well_id, parameter_id, date) DO UPDATE SET value = EXCLUDED.value
            `, [well.well_id, parameterId, date, value, adminId]);
            await client.query(`
              INSERT INTO rec.daily_fact_events (well_id, parameter_id, date, old_value, new_value, actor_id, actor_name, rec_id)
              VALUES ($1,$2,$3,NULL,$4,$5,'Импорт реестра',$6)
            `, [well.well_id, parameterId, date, value, adminId, recId]);
          }
        }
      }
    }

    /* ---------- комментарий: понижен статус или есть текст в реестре ---------- */
    const текстКомментария = [
      r.alma_status_note ? `Статус ALMA в исходном реестре: «${r.alma_status_note}». Дата фактического внедрения неизвестна — окно эффекта не открыто, требуется уточнить и дозаполнить вручную.` : null,
      r.comment ? `Комментарий из реестра: ${r.comment}` : null,
    ].filter(Boolean).join('\n\n');
    if (текстКомментария) {
      сКомментарием++;
      if (APPLY) {
        await client.query(`
          INSERT INTO rec.comments (rec_id, author_id, author_name, text)
          VALUES ($1,$2,'Импорт реестра',$3)
        `, [recId, adminId, текстКомментария]);
      }
    }
  }

  if (APPLY) await client.query('COMMIT');

  console.log(`\nсоздано: ${создано}, из них без привязки к скважине ВМАП: ${безСкважины}`);
  console.log(`с окном эффекта: ${сОкном}, с комментарием: ${сКомментарием}`);
  if (предупреждения.length) {
    console.log(`\nпредупреждения (${предупреждения.length}):`);
    for (const w of предупреждения) console.log(' -', w);
  }
  if (!APPLY) console.log('\nЭто был сухой прогон — ничего не записано. Добавьте --apply для реальной записи.');
} catch (e) {
  if (APPLY) await client.query('ROLLBACK').catch(() => {});
  throw e;
} finally {
  await client.end();
}
