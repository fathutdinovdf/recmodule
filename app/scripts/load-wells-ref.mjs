/* Загрузка справочника объектов в базу модуля.
 *
 * Вторая половина переноса (первая — dump-wells-ref.mjs). Запускается там, где
 * стенда ВМАП нет: читает вмап-скважины.json и кладёт его в rec.ref_wells.
 *
 * Не TRUNCATE, а UPSERT: скважина, по которой уже выписаны рекомендации, не
 * должна на секунду исчезать из справочника посреди загрузки. Пропавшие со
 * стенда объекты остаются — удалять их молча нельзя, на них ссылается
 * история.
 *
 * Запуск: node scripts/load-wells-ref.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const здесь = dirname(fileURLToPath(import.meta.url));
const файл = process.argv[2] ?? join(здесь, '..', '..', 'вмап-скважины.json');

const дамп = JSON.parse(readFileSync(файл, 'utf8'));
const скважины = дамп.wells ?? [];
if (!Array.isArray(скважины) || скважины.length === 0) {
  throw new Error(`В ${файл} нет скважин — выгрузка не состоялась?`);
}

/* Скрипты запускаются голым node, а он .env.local не читает. На целевом
   сервере файла может не быть вовсе — тогда работают значения по умолчанию,
   как в остальных скриптах загрузки. */
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(join(здесь, '..', '.env.local'), 'utf8').split('\n')
      .filter((s) => s.includes('=') && !s.trim().startsWith('#'))
      .map((s) => [s.slice(0, s.indexOf('=')).trim(), s.slice(s.indexOf('=') + 1).trim()]));
} catch { /* нет файла — берём process.env и умолчания */ }

const переменная = (key, fallback) => process.env[key] ?? env[key] ?? fallback;

const client = new pg.Client({
  host: переменная('PGHOST', 'localhost'),
  port: Number(переменная('PGPORT', 5433)),
  database: переменная('PGDATABASE', 'recmodule'),
  user: переменная('PGUSER', 'recmodule'),
  password: переменная('PGPASSWORD', 'recmodule'),
});

await client.connect();

try {
  await client.query('BEGIN');

  for (const w of скважины) {
    await client.query(`
      INSERT INTO rec.ref_wells
        (well_id, well_number, code, kust, field_id, field_name,
         oil_density, water_density, plast, operation_mode, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
      ON CONFLICT (well_id) DO UPDATE SET
        well_number = EXCLUDED.well_number, code = EXCLUDED.code,
        kust = EXCLUDED.kust, field_id = EXCLUDED.field_id,
        field_name = EXCLUDED.field_name, oil_density = EXCLUDED.oil_density,
        water_density = EXCLUDED.water_density, plast = EXCLUDED.plast,
        operation_mode = EXCLUDED.operation_mode, updated_at = now()
    `, [w.wellId, w.number, w.code ?? null, w.kust, w.fieldId, w.fieldName,
      w.oilDensity ?? null, w.waterDensity ?? null, w.plast ?? null,
      w.operationMode ?? null]);
  }

  await client.query('COMMIT');

  const { rows } = await client.query('SELECT count(*)::int AS n FROM rec.ref_wells');
  console.log(`Загружено из дампа: ${скважины.length} (от ${дамп.dumpedAt ?? 'неизвестно когда'})`);
  console.log(`Всего в rec.ref_wells: ${rows[0].n}`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
