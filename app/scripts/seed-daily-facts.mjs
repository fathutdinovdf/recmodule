/* Суточные данные демо-набора для ручного режима.
 *
 * Зачем отдельный скрипт, а не часть seed-demo. Тот генерирует рекомендации и
 * ничего не знает о фактических сутках: до появления ручного ввода факт брался
 * только со стенда ВМАП, и демо-набор жил без него. Теперь модуль умеет
 * работать без стенда, и без этих данных половина карточек показывает пустой
 * календарь и нулевой эффект.
 *
 * Отличие от rebase-demo принципиальное: тот ходит на стенд Заказчика, а этот
 * не ходит НИКУДА, кроме своей базы. Это и есть смысл первого этапа — набор
 * должен собираться на облачном сервере, где ВМАП недоступна.
 *
 * Числа не выдумываются с потолка: они строятся вокруг базы, которая уже
 * записана в карточке, и ожидаемого прироста из неё же. Иначе эффект вышел бы
 * случайным — ровно та беда, из-за которой появился rebase-demo.
 *
 * Запуск: node scripts/seed-daily-facts.mjs   (npm run db:seed-daily)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const здесь = dirname(fileURLToPath(import.meta.url));

/* Скрипты запускаются голым node, а он .env.local не читает. */
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(join(здесь, '..', '.env.local'), 'utf8').split('\n')
      .filter((s) => s.includes('=') && !s.trim().startsWith('#'))
      .map((s) => [s.slice(0, s.indexOf('=')).trim(), s.slice(s.indexOf('=') + 1).trim()]));
} catch { /* нет файла — берём умолчания */ }

const пер = (k, d) => process.env[k] ?? env[k] ?? d;

/* Коды параметров те же, что у стенда: суточный факт хранится в одном формате
   независимо от того, откуда он пришёл. */
const PARAM = { QZH: 1, WATERCUT: 7, EE: 93 };

/* Сколько суток ДО открытия окна тоже заполнить. Нужны, чтобы у первых суток
   окна было что протянуть, если сам первый день окажется пропущенным. */
const ЗАПАС_ДО_ОКНА = 4;

/* Доля суток, оставляемых пустыми. Это не небрежность генератора: протяжка и
   счётчик «суток со своим значением» — заметная часть экрана, и набор, где
   заполнено всё, их просто не показывает. */
const ДОЛЯ_ПРОПУСКОВ = 0.18;

/* Свой генератор со seed: набор должен быть воспроизводимым, иначе каждый
   пересев даёт другие деньги и сравнивать «до/после» правки нечем. */
let семя = 20260821;
const rnd = () => {
  семя = (семя * 1103515245 + 12345) & 0x7fffffff;
  return семя / 0x7fffffff;
};
const шум = (доля) => 1 + (rnd() - 0.5) * 2 * доля;

const день = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const client = new pg.Client({
  host: пер('PGHOST', 'localhost'),
  port: Number(пер('PGPORT', 5433)),
  database: пер('PGDATABASE', 'recmodule'),
  user: пер('PGUSER', 'recmodule'),
  password: пер('PGPASSWORD', 'recmodule'),
});

await client.connect();

try {
  await client.query('BEGIN');

  /* Свои прежние строки убираем, чужие не трогаем: набор пересевается, а
     внесённое человеком остаётся. */
  const { rowCount: удалено } = await client.query('DELETE FROM rec.daily_facts WHERE is_demo');

  /* Берём только рекомендации с окном: до фиксации реализации считать нечего,
     и заполнять там сутки незачем. Плотность нефти нужна, чтобы из дебита
     жидкости получить нефть, — без неё карточку пропускаем. */
  const { rows: карточки } = await client.query(`
    SELECT r.id, r.well_id, r.expect_qzh, r.expect_qn, r.expect_ee,
           i.window_open_at::date AS открыто,
           LEAST(i.window_close_at::date, current_date) AS конец,
           b.base_qzh, b.base_qn, b.base_ee,
           w.oil_density
      FROM rec.recommendations r
      JOIN rec.implementations i ON i.rec_id = r.id
      LEFT JOIN rec.baselines b ON b.rec_id = r.id AND b.status = 'accepted'
      LEFT JOIN rec.ref_wells w ON w.well_id = r.well_id
     WHERE r.is_demo AND r.deleted_at IS NULL AND r.well_id IS NOT NULL
     ORDER BY r.id
  `);

  let карточекЗаполнено = 0;
  let сутокВсего = 0;
  const пропущено = [];
  /* Одна скважина может нести несколько рекомендаций с пересекающимися
     окнами. Факт принадлежит скважине, поэтому сутки пишутся один раз — кто
     первый, того и значение; иначе вторая карточка затирала бы первую и
     деньги в ней прыгали бы при каждом пересеве. */
  const занято = new Set();

  for (const c of карточки) {
    const базаЖ = c.base_qzh === null ? null : Number(c.base_qzh);
    const базаН = c.base_qn === null ? null : Number(c.base_qn);
    const плотность = c.oil_density === null ? null : Number(c.oil_density);

    if (базаЖ === null || базаН === null || !плотность) {
      пропущено.push(`${c.id}: ${!плотность ? 'нет плотности нефти в rec.ref_wells' : 'нет базы'}`);
      continue;
    }

    const приростЖ = Number(c.expect_qzh ?? 0);
    const приростН = Number(c.expect_qn ?? 0);
    const базаЭЭ = c.base_ee === null ? null : Number(c.base_ee);
    const приростЭЭ = Number(c.expect_ee ?? 0);

    const начало = new Date(c.открыто);
    начало.setDate(начало.getDate() - ЗАПАС_ДО_ОКНА);
    const конец = new Date(c.конец);
    if (конец < начало) continue;

    let сутокПоКарточке = 0;

    for (let t = день(начало).getTime(); t <= день(конец).getTime(); t += 86400000) {
      const д = new Date(t);
      const ключ = `${c.well_id}|${iso(д)}`;
      if (занято.has(ключ)) continue;
      занято.add(ключ);

      const доОкна = д < new Date(c.открыто);

      /* Пропуски — только внутри окна: сутки запаса нужны как опора для
         протяжки, дырявить их незачем. Первый день окна тоже всегда
         заполнен, иначе окно начинается с неизвестности. */
      if (!доОкна && rnd() < ДОЛЯ_ПРОПУСКОВ && д > new Date(c.открыто)) continue;

      /* До открытия окна скважина работает на базовом режиме, после — выходит
         на новый за трое суток. Мгновенный скачок в день реализации выглядел
         бы синтетикой: установка набирает режим не сразу. */
      const суткиОтКрытия = Math.round((д - new Date(c.открыто)) / 86400000);
      const выход = доОкна ? 0 : Math.min(1, (суткиОтКрытия + 1) / 3);

      const qzh = (базаЖ + приростЖ * выход) * шум(0.04);
      const qn = (базаН + приростН * выход) * шум(0.04);

      /* Обводнённость не выдумывается, а выводится из пары «жидкость и
         нефть»: расчёт получает нефть обратно именно из неё, и несогласованная
         тройка дала бы на экране цифры, не сходящиеся между собой.
             Qн = Qж × (1 − w/100) × ρ/1000  →  w = (1 − Qн·1000 / (Qж·ρ)) × 100 */
      const w = (1 - (qn * 1000) / (qzh * плотность)) * 100;
      const обводнённость = Math.min(99, Math.max(0, w));

      await client.query(`
        INSERT INTO rec.daily_facts (well_id, parameter_id, date, value, is_demo)
        VALUES ($1,$2,$3,$4,true), ($1,$5,$3,$6,true)
        ON CONFLICT (well_id, parameter_id, date) DO NOTHING
      `, [c.well_id, PARAM.QZH, iso(д), qzh.toFixed(3),
        PARAM.WATERCUT, обводнённость.toFixed(2)]);

      /* Энергопотребление — только там, где база по нему заведена: в остальных
         случаях его неоткуда взять и на стенде (выносной прибор учёта стоит не
         везде). Пустое поле здесь честнее придуманной цифры. */
      if (базаЭЭ !== null) {
        const ee = (базаЭЭ + приростЭЭ * выход) * шум(0.03);
        await client.query(`
          INSERT INTO rec.daily_facts (well_id, parameter_id, date, value, is_demo)
          VALUES ($1,$2,$3,$4,true)
          ON CONFLICT (well_id, parameter_id, date) DO NOTHING
        `, [c.well_id, PARAM.EE, iso(д), ee.toFixed(2)]);
      }

      сутокПоКарточке++;
      сутокВсего++;
    }

    if (сутокПоКарточке) карточекЗаполнено++;
  }

  /* Сохранённый расчёт демо-карточек сбрасываем: он посчитан до появления
     этих суток и им противоречит. Пересоберётся сам при первом открытии
     вкладки — getEffect считает вживую, когда кэша нет. Это единственный
     способ обновить и ЗАКРЫТЫЕ окна: фоновый пересчёт их не трогает, и
     правильно делает — в рабочем контуре их цифра зафиксирована. Здесь же
     фиксировать нечего, набор только что сгенерирован.

     Настоящие рекомендации не трогаем: у них расчёт свой. */
  const { rowCount: сброшено } = await client.query(`
    DELETE FROM rec.effect_daily ed
    USING rec.recommendations r WHERE r.id = ed.rec_id AND r.is_demo
  `);

  await client.query('COMMIT');

  console.log(`Удалено прежних демо-суток: ${удалено}`);
  console.log(`Заполнено карточек: ${карточекЗаполнено} из ${карточки.length}`);
  console.log(`Суток записано: ${сутокВсего}`);
  console.log(`Сброшено строк сохранённого расчёта: ${сброшено}`);
  if (пропущено.length) {
    console.log(`\nПропущены (${пропущено.length}):`);
    for (const п of пропущено.slice(0, 10)) console.log(`  ${п}`);
    if (пропущено.length > 10) console.log(`  …и ещё ${пропущено.length - 10}`);
  }
  console.log('\nЭффект пересчитается сам при первом открытии карточки.'
    + ' Прогреть заранее: POST /api/effect/recalc.');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
