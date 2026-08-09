/* Мастер регистрации рекомендации — пять шагов, свободная навигация.

   Навигация свободная намеренно: эксперт заполняет то, что знает, в том
   порядке, в каком смотрит телеметрию, а не в порядке, придуманном формой.
   Плата за свободу — счётчик незаполненных обязательных полей у каждого шага:
   без него мастер превращается в блуждание, потому что «чего не хватает»
   становится видно только по нажатию «Зарегистрировать».

   Валидация одна, в конце, и никогда не молчит: сводка «не заполнено N полей»
   со ссылками на конкретные поля. Это то же правило, что в карточке
   (решение 51) — человек должен прочитать, чего не хватает, а не искать
   подсвеченное поле глазами.

   Макет живой: поля вводятся, счётчики пересчитываются, проверка на аналоги
   действительно блокирует регистрацию. Ничего не сохраняется — перезагрузка
   возвращает пустую форму. */

const $ = (s, root = document) => root.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');

/* Значения полей возвращаются в разметку при каждой перерисовке — и в атрибут
   value, и в тело textarea. Поэтому экранируем одной функцией и то, и другое:
   разные функции для двух мест рано или поздно разъедутся. */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* В .block__b и .wzsum__v стоит pre-wrap ради переносов в тексте, введённом
   человеком. Пояснения самого интерфейса из-за него получали бы отступы
   исходного кода — прогоняем их через prose. Тот же приём, что в card.js. */
const prose = (s) => s.replace(/\s+/g, ' ').trim();

function fmt(d, withTime = true) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x)) return '—';
  const date = `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
  return withTime ? `${date} ${pad(x.getHours())}:${pad(x.getMinutes())}` : date;
}

/** Обязательные поля числом: 1 обязательное поле, 4 обязательных поля,
    13 обязательных полей. Вынесено отдельно, потому что при единице меняется
    не только существительное, но и прилагательное. */
function fieldsPhrase(n) {
  return n === 1 ? '1 обязательное поле'
    : `${n} обязательных ${plural(n, ['поле', 'поля', 'полей'])}`;
}

/** Русское склонение при числе: 1 поле, 2 поля, 5 полей. */
function plural(n, forms) {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/* Тот же генератор, что в карточке (card.js, rnd32). Скопирован, а не вынесен
   в data.js, потому что data.js трогать нельзя; важно, что зерно то же —
   hash(номер скважины), — и одна и та же скважина показывает одни и те же
   параметры в мастере и в карточке. Иначе макет противоречил бы сам себе. */
function rnd32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ объектная модель ------------------------------ */

/* Каскад собирается из самого набора данных, а не из отдельного справочника:
   так любая выбираемая скважина гарантированно имеет историю рекомендаций —
   иначе проверку на аналоги не на чем показать.

   ЦИТС в дереве нет: в ВМАП такого узла не существует, «Ягун» — суффикс «(Я)»
   в названии цеха. Уровень «месторождение» здесь — пара месторождение × цех,
   название узла берётся как есть, поэтому Южно-Ягунское присутствует четырьмя
   значениями.

   Куст в каскаде не участвует: он не сужает выбор осмысленно — эксперт знает
   номер скважины, а не куст, на котором она стоит, и куст всё равно подтянется
   из ВМАП вместе со скважиной. Лишний обязательный шаг между месторождением и
   скважиной только удлинял путь. */
const TREE = (() => {
  const t = new Map();
  for (const r of DATA) {
    if (!t.has(r.field)) t.set(r.field, new Set());
    t.get(r.field).add(r.well);
  }
  return t;
})();

const fieldList = FIELDS.filter((f) => TREE.has(f));
const wellList = (f) => (TREE.has(f) ? [...TREE.get(f)].sort() : []);

/* Куст показывается справочно, как атрибут выбранной скважины. */
const kustOfWell = (w) => (DATA.find((r) => r.well === w) || {}).kust || '';

/* ------------------------------ состояние ------------------------------ */

const STEPS = [
  { t: 'Объект' },
  { t: 'Проблема' },
  { t: 'Рекомендация' },
  { t: 'Ожидаемый результат' },
  { t: 'Передача' },
];

const ACTION_OTHER = 'Иное — сформулировать вручную';

const draft = {
  field: '', well: '',
  direction: '', problem: '', priority: '', alertId: '',
  actionRef: '', action: '', rationale: '', files: 0,
  dQzh: '', dQn: '', dEE: '', resultNote: '', forecast: '',
  executor: '', customer: '', comment: '',
  dupConfirmed: false,
};

let step = 0;
let screen = 'form';   // form | analogs | done
let alertState = null; // { kind: 'required' } — сводка незаполненного
let gateError = '';    // текст ошибки на экране проверки аналогов
let toast = '';        // подтверждение сохранения черновика
let issued = null;     // { number, at, analogsSeen } — результат регистрации

/* Обязательные поля объявлены списком, а не флагами в разметке: тот же список
   служит и счётчиком у шага, и сводкой валидации со ссылками на поле. Два
   независимых перечня разошлись бы при первой же правке формы. */
const REQUIRED = [
  { step: 0, key: 'field', label: 'месторождение', sel: '#c-field' },
  { step: 0, key: 'well', label: 'скважина', sel: '#c-well' },
  { step: 1, key: 'direction', label: 'направление', sel: '#c-direction' },
  { step: 1, key: 'problem', label: 'описание проблемы', sel: '#fProblem' },
  { step: 1, key: 'priority', label: 'приоритет', sel: '#fPrio' },
  { step: 2, key: 'action', label: 'рекомендуемое мероприятие', sel: '#fAction' },
  { step: 2, key: 'rationale', label: 'технологическое обоснование', sel: '#fRationale' },
  { step: 3, key: 'dQzh', label: 'Δ Qж, м³/сут', sel: '#fQzh' },
  { step: 3, key: 'dQn', label: 'Δ Qн, т/сут', sel: '#fQn' },
  { step: 3, key: 'dEE', label: 'Δ ЭЭ, кВт·ч', sel: '#fEE' },
  { step: 4, key: 'executor', label: 'ответственный Исполнителя', sel: '#c-executor' },
];

const active = (r) => !r.when || r.when();
const filled = (key) => String(draft[key] ?? '').trim() !== '';

function missing() { return REQUIRED.filter((r) => active(r) && !filled(r.key)); }
function missingOn(i) { return missing().filter((r) => r.step === i); }
function requiredOn(i) { return REQUIRED.filter((r) => active(r) && r.step === i); }

/* Необязательные поля шага нужны для состояния «частично»: шаг, где заполнено
   только пояснение, — не пустой, хотя обязательного в нём ещё ничего нет. */
const OPTIONAL_ON = [[], [], ['files'], ['resultNote', 'forecast'], ['customer', 'comment']];

function stateOf(i) {
  const req = requiredOn(i);
  const done = req.filter((r) => filled(r.key)).length;
  const extra = OPTIONAL_ON[i].some((k) => (k === 'files' ? draft.files > 0 : filled(k)));
  if (done === req.length) return 'full';
  if (done > 0 || extra) return 'part';
  return 'empty';
}

/* ------------------------------ выпадающий список ------------------------------

   Свой компонент вместо `select` и `datalist`. Причина не в красоте: и то и
   другое рисуется средствами операционной системы — список выпадает чужим
   шрифтом, своей палитрой и своими отступами, поверх которых CSS не властен.
   На экране, где всё остальное собрано из токенов, это выглядит вставкой из
   другого приложения.

   Своя реализация даёт три вещи, которых у нативных нет: поиск по подстроке
   с подсветкой совпадения (в списке 17 месторождений и десятки скважин),
   управление с клавиатуры и анимацию раскрытия.

   Значение в draft пишется только при выборе. Пока список открыт, поле
   работает строкой поиска: недописанное «Южно-Яг» — не значение, и попасть
   в черновик оно не должно. */

const COMBOS = {
  field: { list: () => fieldList, ph: 'Начните вводить название',
           /* Сколько скважин за узлом — помогает не перепутать четыре
              Южно-Ягунских, разрезанных между цехами. */
           note: (v) => `${wellList(v).length} ${plural(wellList(v).length,
             ['скважина', 'скважины', 'скважин'])}` },
  well: { list: () => wellList(draft.field), ph: 'Номер скважины',
          off: () => !draft.field, offPh: 'Сначала месторождение',
          /* Куст рядом с номером: номера скважин похожи, и подтверждение
             кустом ловит опечатку до того, как она уедет в реестр. */
          note: (v) => `куст ${kustOfWell(v)}` },
  direction: { list: () => DIRECTIONS, ph: 'Выберите направление' },
  actionRef: { list: () => [...ACTIONS, ACTION_OTHER], ph: 'Выберите из справочника', clear: true },
  executor:  { list: () => EXECUTORS, ph: 'Выберите ответственного' },
  customer:  { list: () => CUSTOMERS, ph: 'Выберите ответственного', clear: true },
};

/* { key, active, typed } — какой список раскрыт, какой пункт подсвечен и
   начал ли человек печатать. Флаг typed важен: пока не печатали, поле хранит
   уже выбранное значение, и если считать его строкой поиска, при повторном
   открытии список схлопнется до единственного пункта — того, что и так
   выбран. Поэтому фильтр включается только после первого нажатия клавиши. */
let combo = null;

const comboQuery = (key) => {
  if (!combo || combo.key !== key || !combo.typed) return '';
  const el = $(`#c-${key}`);
  return el ? el.value.trim().toLowerCase() : '';
};

/** Отбор по подстроке в любом месте строки, а не только в начале: скважину
    ищут по номеру «1071», а он у названия месторождения в середине. */
function comboMatches(key) {
  const q = comboQuery(key);
  const all = COMBOS[key].list();
  if (!q) return all;
  return all.filter((v) => String(v).toLowerCase().includes(q));
}

/** Подсветка совпавшего куска — глазу не приходится перечитывать всю строку. */
function markMatch(text, q) {
  const s = String(text);
  if (!q) return esc(s);
  const i = s.toLowerCase().indexOf(q);
  if (i < 0) return esc(s);
  return `${esc(s.slice(0, i))}<b>${esc(s.slice(i, i + q.length))}</b>${esc(s.slice(i + q.length))}`;
}

function comboMenuHtml(key) {
  const items = comboMatches(key);
  const q = comboQuery(key);
  const note = COMBOS[key].note;

  if (!items.length) {
    return `<div class="combo__none">Ничего не найдено${
      q ? `<br><span>по запросу «${esc(q)}»</span>` : ''}</div>`;
  }

  const total = COMBOS[key].list().length;
  const head = q && items.length < total
    ? `<div class="combo__count">Найдено ${items.length} из ${total}</div>` : '';

  return head + items.map((v, i) => `
    <div class="combo__opt ${i === combo.active ? 'is-active' : ''} ${
      v === draft[key] ? 'is-chosen' : ''}" data-combo-opt="${esc(v)}" role="option">
      <span class="combo__txt">${markMatch(v, q)}</span>
      ${note ? `<span class="combo__note">${esc(note(v))}</span>` : ''}
      ${v === draft[key] ? '<svg class="ic12 combo__tick"><use href="#i-check"/></svg>' : ''}
    </div>`).join('');
}

function comboHtml(key, label) {
  const c = COMBOS[key];
  const off = c.off && c.off();
  const open = combo && combo.key === key;
  const canClear = c.clear && draft[key] && !open;
  return `
    <label class="form__f"><span class="form__l">${label}</span>
      <div class="combo ${open ? 'is-open' : ''}" data-combo="${key}">
        <input class="inp combo__inp" id="c-${key}" autocomplete="off" role="combobox"
          aria-expanded="${open ? 'true' : 'false'}"
          ${off ? 'disabled' : ''} value="${esc(draft[key] || '')}"
          placeholder="${esc(off ? (c.offPh || '') : c.ph)}">
        ${canClear
          ? `<button class="combo__clear" data-combo-clear="${key}" title="Очистить" tabindex="-1">
               <svg class="ic12"><use href="#i-close"/></svg></button>`
          : `<svg class="combo__caret ic16"><use href="#i-caret"/></svg>`}
        <div class="combo__menu" ${open ? '' : 'hidden'} role="listbox">${
          open ? comboMenuHtml(key) : ''}</div>
      </div>
    </label>`;
}

/** Перерисовывается только меню: трогать сам input нельзя, в нём курсор. */
function repaintMenu() {
  if (!combo) return;
  const menu = $(`[data-combo="${combo.key}"] .combo__menu`);
  if (!menu) return;
  menu.innerHTML = comboMenuHtml(combo.key);
  const act = menu.querySelector('.is-active');
  if (act) act.scrollIntoView({ block: 'nearest' });
}

function openCombo(key, firstChar) {
  const c = COMBOS[key];
  if (c.off && c.off()) return;

  /* Подсветка встаёт на уже выбранное значение, а не на первую строку: список
     из семнадцати месторождений открывается там, где человек остановился в
     прошлый раз, и стрелками идти оттуда. */
  const list = c.list();
  const at = list.indexOf(draft[key]);
  combo = { key, active: at >= 0 ? at : 0, typed: !!firstChar };
  render();

  const el = $(`#c-${key}`);
  if (!el) return;
  el.focus();
  if (firstChar) { el.value = firstChar; combo.active = 0; repaintMenu(); }
  else { el.select(); repaintMenu(); }
}

/** Закрытие без выбора возвращает в поле прежнее значение: строка поиска,
    оставшаяся в поле, читалась бы как выбранное значение, которым не является. */
function closeCombo() {
  if (!combo) return;
  const key = combo.key;
  combo = null;
  const el = $(`#c-${key}`);
  if (el) el.value = draft[key] || '';
  render();
}

function chooseCombo(key, value) {
  draft[key] = value;
  combo = null;
  applyFieldSideEffects(key, value);
  render();
}

function clearCombo(key) {
  draft[key] = '';
  combo = null;
  applyFieldSideEffects(key, '');
  render();
}

/* ------------------------------ аналоги ------------------------------ */

/* Критерий аналога — та же скважина и то же направление. Ограничения по
   времени сознательно нет: вопрос вынесен Заказчику (3.3), и до ответа
   сужать критерий значит молча пропускать дубли. Черновики не в счёт —
   у черновика нет номера и его видит только автор. */
function analogs() {
  if (!draft.well || !draft.direction) return [];
  return DATA
    .filter((r) => r.well === draft.well && r.direction === draft.direction && r.status !== 'draft')
    .sort((a, b) => b.regDate - a.regDate);
}

function byWell() {
  if (!draft.well) return [];
  return DATA.filter((r) => r.well === draft.well && r.status !== 'draft')
    .sort((a, b) => b.regDate - a.regDate);
}

/* ------------------------------ рельс шагов ------------------------------ */

/* Подпись шага — это то, что в нём уже выбрано, а не повтор названия: рельс
   заодно работает сводкой, и на пятом шаге не приходится листать назад,
   чтобы вспомнить, какая скважина. */
function railSummary(i) {
  if (i === 0) return draft.well ? `скв. ${draft.well} · ${draft.field.split(' /')[0]}` : '';
  if (i === 1) return draft.direction || (draft.priority ? `приоритет ${draft.priority}` : '');
  if (i === 2) return draft.action ? draft.action.slice(0, 42) : '';
  if (i === 3) return filled('dQzh') ? `Δ Qж ${draft.dQzh} м³/сут` : '';
  if (i === 4) return draft.executor || '';
  return '';
}

function renderRail() {
  $('#wzRail').innerHTML = STEPS.map((s, i) => {
    const st = stateOf(i);
    const n = missingOn(i).length;
    const sum = railSummary(i);
    const hint = st === 'full' ? 'заполнено' : (st === 'empty' ? 'не заполнено' : 'заполнено частично');
    return `
      <button class="wzstep ${i === step ? 'is-on' : ''} is-${st}" data-act="go:${i}">
        <span class="wzstep__n">${st === 'full'
          ? '<svg class="ic12"><use href="#i-check"/></svg>' : i + 1}</span>
        <span class="wzstep__b">
          <span class="wzstep__t">${s.t}</span>
          <span class="wzstep__s">${esc(sum) || hint}</span>
        </span>
        ${n ? `<span class="wzstep__c" title="Не заполнено обязательных полей: ${n}">${n}</span>` : ''}
      </button>`;
  }).join('');
}

/* ------------------------------ шаг 1: объект ------------------------------ */

function opts(list, value, placeholder) {
  return `<option value="" ${value ? '' : 'selected'} disabled>${placeholder}</option>` +
    list.map((v) => `<option ${String(v) === String(value) ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

/* Текущие параметры и график за 30 суток — тот же блок, что в правой колонке
   карточки: эксперт должен видеть скважину, а не только её номер. Значения
   синтетические, но устойчивые — зерно от номера скважины. */
function wellAside() {
  if (!draft.well) {
    return `<div class="card wzaside__empty">${prose(`Выберите скважину — подтянутся текущие
      параметры телеметрии и график дебита за 30 суток.`)}</div>`;
  }

  const r = rnd32(hash(draft.well));
  const qzh = 60 + r() * 180;
  const series = Array.from({ length: 30 }, (_, i) => qzh * (0.88 + r() * 0.24) * (i > 21 ? 0.82 : 1));
  const min = Math.min(...series); const max = Math.max(...series);
  const pts = series.map((v, i) =>
    `${(i / 29 * 320).toFixed(1)},${(58 - (v - min) / (max - min || 1) * 50).toFixed(1)}`).join(' ');

  return `
    <div class="card">
      <div class="card__h">Скважина ${esc(draft.well)}<a href="#">карточка</a></div>
      <dl class="params">
        <dt>Дебит жидкости</dt><dd>${qzh.toFixed(1)} м³/сут</dd>
        <dt>Дебит нефти</dt><dd>${(qzh * 0.32).toFixed(1)} т/сут</dd>
        <dt>Обводнённость</dt><dd>${(45 + r() * 40).toFixed(1)} %</dd>
        <dt>Давление на приёме</dt><dd>${(28 + r() * 40).toFixed(0)} атм</dd>
        <dt>Частота</dt><dd>${(2700 + r() * 400).toFixed(0)} об/мин</dd>
        <dt>Загрузка ПЭД</dt><dd>${(62 + r() * 30).toFixed(0)} %</dd>
        <dt>Способ эксплуатации</dt><dd>ЭЦН</dd>
      </dl>
    </div>

    <div class="card">
      <div class="card__h">Дебит жидкости, 30 суток</div>
      <svg class="spark" viewBox="0 0 320 64" preserveAspectRatio="none">
        <polyline points="${pts}" fill="none" stroke="var(--infografic-accent)" stroke-width="1.6"
          stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <div class="spark__cap"><span>${min.toFixed(0)}</span><span>${max.toFixed(0)} м³/сут</span></div>
    </div>`;
}

/* Проверка на аналоги переехала на шаг 2: раньше она стояла на шаге 1, где
   направление ещё не выбрано, и потому могла показать только «сколько всего
   по этой скважине» — счёт, который ни о чём не говорит. Аналог определяется
   парой «скважина + направление», значит и показывать его можно не раньше,
   чем выбрано направление.

   Если аналогов нет, блок не показывается вовсе: сообщать «дубликатов не
   найдено» на каждой регистрации — шум, который перестают читать, а именно
   его потом надо будет читать внимательно. */
function analogBlock() {
  const same = analogs();
  if (!same.length) return '';

  /* Список разделён: в работе — сильный сигнал дублирования, здесь эксперт
     скорее всего пишет то же самое второй раз. Завершённые — контекст: работа
     по этому направлению уже была и, возможно, не помогла. */
  const FINAL = ['windowClosed', 'rejected', 'cancelled'];
  const active = same.filter((r) => !FINAL.includes(r.status));
  const closed = same.filter((r) => FINAL.includes(r.status));

  const list = (arr) => `<div class="prev">${arr.map((p) => `
    <a class="prev__i" href="card.html?id=${p.id}" target="_blank">
      <div class="prev__t"><b>${p.number}</b> · ${fmt(p.regDate, false)} · ${p.statusLabel}</div>
      <div class="prev__p">${esc(p.problem)}</div></a>`).join('')}</div>`;

  return `
    <div class="wzcheck">
      <div class="wzcheck__h">
        Аналоги по этой скважине и направлению
        <span class="tag tag--warning">${same.length}</span>
      </div>
      <div class="form__hint">${prose(`Регистрация потребует подтвердить, что это отдельное
        мероприятие, а не повтор. Подтверждение записывается в историю — оно и есть защита
        в спорной ситуации по разделу 10 договора.`)}</div>
      ${active.length ? `<div class="wzcheck__g">В работе — ${active.length}</div>${list(active)}` : ''}
      ${closed.length ? `<div class="wzcheck__g">Завершённые — ${closed.length}</div>${list(closed)}` : ''}
    </div>`;
}

function paneObject() {
  const wells = wellList(draft.field);
  const kust = draft.well ? kustOfWell(draft.well) : '';

  return `
    <div class="wzcols">
      <div class="wzcols__main">
        <div class="form form--plain">
          ${comboHtml('field', 'Месторождение')}
          ${comboHtml('well', `Скважина${kust ? ` <i>куст ${esc(kust)}</i>` : ''}`)}
        </div>
      </div>
      <aside class="wzaside">${wellAside()}</aside>
    </div>`;
}

/* ------------------------------ шаг 2: проблема ------------------------------ */

function paneProblem() {
  return `
    <div class="form form--plain">
      ${comboHtml('direction', 'Направление')}

      <label class="form__f"><span class="form__l">Описание проблемы или отклонения</span>
        <textarea class="inp inp--area" id="fProblem" data-k="problem" rows="3"
          placeholder="Например: снижение дебита жидкости с 96 до 20 м³/сут при неизменной частоте и загрузке ПЭД.">${esc(draft.problem)}</textarea></label>

      <div class="form__f"><span class="form__l">Приоритет</span>
        <div class="wzprio" id="fPrio" tabindex="-1">
          ${PRIORITIES.map((p) => `
            <button class="wzprio__i ${draft.priority === p.code ? 'is-on' : ''}" data-act="prio:${p.code}">
              <span class="prio prio--${p.code}">${p.code}</span>
              <span class="wzprio__t">${esc(p.label.split('—')[1].trim())}</span>
              <span class="wzprio__d">ответ ${p.sla} ${plural(p.sla, ['рабочий час', 'рабочих часа', 'рабочих часов'])}</span>
            </button>`).join('')}
        </div>
        <div class="form__hint">${prose(`Норматив считается рабочими часами и стартует не с
          регистрации, а с передачи Заказчику: рабочее окно — пн–пт 09:00–24:00 по Когалыму.`)}</div>
      </div>

      <label class="form__f"><span class="form__l">Предупреждение ВМАП
          <i>необязательно</i></span>
        <input class="inp inp--date" id="fAlert" data-k="alertId" value="${esc(draft.alertId)}"
          placeholder="ALR-2026-08-04-1187"></label>
      <div class="form__hint">${prose(`Заполняется, если рекомендация выросла из конкретного
        предупреждения. Этой же связкой мастер открывается прямо из ВМАП: шаги 1 и 2 приходят
        предзаполненными, идентификатор подставляется сам.`)}</div>
    </div>

    ${analogBlock()}`;
}

/* ------------------------------ шаг 3: рекомендация ------------------------------ */

function paneAction() {
  return `
    <div class="form form--plain">
      ${comboHtml('actionRef', 'Рекомендуемое мероприятие <i>справочник</i>')}

      <label class="form__f"><span class="form__l">Формулировка мероприятия</span>
        <textarea class="inp inp--area" id="fAction" data-k="action" rows="4"
          placeholder="Значение из справочника подставляется сюда и дополняется под конкретную скважину.">${esc(draft.action)}</textarea></label>
      <div class="form__hint">${prose(`Справочник только заводит формулировку — в реестр уходит
        текст из этого поля. Заказчик читает именно его, поэтому режимы, частоты и порядок
        действий пишутся здесь, а не остаются в голове эксперта.`)}</div>

      <label class="form__f"><span class="form__l">Технологическое обоснование</span>
        <textarea class="inp inp--area" id="fRationale" data-k="rationale" rows="5"
          placeholder="Чем подтверждается проблема и почему предложенное мероприятие её решает.">${esc(draft.rationale)}</textarea></label>
      <div class="form__hint">${prose(`Обязательно. В карточке обоснование стоит перед кнопками
        решения: до «Принять» и «Отклонить» Заказчик добирается, только прокрутив его.`)}</div>

      <div class="form__f">
        <span class="form__l">Вложения <i>необязательно</i></span>
        <div class="files">
          ${Array.from({ length: draft.files }, (_, i) =>
            `<span class="file"><svg class="ic12"><use href="#i-clip"/></svg>обоснование-${i + 1}.pdf</span>`).join('')}
          <button class="btn" data-act="attach">Прикрепить файл</button>
        </div>
        <div class="form__hint">Выгрузка тренда из ВМАП, расчёт, скриншот режима.</div>
      </div>
    </div>`;
}

/* ------------------------------ шаг 4: ожидаемый результат ------------------------------ */

function paneResult() {
  return `
    <div class="form form--plain">
      <div class="form__row">
        <label class="form__f"><span class="form__l">Δ Qж, м³/сут</span>
          <input class="inp" type="number" step="0.1" id="fQzh" data-k="dQzh"
            value="${esc(draft.dQzh)}" placeholder="0,0"></label>
        <label class="form__f"><span class="form__l">Δ Qн, т/сут</span>
          <input class="inp" type="number" step="0.01" id="fQn" data-k="dQn"
            value="${esc(draft.dQn)}" placeholder="0,00"></label>
        <label class="form__f"><span class="form__l">Δ ЭЭ, кВт·ч</span>
          <input class="inp" type="number" step="1" id="fEE" data-k="dEE"
            value="${esc(draft.dEE)}" placeholder="0"></label>
      </div>
      <div class="form__hint">${prose(`Все три обязательны и вводятся числами: во второй итерации
        окно эффекта сверяет прогноз с фактом автоматически, отсюда же берётся метрика точности
        прогнозов эксперта. Отрицательное Δ ЭЭ — экономия электроэнергии.`)}</div>

      <label class="form__f"><span class="form__l">Пояснение к ожидаемому результату
          <i>необязательно</i></span>
        <textarea class="inp inp--area" id="fResultNote" data-k="resultNote" rows="2"
          placeholder="Например: выход на режим ожидается на третьи сутки после перезапуска.">${esc(draft.resultNote)}</textarea></label>

      <label class="form__f"><span class="form__l">Прогнозный экономический эффект, руб
          <i>необязательно</i></span>
        <input class="inp inp--date" type="number" step="1000" id="fForecast" data-k="forecast"
          value="${esc(draft.forecast)}" placeholder="0"></label>
      <div class="form__hint">${prose(`Пока вводится вручную: экономическая модель Заказчика —
        цены нефти и электроэнергии по месяцам — не предоставлена. С ней поле станет
        расчётным.`)}</div>

      <div class="wzfixed">
        <svg class="ic16"><use href="#i-lock"/></svg>
        <div>
          <div class="wzfixed__v">Горизонт подтверждения — 90 суток</div>
          <div class="wzfixed__d">${prose(`Отсчитывается от даты фактической реализации.
            Значение зафиксировано договором и не редактируется ни здесь, ни в карточке.`)}</div>
        </div>
      </div>
    </div>`;
}

/* ------------------------------ шаг 5: передача ------------------------------ */

/* Сводка на последнем шаге показывает и незаполненное: она же служит последней
   проверкой перед нажатием «Зарегистрировать», а значит обязана показывать
   дыры, а не только то, что получилось. */
function sumRow(step, k, v) {
  const empty = !v;
  return `<div class="wzsum__r">
    <span class="wzsum__k">${k}</span>
    <span class="wzsum__v ${empty ? 'is-miss' : ''}">${empty ? 'не заполнено' : esc(v)}</span>
    <button class="wzsum__a" data-act="go:${step}">изменить</button>
  </div>`;
}

function paneHandover() {
  const prio = PRIORITIES.find((p) => p.code === draft.priority);
  const object = draft.well ? `${draft.field} · куст ${kustOfWell(draft.well)} · скважина ${draft.well}` : '';

  return `
    <div class="form form--plain">
      <div class="form__row">
        ${comboHtml('executor', 'Ответственный Исполнителя')}
        ${comboHtml('customer', 'Ответственный Заказчика <i>предполагаемый</i>')}
      </div>
      <div class="form__hint">${prose(`Ответственный Заказчика здесь — предположение эксперта, оно
        подсказывает, кому уйдёт уведомление. Окончательного ответственного назначает Заказчик
        при рассмотрении.`)}</div>

      <label class="form__f"><span class="form__l">Комментарий <i>необязательно</i></span>
        <textarea class="inp inp--area" id="fComment" data-k="comment" rows="2"
          placeholder="Что стоит знать при рассмотрении: договорённости с цехом, срочность, связанные работы.">${esc(draft.comment)}</textarea></label>
      <div class="form__hint">${prose(`Комментарии общие: внутренних заметок Исполнителя,
        невидимых Заказчику, в модуле нет.`)}</div>
    </div>

    <div class="wzsum">
      <div class="wzsum__h">Сводка</div>
      ${sumRow(0, 'Объект', object)}
      ${sumRow(1, 'Направление', draft.direction)}
      ${sumRow(1, 'Проблема', draft.problem)}
      ${sumRow(1, 'Приоритет', prio ? `${prio.label} · ответ ${prio.sla} ч` : '')}
      ${draft.alertId ? sumRow(1, 'Предупреждение ВМАП', draft.alertId) : ''}
      ${sumRow(2, 'Мероприятие', draft.action)}
      ${sumRow(2, 'Обоснование', draft.rationale)}
      ${sumRow(3, 'Ожидаемый результат', [
        filled('dQzh') ? `Δ Qж ${draft.dQzh} м³/сут` : '',
        filled('dQn') ? `Δ Qн ${draft.dQn} т/сут` : '',
        filled('dEE') ? `Δ ЭЭ ${draft.dEE} кВт·ч` : '',
        filled('forecast') ? `${Number(draft.forecast).toLocaleString('ru-RU')} руб` : '',
      ].filter(Boolean).join(' · '))}
      ${sumRow(3, 'Горизонт', '90 суток от даты фактической реализации')}
      ${sumRow(4, 'Ответственные', [draft.executor && `Исполнитель — ${draft.executor}`,
        draft.customer && `Заказчик — ${draft.customer}`].filter(Boolean).join(' · '))}
    </div>

    <div class="form__hint">${prose(`Регистрация присваивает номер и дату регистрации и переводит
      рекомендацию в статус «Зарегистрировано». Передача Заказчику — отдельное действие: до неё
      Заказчик рекомендации не видит, и норматив ответа не идёт.`)}</div>`;
}

/* ------------------------------ проверка на аналоги ------------------------------ */

/* Проверка блокирующая и выполняется в момент регистрации, а не при заполнении:
   она привязана к дате регистрации. Черновик мог пролежать неделю, за неё
   появились новые рекомендации — подтверждение запрашивается заново.

   Экран забирает всё окно намеренно: подтверждение «это отдельное мероприятие»
   уходит в историю как защита в спорной ситуации по разделу 10 договора, и
   поставить его, не прочитав список, не должно получаться. */
function paneAnalogs() {
  const list = analogs();
  return `
    <div class="wzgate">
      <div class="wzgate__h">
        <svg class="ic20"><use href="#i-warn"/></svg>
        По скважине ${esc(draft.well)} уже есть ${list.length}
        ${plural(list.length, ['рекомендация', 'рекомендации', 'рекомендаций'])} по направлению
        «${esc(draft.direction)}»
      </div>
      <div class="wzgate__d">${prose(`Регистрация возможна, но требует явного подтверждения:
        дубли в реестре означают двойной счёт эффекта по договору. Подтверждение с числом
        просмотренных аналогов записывается в историю рекомендации.`)}</div>

      <div class="wzgate__list">
        ${list.map((p) => {
          const [tone, solid] = STATUS_TONE[p.status];
          return `<a class="wzgate__i" href="card.html?id=${p.id}" target="_blank">
            <span class="wzgate__n">${p.number}</span>
            <span class="status"><i class="status__d status__d--${tone} ${solid ? '' : 'is-hollow'}"></i>${p.statusLabel}</span>
            <span class="wzgate__dt">${fmt(p.regDate, false)}</span>
            <span class="wzgate__p">${esc(p.problem)}</span>
          </a>`;
        }).join('')}
      </div>

      <label class="wzgate__ok">
        <input type="checkbox" id="fDup" ${draft.dupConfirmed ? 'checked' : ''}>
        <span>Ознакомился со списком. Это отдельное мероприятие, дублирования нет.</span>
      </label>
      ${gateError ? `<div class="form__err">${gateError}</div>` : ''}
    </div>`;
}

/* ------------------------------ результат регистрации ------------------------------ */

/* Номер — код месторождения, год, счётчик внутри месторождения. Код нужен свой
   у каждого узла дерева: Южно-Ягунское разрезано между четырьмя цехами, и
   общий код давал бы одинаковые номера разным объектам. */
function nextNumber(field) {
  const code = FIELD_CODE[field] || 'XX';
  /* Счётчик берётся как максимум уже выданных, а не как их количество:
     у черновиков номера нет вовсе, и счёт по количеству записей выдал бы
     номер, который в реестре уже занят. */
  const used = DATA
    .filter((r) => r.number.startsWith(`${code}-26-`))
    .map((r) => Number(r.number.slice(-4)));
  const n = (used.length ? Math.max(...used) : 0) + 1;
  return `${code}-26-${String(n).padStart(4, '0')}`;
}

function paneDone() {
  const prio = PRIORITIES.find((p) => p.code === draft.priority);
  return `
    <div class="wzdone">
      <div class="wzdone__n">${issued.number}</div>
      <div class="wzdone__h">
        <span class="status"><i class="status__d status__d--neutral"></i>Зарегистрировано</span>
        <span class="wzdone__dt">${fmt(issued.at)}</span>
      </div>
      <div class="wzdone__b">${prose(`${draft.field} · куст ${kustOfWell(draft.well)} · скважина ${draft.well} ·
        ${draft.direction} · приоритет ${prio.code}, норматив ответа ${prio.sla} рабочих часов.`)}</div>

      <div class="wzdone__next">
        <div class="wzdone__nh">Что дальше</div>
        <div class="form__hint">${prose(`Передача Заказчику — отдельное действие из карточки или
          массово из реестра, и только в рабочее окно: ближайшее откроется сегодня в 09:00.
          До передачи рекомендация числится за Исполнителем, Заказчик её не видит, норматив
          ответа не идёт.`)}</div>
      </div>

      ${issued.analogsSeen ? `<div class="wzdone__log">
        <div class="wzdone__nh">Записано в историю</div>
        <div class="form__hint">${prose(`«Эксперт подтвердил отсутствие дублирования,
          ознакомившись с ${issued.analogsSeen}
          ${plural(issued.analogsSeen, ['аналогом', 'аналогами', 'аналогами'])}».
          Запись нужна как защита в спорной ситуации по разделу 10 договора.`)}</div>
      </div>` : ''}
    </div>`;
}

/* ------------------------------ сборка окна ------------------------------ */

const PANES = [paneObject, paneProblem, paneAction, paneResult, paneHandover];

function renderPane() {
  const pane = $('#wzPane');
  if (screen === 'analogs') { pane.innerHTML = paneAnalogs(); return; }
  if (screen === 'done') { pane.innerHTML = paneDone(); return; }
  pane.innerHTML = `<div class="wzpane__h">Шаг ${step + 1} из 5 · ${STEPS[step].t}</div>${PANES[step]()}`;
  pane.scrollTop = 0;
}

function renderSub() {
  if (screen === 'done') { $('#wzSub').textContent = 'Готово'; return; }
  const n = missing().length;
  /* У черновика нет ни номера, ни даты регистрации — они появляются только в
     момент регистрации, поэтому в шапке стоит слово «Черновик», а не пустой
     номер и не «б/н». */
  $('#wzSub').textContent = n
    ? `Черновик · не заполнено ${fieldsPhrase(n)}`
    : 'Черновик · все обязательные поля заполнены';
}

/* Полоса над подвалом. Сводка валидации и подтверждение сохранения черновика
   делят одно место намеренно: это обе реакции на нажатие кнопки подвала, и
   человек ищет ответ там, куда только что нажал. Одновременно они не нужны —
   ошибка важнее, поэтому она и выигрывает. */
function renderAlert() {
  const box = $('#wzAlert');
  const miss = alertState ? missing() : [];
  if (alertState && !miss.length) alertState = null;

  if (!alertState) {
    box.classList.toggle('wz__alert--ok', !!toast);
    box.hidden = !toast;
    box.innerHTML = toast ? `<div class="wzalert__h">${esc(toast)}</div>` : '';
    return;
  }

  box.classList.remove('wz__alert--ok');
  box.hidden = false;
  box.innerHTML = `
    <div class="wzalert__h">Не заполнено ${fieldsPhrase(miss.length)}</div>
    <div class="wzalert__l">${miss.map((r) =>
      `<button class="wzalert__i" data-act="fix:${r.step}:${r.key}">шаг ${r.step + 1} — ${r.label}</button>`).join('')}</div>`;
}

function renderFoot() {
  const foot = $('#wzFoot');

  if (screen === 'analogs') {
    foot.innerHTML = `
      <div class="wz__foot-l">
        <button class="btn" data-act="back-to-form">Вернуться к заполнению</button>
      </div>
      <div class="wz__foot-r">
        <button class="btn btn--accent" data-act="register">Зарегистрировать</button>
      </div>`;
    return;
  }

  if (screen === 'done') {
    foot.innerHTML = `
      <div class="wz__foot-l">
        <button class="btn" data-act="restart">Создать ещё одну</button>
      </div>
      <div class="wz__foot-r">
        <a class="btn" href="index.html">К реестру</a>
        <a class="btn btn--accent" href="card.html">Открыть карточку</a>
      </div>`;
    /* Куда попадает эксперт сразу после регистрации — в карточку или в реестр
       с подсветкой новой строки — открытый вопрос 4.2. Пока обе двери
       открыты, и по нажатию видно, какая из них нужнее. В стенде карточка
       откроется на чужой записи: созданной в реестре макета нет. */
    return;
  }

  /* «Зарегистрировать» активна на любом шаге и никогда не гаснет: гашение
     кнопки — это молчаливая блокировка, из которой не видно, чего не хватает.
     Вместо этого нажатие показывает сводку со ссылками на пустые поля. */
  foot.innerHTML = `
    <div class="wz__foot-l">
      <button class="btn" data-act="draft">Сохранить черновик</button>
      <a class="btn btn--ghost" href="index.html">Отмена</a>
    </div>
    <div class="wz__foot-r">
      <button class="btn" data-act="prev" ${step === 0 ? 'disabled' : ''}>
        <svg class="ic16"><use href="#i-prev"/></svg>Назад</button>
      <button class="btn" data-act="next" ${step === STEPS.length - 1 ? 'disabled' : ''}>
        Далее<svg class="ic16"><use href="#i-next"/></svg></button>
      <button class="btn btn--accent" data-act="register">Зарегистрировать</button>
    </div>`;
}

/** Всё, кроме области полей: рельс, подзаголовок, сводка ошибок, подвал.
    Перерисовывается на каждом нажатии клавиши, поэтому область ввода не
    трогает — иначе курсор в поле сбрасывался бы после каждого символа. */
function renderChrome() {
  renderRail(); renderSub(); renderAlert(); renderFoot();
}

function render() { renderChrome(); renderPane(); }

/* ------------------------------ действия ------------------------------ */

function goto(i) {
  /* После регистрации форма закрыта: рельс остаётся на экране как сводка
     пройденного, но никуда не ведёт — править зарегистрированную
     рекомендацию нужно в карточке, а не в мастере. */
  if (screen === 'done') return;
  /* А вот с экрана проверки на аналоги рельс обязан работать: свободная
     навигация никуда не делась, блокируется только сама регистрация. */
  screen = 'form'; gateError = '';
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  toast = '';
  render();
}

function focusField(sel) {
  const el = $(sel);
  if (!el) return;
  el.focus();
  el.scrollIntoView({ block: 'center' });
}

function register() {
  /* Порядок проверок именно такой: сначала полнота, потом дублирование.
     Показывать список аналогов человеку, который ещё не дописал обоснование,
     значит требовать решения по вопросу, до которого он не дошёл. */
  const miss = missing();
  if (miss.length) { alertState = { kind: 'required' }; screen = 'form'; render(); return; }

  const list = analogs();
  if (list.length && !draft.dupConfirmed) {
    /* На самом экране проверки та же кнопка не молчит: без отметки она
       объясняет, чего ждёт, а не гаснет. */
    gateError = screen === 'analogs'
      ? 'Подтвердите, что это отдельное мероприятие: без отметки регистрация невозможна.' : '';
    screen = 'analogs'; render(); return;
  }

  issued = {
    number: nextNumber(draft.field),
    at: NOW,
    analogsSeen: draft.dupConfirmed ? list.length : 0,
  };
  screen = 'done';
  alertState = null;
  render();
}

function resetDraft() {
  Object.keys(draft).forEach((k) => { draft[k] = (k === 'files' ? 0 : (k === 'dupConfirmed' ? false : '')); });
  step = 0; screen = 'form'; alertState = null; gateError = ''; toast = ''; issued = null;
  render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const [kind, p1, p2] = a.dataset.act.split(':');

  if (kind === 'go') { goto(Number(p1)); return; }
  if (kind === 'prev') { goto(step - 1); return; }
  if (kind === 'next') { goto(step + 1); return; }

  /* Ссылка из сводки валидации ведёт не просто на шаг, а в конкретное поле:
     иначе на шаге с семью полями искать пустое приходится глазами. */
  if (kind === 'fix') {
    const r = REQUIRED.find((x) => x.key === p2);
    step = Number(p1); render(); focusField(r.sel); return;
  }

  if (kind === 'prio') { draft.priority = p1; render(); return; }
  if (kind === 'attach') { draft.files += 1; render(); return; }

  if (kind === 'draft') {
    /* Черновик сохраняется из любого состояния, включая пустое: у него нет ни
       номера, ни даты регистрации, и в реестре его видит только автор. */
    toast = `Черновик сохранён ${fmt(NOW)}. Номера и даты регистрации у черновика нет — они появятся при регистрации. В реестре черновик видит только автор.`;
    renderAlert(); return;
  }

  if (kind === 'register') { register(); return; }
  if (kind === 'back-to-form') { screen = 'form'; gateError = ''; render(); return; }
  if (kind === 'restart') { resetDraft(); return; }
});

/* ---------- события выпадающего списка ---------- */

/* Открытие по нажатию на поле или на стрелку. Не по фокусу: тогда список
   раскрывался бы при возврате из соседнего поля клавишей Tab, когда человек
   просто проходит форму насквозь. */
document.addEventListener('mousedown', (e) => {
  const inside = e.target.closest('[data-combo]');
  if (!inside) { if (combo) closeCombo(); return; }

  const key = inside.dataset.combo;

  const clr = e.target.closest('[data-combo-clear]');
  if (clr) { e.preventDefault(); clearCombo(clr.dataset.comboClear); return; }

  const opt = e.target.closest('[data-combo-opt]');
  if (opt) {
    /* mousedown, а не click: click прилетел бы после blur поля, и список
       успел бы закрыться раньше, чем выбор дошёл до обработчика. */
    e.preventDefault();
    chooseCombo(key, opt.dataset.comboOpt);
    return;
  }
  if (combo && combo.key === key) return;   // повторное нажатие внутри открытого — не мешаем
  e.preventDefault();
  openCombo(key);
});

document.addEventListener('keydown', (e) => {
  /* Набор с клавиатуры в закрытом поле раскрывает список и становится первым
     символом поиска: пришедший по Tab не должен искать мышью, чем открыть. */
  if (!combo) {
    const el = e.target;
    const id = el && el.id;
    if (id && id.startsWith('c-') && COMBOS[id.slice(2)]
        && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      openCombo(id.slice(2), e.key);
    }
    return;
  }
  const items = comboMatches(combo.key);

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    const d = e.key === 'ArrowDown' ? 1 : -1;
    combo.active = (combo.active + d + items.length) % items.length;
    repaintMenu();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (items[combo.active] !== undefined) chooseCombo(combo.key, items[combo.active]);
    return;
  }
  if (e.key === 'Escape' || e.key === 'Tab') {
    /* Escape гасим, чтобы он не дошёл до обработчика экрана проверки аналогов:
       закрыть список и закрыть экран — разные действия. */
    if (e.key === 'Escape') e.stopPropagation();
    closeCombo();
  }
});

/* Ввод текста только пересчитывает счётчики и подвал: перерисовать поле,
   в котором человек печатает, значит потерять курсор. */
document.addEventListener('input', (e) => {
  const el = e.target;

  /* Поле раскрытого списка — строка поиска, а не значение: перерисовываем
     только меню, в draft ничего не пишем до выбора. */
  if (combo && el.id === `c-${combo.key}`) {
    combo.active = 0;
    repaintMenu();
    return;
  }

  if (el.id === 'fDup') return;
  const k = el.dataset.k;
  if (!k) return;
  draft[k] = el.value;
  renderChrome();
});

/* Выбор из списка меняет состав формы — каскад объекта, поле предупреждения,
   подстановка формулировки из справочника, — поэтому здесь перерисовка полная. */
document.addEventListener('change', (e) => {
  const el = e.target;

  if (el.id === 'fDup') {
    draft.dupConfirmed = el.checked;
    /* Перерисовываем только чтобы снять уже показанную ошибку: без этого
       текст «подтвердите» продолжал бы висеть над поставленной галочкой. */
    if (el.checked && gateError) { gateError = ''; render(); }
    return;
  }

  const k = el.dataset.k;
  if (!k || el.tagName !== 'SELECT') return;

  draft[k] = el.value;
  applyFieldSideEffects(k, el.value);
  render();
});

/* Побочные эффекты выбора собраны в одном месте: их запускает и выпадающий
   список, и оставшиеся обычные `select`. Разъехавшись по двум обработчикам,
   они рано или поздно разошлись бы и по поведению. */
function applyFieldSideEffects(k, value) {
  /* Смена месторождения обнуляет скважину: список скважин у другого узла свой,
     и оставленный номер молча указывал бы в пустоту. */
  if (k === 'field') draft.well = '';

  /* Смена скважины или направления сбрасывает подтверждение дублирования:
     подтверждали пару «скважина × направление», а она стала другой. */
  if (k === 'well' || k === 'direction') draft.dupConfirmed = false;

  /* Справочник заводит формулировку, но не перебивает уже написанный текст:
     эксперт мог дописать режимы и частоты, и потерять их при смене строки
     справочника было бы обиднее, чем набрать заново. */
  if (k === 'actionRef' && value !== ACTION_OTHER && !draft.action.trim()) {
    draft.action = value;
  }
}

/* Escape с экрана проверки возвращает к заполнению, а не закрывает мастер:
   закрыть окно клавишей, потеряв заполненную форму, — слишком дорогая ошибка. */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && screen === 'analogs') { screen = 'form'; gateError = ''; render(); }
});

/* ------------------------------ стенд ------------------------------ */

/* Стенд открывают двойным кликом по файлу, обсуждать пустую форму неудобно:
   ?demo=1 наполняет мастер правдоподобным черновиком, ?demo=2 — тем же, но
   без части обязательных полей, чтобы показать сводку валидации. Боевой
   формы это не касается — параметр читается только здесь. */
function applyDemo(mode) {
  const seed = DATA.find((r) => r.well === '1071') || DATA[0];
  Object.assign(draft, {
    field: seed.field, well: seed.well,
    direction: 'Стабилизация режимов работы ГНО',
    problem: 'Остановки по ЗСП: срыв подачи при достижении 53 атм на приёме после увеличения оборотов с 2950 до 3000 об/мин.',
    priority: 'I',
    alertId: 'ALR-2026-08-05-0431',
    actionRef: 'Перезапуск на пониженной частоте с постепенным выводом на режим.',
    action: 'Перезапуск на 2700 об/мин со ступенчатым повышением до 2950 об/мин и контролем Тм. При повторном срыве подачи — остановка на накопление 4 часа и повторный вывод на режим.',
    rationale: 'Срыв подачи наступает воспроизводимо при достижении 53 атм на приёме, то есть определяется притоком, а не состоянием ГНО. Ступенчатый вывод даёт пласту восстановить давление и удерживает установку в рабочей зоне.',
    files: 2,
    dQzh: '9.5', dQn: '2.4', dEE: '-180',
    resultNote: 'Выход на устойчивый режим ожидается на третьи сутки после перезапуска.',
    forecast: '410000',
    executor: 'Матросов',
    customer: 'Чернышов А.А',
  });

  if (mode === '2') {
    /* Пробелы расставлены по трём разным шагам: сводка валидации должна
       показывать именно россыпь, а не один забытый блок. */
    draft.priority = ''; draft.rationale = ''; draft.executor = ''; draft.dEE = '';
  }
}

const demo = new URLSearchParams(location.search).get('demo');
if (demo) applyDemo(demo);

render();
