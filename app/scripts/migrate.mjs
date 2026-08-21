/* Применение миграций.
 *
 * До сих пор их накатывали psql-ом руками, и на этом уже наступили дважды:
 * повторный прогон падал на `ADD COLUMN` посреди файла, а параллельные ветки
 * дважды заняли один и тот же номер. Оба случая — про одно: нигде не было
 * записано, что уже применено.
 *
 * Теперь записано — в `rec.schema_migrations`. Правила простые:
 *
 *   • файлы применяются по возрастанию имени, каждый в своей транзакции:
 *     упавший файл откатывается целиком и не оставляет половину схемы;
 *   • применённый файл больше не трогается;
 *   • у применённого запоминается контрольная сумма — правка миграции после
 *     применения меняет схему у того, кто накатит позже, и не меняет ни у
 *     кого, кто накатил раньше. Это ловится и говорится вслух.
 *
 * Запуск:
 *   node scripts/migrate.mjs            применить новое
 *   node scripts/migrate.mjs --dry      только показать, что применилось бы
 *   node scripts/migrate.mjs --baseline записать все файлы применёнными,
 *                                       ничего не выполняя
 *   node scripts/migrate.mjs --mark 010_daily_fact_log.sql
 *                                       то же для одного файла
 *
 * `--baseline` нужен ровно один раз на существующей базе: схема в ней уже
 * есть, а журнала ещё нет, и без отметки раннер попытался бы создать всё
 * заново. `--mark` — для миграции из чужой ветки, которую накатили руками до
 * появления раннера: она в базе есть, файла в этой ветке нет.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const здесь = dirname(fileURLToPath(import.meta.url));
const папка = join(здесь, '..', 'db', 'migrations');

/* Скрипты запускаются голым node, а он .env.local не читает — в отличие от
   Next, которому этот файл подкладывает окружение сам. */
const файлОкружения = join(здесь, '..', '.env.local');
const env = existsSync(файлОкружения)
  ? Object.fromEntries(readFileSync(файлОкружения, 'utf8').split('\n')
    .filter((s) => s.includes('=') && !s.trim().startsWith('#'))
    .map((s) => [s.slice(0, s.indexOf('=')).trim(), s.slice(s.indexOf('=') + 1).trim()]))
  : process.env;

const client = new pg.Client({
  host: env.PGHOST ?? 'localhost',
  port: Number(env.PGPORT ?? 5433),
  database: env.PGDATABASE ?? 'recmodule',
  user: env.PGUSER ?? 'recmodule',
  password: env.PGPASSWORD ?? 'recmodule',
});

const аргументы = process.argv.slice(2);
const режим = {
  dry: аргументы.includes('--dry'),
  baseline: аргументы.includes('--baseline'),
  mark: аргументы[аргументы.indexOf('--mark') + 1] ?? null,
};
if (!аргументы.includes('--mark')) режим.mark = null;

const сумма = (текст) => createHash('sha256').update(текст).digest('hex').slice(0, 16);
const файлы = readdirSync(папка).filter((f) => f.endsWith('.sql')).sort();

await client.connect();
try {
  /* Журнал живёт в схеме модуля и создаётся вне транзакции миграций: он
     нужен раньше, чем первая из них. */
  await client.query(`
    CREATE TABLE IF NOT EXISTS rec.schema_migrations (
      name       text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      -- Отмечена без выполнения: схема уже была, файл накатывали руками.
      baselined  boolean NOT NULL DEFAULT false
    )`);

  const { rows } = await client.query('SELECT name, checksum, baselined FROM rec.schema_migrations');
  const применено = new Map(rows.map((r) => [r.name, r]));

  if (режим.mark) {
    if (!файлы.includes(режим.mark)) throw new Error(`нет файла ${режим.mark}`);
    await отметить(режим.mark);
    console.log(`отмечена без выполнения: ${режим.mark}`);
  } else if (режим.baseline) {
    let n = 0;
    for (const f of файлы) if (!применено.has(f)) { await отметить(f); n += 1; }
    console.log(`отмечено без выполнения: ${n} из ${файлы.length}`);
  } else {
    /* Расхождение контрольной суммы — не повод останавливать работу: чаще
       всего это правка комментария в уже применённом файле. Но сказать надо,
       потому что иногда это правка самой схемы, которой ни у кого нет. */
    for (const f of файлы) {
      const было = применено.get(f);
      if (было && было.checksum !== сумма(readFileSync(join(папка, f), 'utf8'))) {
        console.warn(`! ${f} изменён после применения — у тех, кто накатит базу заново, схема будет другой`);
      }
    }

    const новые = файлы.filter((f) => !применено.has(f));
    if (!новые.length) { console.log(`нечего применять, в журнале ${применено.size}`); }

    for (const f of новые) {
      const текст = readFileSync(join(папка, f), 'utf8');
      if (режим.dry) { console.log(`применилось бы: ${f}`); continue; }

      await client.query('BEGIN');
      try {
        await client.query(текст);
        await client.query(
          'INSERT INTO rec.schema_migrations (name, checksum) VALUES ($1, $2)', [f, сумма(текст)]);
        await client.query('COMMIT');
        console.log(`применено: ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        /* Дальше идти нельзя: следующая миграция почти наверняка опирается на
           то, что должна была сделать упавшая. */
        console.error(`ОШИБКА в ${f}: ${e.message}`);
        process.exitCode = 1;
        break;
      }
    }
  }
} finally {
  await client.end();
}

async function отметить(f) {
  await client.query(`
    INSERT INTO rec.schema_migrations (name, checksum, baselined) VALUES ($1, $2, true)
    ON CONFLICT (name) DO NOTHING`, [f, сумма(readFileSync(join(папка, f), 'utf8'))]);
}
