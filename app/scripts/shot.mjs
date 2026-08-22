/* Снимок экрана для самопроверки вёрстки — обе темы, своим сервером.
 *
 * Правило проекта: менял вид — посмотри на результат сам (CLAUDE.md, раздел
 * «Проверка»). Мешало этому не отсутствие желания, а обвязка: поднять сервер
 * на свободном порту, передать роль переменной, не забыть погасить, придумать
 * абсолютный путь для файла. А тёмную тему снять было нельзя вовсе — тема
 * лежит в localStorage, а свежий профиль Chrome пуст, и снимок всегда выходил
 * светлым.
 *
 * Поэтому здесь не обёртка над `render.mjs`, а другой способ съёмки: Chrome
 * поднимается с отладочным портом и управляется по CDP. Разница ровно в одном
 * месте — можно выполнить в странице `localStorage.setItem` и перезагрузить
 * её, то есть снять тёмную тему.
 *
 * Запуск:
 *   npm run shot -- /users
 *   npm run shot -- /users --role=matrosov --theme=dark
 *   npm run shot -- "/users?u=admin" --port=3100   (снимать уже поднятый сервер)
 *
 * Снимки кладутся в app/.shots/ и печатаются путями — их и открывать.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const здесь = dirname(fileURLToPath(import.meta.url));
const корень = join(здесь, '..');

const аргументы = process.argv.slice(2);
const опция = (имя, умолчание) => {
  const н = аргументы.find((a) => a.startsWith(`--${имя}=`));
  return н ? н.slice(имя.length + 3) : умолчание;
};

const путь = аргументы.find((a) => !a.startsWith('--')) ?? '/';
const роль = опция('role', 'admin');
const тема = опция('theme', 'both');           // both | light | dark
const чужойПорт = Number(опция('port', 0));    // снимать уже поднятый сервер
const окно = опция('window', '1600,1200');
const CHROME = process.env.CHROME
  ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/* Ключ темы тот же, что читает встроенный скрипт в layout.tsx. Если он там
   изменится, снимок молча начнёт врать — поэтому имя одно и написано рядом. */
const КЛЮЧ_ТЕМЫ = 'vmap-theme';

const темы = тема === 'both' ? ['light', 'dark'] : [тема];
const папка = join(корень, '.shots');
mkdirSync(папка, { recursive: true });

const свободныйПорт = () => new Promise((ок) => {
  const s = createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => ок(port)); });
});

const подождать = (мс) => new Promise((ок) => { setTimeout(ок, мс); });

async function дождаться(адрес, секунд = 90) {
  for (let i = 0; i < секунд * 2; i += 1) {
    try {
      const о = await fetch(адрес, { redirect: 'manual' });
      if (о.status > 0) return true;
    } catch { /* ещё не поднялся */ }
    await подождать(500);
  }
  return false;
}

/* ------------------------------ сервер ------------------------------ */

let сервер = null;
let ПОРТ = чужойПорт;

if (!ПОРТ) {
  ПОРТ = await свободныйПорт();
  console.log(`сервер: поднимаю на ${ПОРТ} под ролью ${роль}`);
  сервер = spawn('npx', ['next', 'dev', '-p', String(ПОРТ)], {
    cwd: корень,
    /* Роль задаётся переменной: у свежего профиля Chrome нет куки, и
       приложение берёт пользователя из DEMO_USER (см. lib/session.ts). */
    env: { ...process.env, DEMO_USER: роль },
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  if (!await дождаться(`http://localhost:${ПОРТ}/login`)) {
    console.error('сервер не поднялся');
    сервер.kill();
    process.exit(1);
  }
} else {
  console.log(`сервер: беру уже поднятый на ${ПОРТ} (роль — какая у него)`);
}

const АДРЕС = `http://localhost:${ПОРТ}${путь}`;

/* Прогрев: в dev первая страница компилируется десятки секунд, и Chrome успел
   бы снять заглушку. Тот же приём, что в render.mjs. */
console.log('прогрев страницы…');
try { await fetch(АДРЕС, { redirect: 'follow' }); } catch { /* не страшно */ }

/* ------------------------------ Chrome по CDP ------------------------------ */

const отладка = await свободныйПорт();
const профиль = join(os.tmpdir(), `recmodule-shot-${process.pid}`);
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${отладка}`,
  `--user-data-dir=${профиль}`,
  `--window-size=${окно}`,
  '--hide-scrollbars',
  '--no-first-run',
  '--disable-extensions',
  'about:blank',
], { stdio: 'ignore' });

if (!await дождаться(`http://127.0.0.1:${отладка}/json/version`, 30)) {
  console.error('Chrome не поднялся; путь задаётся переменной CHROME');
  chrome.kill(); сервер?.kill(); process.exit(1);
}

/* Минимальный клиент CDP: обещание на каждый ответ по номеру команды.
   Отдельной библиотеки не берём — нужны четыре метода, а WebSocket в Node
   встроенный. */
function подключить(url) {
  const ws = new WebSocket(url);
  const ждут = new Map();
  let номер = 0;
  const события = new Map();

  ws.addEventListener('message', (e) => {
    const с = JSON.parse(e.data);
    if (с.id && ждут.has(с.id)) { ждут.get(с.id)(с.result); ждут.delete(с.id); }
    if (с.method && события.has(с.method)) { события.get(с.method)(); события.delete(с.method); }
  });

  return {
    готов: new Promise((ок) => ws.addEventListener('open', ок)),
    команда: (method, params = {}) => new Promise((ок) => {
      номер += 1;
      ждут.set(номер, ок);
      ws.send(JSON.stringify({ id: номер, method, params }));
    }),
    событие: (method) => new Promise((ок) => события.set(method, ок)),
    закрыть: () => ws.close(),
  };
}

const цель = await (await fetch(`http://127.0.0.1:${отладка}/json/new?about:blank`,
  { method: 'PUT' })).json();
const cdp = подключить(цель.webSocketDebuggerUrl);
await cdp.готов;
await cdp.команда('Page.enable');

const снимки = [];
for (const т of темы) {
  /* Порядок обязателен: сначала переход на адрес приложения — localStorage
     принадлежит источнику, и до навигации записывать в него некуда. Потом
     запись темы и перезагрузка: тему ставит синхронный скрипт в layout.tsx
     ещё до первой отрисовки, и подхватит он её только на новом заходе. */
  const загружено = cdp.событие('Page.loadEventFired');
  await cdp.команда('Page.navigate', { url: АДРЕС });
  await загружено;

  await cdp.команда('Runtime.evaluate', {
    expression: `localStorage.setItem(${JSON.stringify(КЛЮЧ_ТЕМЫ)}, ${JSON.stringify(т)})`,
  });

  const перезагружено = cdp.событие('Page.loadEventFired');
  await cdp.команда('Page.reload');
  await перезагружено;
  /* Данные приходят серверной разметкой, но анимации появления (полосы,
     подсветка) идут после гидратации — секунда, чтобы снять устоявшийся вид. */
  await подождать(1200);

  const { data } = await cdp.команда('Page.captureScreenshot', { format: 'png' });
  const имя = `${путь.replace(/[^\wа-яА-Я-]+/g, '_').replace(/^_|_$/g, '') || 'index'}-${т}.png`;
  const файл = resolve(join(папка, имя));
  writeFileSync(файл, Buffer.from(data, 'base64'));
  снимки.push(файл);
}

cdp.закрыть();
chrome.kill();
сервер?.kill();
try { rmSync(профиль, { recursive: true, force: true }); } catch { /* профиль временный */ }

console.log(снимки.join('\n'));
