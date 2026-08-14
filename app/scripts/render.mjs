/* Снимок страницы приложения локальным headless Chrome.
 *
 * Запуск (dev-сервер уже поднят):
 *   node scripts/render.mjs /rec/148/impl C:\путь\снимок.png
 *
 * Роль на снимке — та, под которой запущен dev-сервер: `DEMO_USER=matrosov npm
 * run dev:only`. Кук браузера в свежем профиле пуст, поэтому приложение берёт
 * пользователя по умолчанию, а его и задаёт переменная.
 */

import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [путь = '/', снимок] = process.argv.slice(2);
if (!снимок) {
  console.error('Использование: node scripts/render.mjs ПУТЬ АБСОЛЮТНЫЙ_ПУТЬ_К_PNG');
  process.exit(1);
}

const ПОРТ = Number(process.env.PORT ?? 3100);
const CHROME = process.env.CHROME
  ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ОКНО = process.env.WINDOW ?? '1600,1200';
const ПРОФИЛЬ = path.join(os.tmpdir(), 'recmodule-render-profile');
const АДРЕС = `http://localhost:${ПОРТ}${путь}`;

/* Прогрев: первый заход на страницу в dev-режиме компилирует её и ходит на
   стенд ВМАП за замерами — это десятки секунд, и снимающий Chrome успевает
   бросить попытку. Прогретую страницу он снимает с первого раза. */
await fetch(АДРЕС).catch(() => {});

const r = spawnSync(CHROME, [
  '--headless', '--disable-gpu', '--hide-scrollbars',
  /* Свой профиль обязателен: с профилем по умолчанию запуск при уже открытом
     браузере пытается достучаться до работающего экземпляра и висит навсегда,
     не сняв ничего. Разработчик открытый Chrome не закрывает никогда. */
  `--user-data-dir=${ПРОФИЛЬ}`, '--no-first-run', '--disable-background-networking',
  '--virtual-time-budget=20000',
  `--window-size=${ОКНО}`,
  `--screenshot=${снимок}`,
  АДРЕС,
], { encoding: 'utf8' });

if (r.status !== 0) {
  console.error(r.stderr?.slice(-2000) ?? 'Chrome не запустился');
  process.exit(1);
}
console.log(`${снимок} ← ${путь}`);
