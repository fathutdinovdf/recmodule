/* Пересчёт базовых значений демо-набора по настоящим замерам ВМАП.
 *
 * Зачем. Генератор набора ставил базу случайными числами, и она никак не была
 * связана с тем, что скважина реально давала. На карточке это выглядело
 * убедительно ровно до первого взгляда: база 14,6 т/сут нефти против
 * фактических 1,4 — и эффект минус два с половиной миллиона на каждой второй
 * рекомендации. Арифметика верна, врут исходные данные, а показывать такое
 * Заказчику нельзя.
 *
 * Способ — второй из четырёх договорных (Приложение № 2, «Формирование
 * базовых значений»): средневзвешенные значения за три календарных дня,
 * непосредственно предшествующих РЕГИСТРАЦИИ рекомендации. Отбор кондиционных
 * суток и усреднение живут в src/domain/baseline.ts — тот же код, который
 * будет считать базу в мастере регистрации.
 *
 * Заодно приводятся в порядок ожидаемые приросты: эксперт обещает прибавку от
 * той базы, которая есть, а не от случайного числа. Без этого шкала прогресса
 * окна сравнивала бы факт с прогнозом из другой реальности.
 *
 * Запускать после seed-demo и после каждого refresh-demo: сдвиг дат демо-набора
 * переносит период базы на другие календарные сутки, а замеры ВМАП настоящие и
 * никуда не сдвигаются.
 *
 * Запуск: node scripts/rebase-demo.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

/* Домен подключается прямо из исходников на TypeScript: node 24 снимает типы
   сам. Копировать формулу отбора суток в скрипт нельзя — это ровно тот случай,
   когда две копии разъезжаются молча. */
const { dailySeries } = await import('../src/domain/measurements.ts');
const { baselineFromSeries, BASELINE_DAYS } = await import('../src/domain/baseline.ts');
const { measurementsSql, densitiesSql } = await import('../src/db/vmap-sql.ts');

const здесь = dirname(fileURLToPath(import.meta.url));

/* Скрипты запускаются голым node, а он .env.local не читает — в отличие от
   Next, которому этот файл подкладывает окружение сам. */
const env = Object.fromEntries(
  readFileSync(join(здесь, '..', '.env.local'), 'utf8').split('\n')
    .filter((s) => s.includes('=') && !s.trim().startsWith('#'))
    .map((s) => [s.slice(0, s.indexOf('=')).trim(), s.slice(s.indexOf('=') + 1).trim()]));

const PARAM = { QZH: 1, WATERCUT: 7, OIL_DENSITY: 13, WATER_DENSITY: 12 };
const SCHEMA = env.VMAP_SCHEMA ?? 'ois_vmap';
const LOOKBACK = 30;   // суток запаса назад: первым суткам нужно значение ДО них

const модуль = new pg.Client({
  host: env.PGHOST ?? 'localhost',
  port: Number(env.PGPORT ?? 5433),
  database: env.PGDATABASE ?? 'recmodule',
  user: env.PGUSER ?? 'recmodule',
  password: env.PGPASSWORD ?? 'recmodule',
});

const вмап = new pg.Client({
  host: env.VMAP_HOST,
  port: Number(env.VMAP_PORT ?? 5432),
  database: env.VMAP_DATABASE,
  user: env.VMAP_USER,
  password: env.VMAP_PASSWORD,
  connectionTimeoutMillis: 8000,
});

const день = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const плюс = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const число = (v) => (v === null || v === undefined ? null : Number(v));

async function замеры(wellId, parameterId, от, до) {
  const { rows } = await вмап.query(measurementsSql(SCHEMA),
    [wellId, parameterId, плюс(от, -LOOKBACK), до]);
  return rows
    .map((r) => ({ at: new Date(r.at), value: Number(r.value) }))
    .filter((m) => Number.isFinite(m.value));
}

const плотностиПоСкважине = new Map();
async function плотности(wellId) {
  if (плотностиПоСкважине.has(wellId)) return плотностиПоСкважине.get(wellId);
  const { rows } = await вмап.query(
    densitiesSql(SCHEMA, PARAM.OIL_DENSITY, PARAM.WATER_DENSITY), [wellId]);
  /* Ноль в плотности — незаполненное поле, а не лёгкая нефть: такие записи на
     стенде есть, и ноль обнулил бы всю нефть по скважине. */
  const ок = (v) => (число(v) > 0 ? число(v) : null);
  const p = { oil: ок(rows[0]?.oil_density), water: ок(rows[0]?.water_density) };
  плотностиПоСкважине.set(wellId, p);
  return p;
}

await модуль.connect();
await вмап.connect();

try {
  const { rows: рекомендации } = await модуль.query(`
    SELECT r.id, r.well_id, r.well_number, r.registered_at,
           b.id AS baseline_id
    FROM rec.recommendations r
    LEFT JOIN LATERAL (
      SELECT id FROM rec.baselines
      WHERE rec_id = r.id AND status = 'accepted'
      ORDER BY created_at DESC LIMIT 1
    ) b ON true
    WHERE r.deleted_at IS NULL AND r.is_demo
      AND r.well_id IS NOT NULL AND r.registered_at IS NOT NULL
    ORDER BY r.id
  `);

  console.log(`Рекомендаций к пересчёту базы: ${рекомендации.length}`);

  let посчитано = 0; let пусто = 0;
  const пустые = [];

  for (const r of рекомендации) {
    const конец = плюс(день(r.registered_at), -1);
    const начало = плюс(конец, -(BASELINE_DAYS - 1));

    const [жидкость, обводнённость, p] = await Promise.all([
      замеры(r.well_id, PARAM.QZH, начало, конец),
      замеры(r.well_id, PARAM.WATERCUT, начало, конец),
      плотности(r.well_id),
    ]);

    const база = baselineFromSeries({
      qzh: dailySeries(жидкость, начало, конец),
      watercut: dailySeries(обводнённость, начало, конец),
      oilDensity: p.oil,
      waterDensity: p.water,
    });

    if (база.usedDays === 0 || база.baseQzh === null || база.baseQn === null) {
      пусто++;
      пустые.push(`${r.well_number} (${база.days.map((d) => d.reason ?? 'ок').join('; ')})`);
      continue;
    }

    /* Ожидаемый прирост — 4…14 % базы: столько даёт оптимизация режима на
       механизированном фонде. Число детерминировано от id, чтобы набор не
       менялся при каждом запуске. */
    const доля = 0.04 + ((r.id * 37) % 100) / 1000;
    const expectQzh = +(база.baseQzh * доля).toFixed(2);
    const expectQn = +(база.baseQn * доля).toFixed(2);
    /* Экономия энергии в кВт·ч/сут — знак минус, это экономия. */
    const expectEe = -Math.round(50 + ((r.id * 53) % 300));

    const примечание = `База по ${BASELINE_DAYS} календарным суткам до регистрации, замеры ВМАП`
      + `; кондиционных суток ${база.usedDays} из ${база.days.length}.`;

    if (r.baseline_id) {
      await модуль.query(`
        UPDATE rec.baselines
           SET base_qzh = $2, base_qn = $3, source = 'measured',
               period_from = $4, period_to = $5, note = $6
         WHERE id = $1
      `, [r.baseline_id, база.baseQzh.toFixed(3), база.baseQn.toFixed(3),
        начало, конец, примечание]);
    }

    /* Версия, предложенная Заказчиком в споре, идёт следом за действующей:
       спор бывает о процентах, а не о разах. Оставить её случайной значило бы
       показать Заказчика, который требует базу втрое выше факта, — на такой
       карточке обсуждать нечего. */
    await модуль.query(`
      UPDATE rec.baselines
         SET base_qzh = $2, base_qn = $3, period_from = $4, period_to = $5
       WHERE rec_id = $1 AND status = 'proposed'
    `, [r.id, (база.baseQzh * 1.12).toFixed(3), (база.baseQn * 1.12).toFixed(3),
      плюс(начало, -4), плюс(конец, -4)]);

    await модуль.query(`
      UPDATE rec.recommendations
         SET expect_qzh = $2, expect_qn = $3, expect_ee = $4
       WHERE id = $1
    `, [r.id, expectQzh, expectQn, expectEe]);

    посчитано++;
  }

  /* Кэш посчитан по старой базе и должен уйти целиком: сутки в нём
     привязаны к базе, которой больше нет. */
  await модуль.query('DELETE FROM rec.effect_daily');

  console.log(`База пересчитана: ${посчитано}, не удалось: ${пусто}`);
  if (пустые.length) {
    console.log('\nБез кондиционных суток в периоде:');
    for (const s of пустые.slice(0, 10)) console.log('  ' + s);
    if (пустые.length > 10) console.log(`  …и ещё ${пустые.length - 10}`);
  }
} finally {
  await модуль.end();
  await вмап.end();
}
