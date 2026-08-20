/* Выгрузка справочника объектов со стенда ВМАП в файл.
 *
 * Первая половина переноса на облачный сервер, где стенда нет: здесь дерево
 * объектов и статические параметры скважин снимаются со стенда, а
 * load-wells-ref.mjs кладёт их в rec.ref_wells уже на целевой машине. Порознь
 * потому, что запускаются они в разных контурах: на выгрузку нужен доступ к
 * ВМАП, на загрузку — к своей базе, и одновременно их не бывает.
 *
 * SQL живёт в src/db/vmap-sql.ts вместе с остальными запросами к стенду:
 * копия здесь разошлась бы с приложением при первой же правке.
 *
 * Запуск (там, где виден стенд): node scripts/dump-wells-ref.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

/* И запрос, и коды параметров берутся из vmap-sql.ts, а не переписываются
   сюда: разъехавшись, они дают молча пустые плотности. Импортировать vmap.ts
   нельзя — он тянет next/cache, которого у голого node нет. */
const { wellsRefSql } = await import('../src/db/vmap-sql.ts');

const здесь = dirname(fileURLToPath(import.meta.url));
const файл = join(здесь, '..', '..', 'вмап-скважины.json');

/* Скрипты запускаются голым node, а он .env.local не читает — в отличие от
   Next, которому этот файл подкладывает окружение сам. */
const env = Object.fromEntries(
  readFileSync(join(здесь, '..', '.env.local'), 'utf8').split('\n')
    .filter((s) => s.includes('=') && !s.trim().startsWith('#'))
    .map((s) => [s.slice(0, s.indexOf('=')).trim(), s.slice(s.indexOf('=') + 1).trim()]));

const ТПП = env.VMAP_TPP ?? 'ТПП "Когалымнефтегаз"';
const СХЕМА = env.VMAP_SCHEMA ?? 'ois_vmap';

const client = new pg.Client({
  host: env.VMAP_HOST,
  port: Number(env.VMAP_PORT ?? 5432),
  database: env.VMAP_DATABASE,
  user: env.VMAP_USER,
  password: env.VMAP_PASSWORD,
});

await client.connect();

try {
  const { rows } = await client.query(wellsRefSql(СХЕМА, ТПП));

  /* Ноль в плотности — незаполненное поле, а не лёгкая нефть: такая запись на
     стенде есть, и она обнулила бы всю нефть по скважине. Отсекаем здесь, на
     входе, чтобы в файл не попало то, что приложению придётся отсеивать
     второй раз. */
  const плотность = (v) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  };

  const скважины = rows.map((r) => ({
    wellId: Number(r.well_id),
    number: r.well_number,
    code: r.code ?? null,
    kust: r.kust,
    fieldId: Number(r.field_id),
    fieldName: r.field_name,
    oilDensity: плотность(r.oil_density),
    waterDensity: плотность(r.water_density),
    plast: r.plast ?? null,
    operationMode: r.operation_mode ?? null,
  }));

  writeFileSync(файл, JSON.stringify({
    tpp: ТПП,
    dumpedAt: new Date().toISOString(),
    wells: скважины,
  }, null, 2), 'utf8');

  const безПлотности = скважины.filter((w) => w.oilDensity === null).length;
  console.log(`Выгружено скважин: ${скважины.length} → ${файл}`);
  console.log(`Месторождений: ${new Set(скважины.map((w) => w.fieldId)).size}`);
  if (безПлотности) {
    console.log(`Без плотности нефти: ${безПлотности} — по ним эффект в деньгах не посчитается.`);
  }
} finally {
  await client.end();
}
