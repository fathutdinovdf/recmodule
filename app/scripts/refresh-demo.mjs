/* Актуализация демо-набора: сдвиг всех дат к сегодняшнему дню.
 *
 * Смысл: на дев-версии всегда настоящие дата и время, но статусы демо-записей
 * при этом не протухают. Рекомендация, которая вчера ждала ответа четыре часа,
 * сегодня не должна оказаться просроченной на сутки; окно эффекта, открытое
 * «три недели назад», не должно однажды закрыться само и обнулить показ.
 *
 * Сдвигается весь набор целиком и всегда на целое число суток — иначе «утро
 * понедельника» превратилось бы в «ночь понедельника», и расчёт норматива в
 * рабочих часах поехал бы вместе с ним.
 *
 * Записи, созданные руками в интерфейсе, не помечены is_demo и не трогаются:
 * их даты — правда, а не декорация.
 *
 * Запуск: node scripts/refresh-demo.mjs
 * Идемпотентен: повторный запуск в тот же день ничего не делает.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

/* Предохранитель от случайного запуска там, где рекомендации уже настоящие,
 * а не демо (прод в Yandex Cloud — см. app/BRIEF.md). Голый node .env.local
 * не читает (в отличие от Next), поэтому смотрим в него сами — так же, как
 * это уже делает rebase-demo.mjs для переменных стенда ВМАП. На деве флаг
 * стоит в .env.local, там, где данные реальные, — сознательно не выставлен. */
function демоРазрешён() {
  if (process.env.ALLOW_DEMO_RESET === '1') return true;
  try {
    const здесь = dirname(fileURLToPath(import.meta.url));
    return /^ALLOW_DEMO_RESET=1\s*$/m.test(readFileSync(join(здесь, '..', '.env.local'), 'utf8'));
  } catch {
    return false;
  }
}
if (!демоРазрешён()) {
  console.error('Отказ: ALLOW_DEMO_RESET=1 не выставлен — скрипт трогает демо-данные (is_demo). См. app/BRIEF.md.');
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5433),
  database: process.env.PGDATABASE ?? 'recmodule',
  user: process.env.PGUSER ?? 'recmodule',
  password: process.env.PGPASSWORD ?? 'recmodule',
});

await client.connect();

try {
  const { rows } = await client.query('SELECT anchor, total_shift_days FROM rec.demo_state WHERE id = 1');
  if (!rows.length) {
    console.log('Демо-набор не создан. Сначала: node scripts/seed-demo.mjs');
    process.exit(0);
  }

  /* Считаем разницу в КАЛЕНДАРНЫХ сутках, а не в миллисекундах: набор
     генерировался в произвольное время дня, и деление на 86 400 000 давало бы
     то ноль, то единицу в зависимости от часа запуска. */
  const { rows: [{ days }] } = await client.query(`
    SELECT (current_date - date(anchor))::int AS days FROM rec.demo_state WHERE id = 1
  `);

  if (days === 0) {
    console.log('Набор уже актуален на сегодня, сдвигать нечего.');
  } else {
    await client.query('SELECT rec.shift_demo($1)', [days]);
    const { rows: [состояние] } = await client.query(
      'SELECT anchor, total_shift_days FROM rec.demo_state WHERE id = 1');
    console.log(`Сдвинуто на ${days} сут. Якорь: ${new Date(состояние.anchor).toLocaleDateString('ru-RU')}`);
    console.log(`Всего сдвинуто за время жизни набора: ${состояние.total_shift_days} сут.`);
  }

  /* Что получилось — коротко, чтобы по выводу было видно, жив ли набор. */
  const { rows: сводка } = await client.query(`
    SELECT s.name, count(r.id)::int AS n
    FROM rec.statuses s LEFT JOIN rec.recommendations r
      ON r.status = s.code AND r.deleted_at IS NULL
    GROUP BY s.code, s.name, s.sort_order ORDER BY s.sort_order
  `);
  console.log('\nРекомендаций по статусам:');
  for (const s of сводка) console.log(`  ${String(s.n).padStart(3)}  ${s.name}`);

  const { rows: [срок] } = await client.query(`
    SELECT count(*) FILTER (WHERE due_at < now())::int AS overdue,
           count(*) FILTER (WHERE due_at >= now())::int AS in_time
    FROM rec.recommendations r
    JOIN rec.statuses s ON s.code = r.status AND s.shows_sla
    WHERE r.deleted_at IS NULL AND r.due_at IS NOT NULL
  `);
  console.log(`\nПод контролем срока: в срок ${срок.in_time}, просрочено ${срок.overdue}`);

  /* Сдвиг дат не чинит базу: замеры ВМАП настоящие и никуда не двигаются,
     поэтому период базы после сдвига приходится на другие календарные сутки.
     Автоматически не пересчитываем — тому скрипту нужен доступ на стенд, а
     сборка демо должна работать и без него. */
  if (days !== 0) {
    console.log('\nДаты сдвинуты — базовые значения пора пересчитать: npm run db:rebase');
  }
} finally {
  await client.end();
}
