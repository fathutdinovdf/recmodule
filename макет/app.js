/* Реестр мероприятий — поведение макета.
   Отдельной строки фильтров нет: всё управление отбором живёт в заголовках
   колонок. Воронка на колонке-справочнике даёт чек-лист значений, воронка на
   текстовой колонке — поиск по подстроке, воронка на дате — выбор периода. */

/* ------------------------------ колонки ------------------------------ */

const COLUMNS = [
/* Ширины по умолчанию. Колонки с длинным текстом получают запас, колонки с
   короткими значениями — минимум, в который влезает значение и иконки
   заголовка; подпись при этом обрезается, полное название — в подсказке. */
  { key: 'number',        label: '№',                             visible: true,  w: 100, search: true, cls: 'cell-num' },
  { key: 'regDate',       label: 'Дата регистрации',              visible: true,  w: 136, type: 'datetime', period: true },
  { key: 'formDate',      label: 'Дата формирования',             visible: false, w: 136, type: 'datetime' },
  { key: 'field',         label: 'Месторождение',                 visible: true,  w: 172, filter: true, clip1: true },
  { key: 'direction',     label: 'Направление',                   visible: true,  w: 152, filter: true, clip1: true },
  { key: 'kust',          label: 'Куст',                          visible: false, w: 76,  filter: true },
  { key: 'well',          label: 'Скважина',                      visible: true,  w: 110, filter: true },
  { key: 'problem',       label: 'Проблема / отклонение',         visible: true,  w: 230, clip: true, text: true },
  { key: 'action',        label: 'Рекомендуемое мероприятие',     visible: false, w: 260, clip: true, text: true },
  { key: 'rationale',     label: 'Технологическое обоснование',   visible: false, w: 260, clip: true, text: true },
  { key: 'priority',      label: 'Приоритет',                     visible: true,  w: 114, filter: true },
  { key: 'executor',      label: 'Ответственный Исполнителя',     visible: true,  w: 94,  filter: true },
  { key: 'status',        label: 'Текущий статус',                visible: true,  w: 150, filter: true },
  { key: 'sentAt',        label: 'Дата/время передачи',           visible: false, w: 136, type: 'datetime' },
  { key: 'openedAt',      label: 'Открыто Заказчиком',            visible: false, w: 136, type: 'datetime' },
  { key: 'dueAt',         label: 'Ожидаемый срок обратной связи', visible: false, w: 116, type: 'datetime' },
  { key: 'repliedAt',     label: 'Дата/время обратной связи',     visible: false, w: 116, type: 'datetime' },
  { key: 'control',       label: 'Контроль ответа',               visible: true,  w: 148, filter: true },
  { key: 'decision',      label: 'Решение Заказчика',             visible: true,  w: 130, filter: true },
  { key: 'rejectReason',  label: 'Обоснование при отклонении',    visible: false, w: 240, clip: true, text: true },
  { key: 'customer',      label: 'Ответственный Заказчика',       visible: false, w: 130, filter: true },
  { key: 'factDate',      label: 'Дата фактической реализации',   visible: false, w: 128, type: 'date' },
  { key: 'completeness',  label: 'Полнота реализации',            visible: false, w: 116, filter: true },
  { key: 'windowOpenAt',  label: 'Дата открытия окна эффекта',    visible: false, w: 116, type: 'date' },
  { key: 'windowCloseAt', label: 'Дата закрытия окна',            visible: false, w: 116, type: 'date' },
  { key: 'commentsCount', label: 'Комментарии',                   visible: false, w: 96,  num: true },
  { key: 'isPrimary',     label: 'Первичность',                   visible: false, w: 92,  filter: true },
  { key: 'expectQzh',     label: 'Ожид. Δ Qж, м³/сут',            visible: false, w: 104, num: true },
  { key: 'expectQn',      label: 'Ожид. Δ Qн, т/сут',             visible: false, w: 104, num: true },
  { key: 'expectEE',      label: 'Ожид. Δ ЭЭ, кВт·ч',            visible: false, w: 104, num: true },
  { key: 'forecast',      label: 'Прогнозный эффект, руб',        visible: false, w: 132, num: true },
  { key: 'attachments',   label: 'Вложения',                      visible: false, w: 84,  num: true },
];

/* Таблица цветов кружка статуса — STATUS_TONE — лежит в data.js: её использует
   и реестр, и карточка рекомендации. */

const PRIO_ORDER = { I: 0, II: 1, III: 2 };
const CTRL_ORDER = { overdue: 0, late: 1, waiting: 2, ok: 3, none: 4 };
const MIN_COL_W = 56;

/* Порядок по умолчанию, когда сортировка выключена: реестр читают сверху,
   от свежих мероприятий. Он же — состояние после третьего клика. */
const DEFAULT_SORT = { key: 'regDate', dir: 'desc' };

/* Первое направление зависит от типа колонки: у дат осмысленно начинать
   с новых, у остальных — с начала алфавита или с меньшего значения.
   У приоритета возрастание — это I, II, III, у контроля ответа — просрочки
   первыми, то есть оба тоже начинают с возрастания. */
function firstDir(c) { return c.type === 'datetime' ? 'desc' : 'asc'; }

/* ------------------------------ состояние ------------------------------ */

/* ---------- отбор из адреса ----------

   Реестр — конечная точка всех глубоких ссылок: из уведомлений, из инбокса,
   из переписки в LUKTEAM. Раньше из адреса читался только `alert`, поэтому
   инбокс мог сослаться на «просроченные», но не на «согласовано, работ нет»
   и не на зону ответственности инженера — такие блоки обрывались без выхода
   в реестр.

   Теперь читаются три вещи:
     ?alert=overdue|soon|window — готовые срезы по срочности;
     ?tile=approved             — плитка-счётчик;
     ?field=A|B&executor=Тевс   — фильтр по любой колонке-справочнику.
   Последнее общее: одна механика покрывает и зону ответственности (набор
   месторождений), и «мои рекомендации», и что угодно ещё, вместо отдельного
   параметра под каждый случай. */

const QUERY = new URLSearchParams(location.search);

/** Плитка из адреса — только существующая: опечатка в ссылке иначе молча
    отфильтровала бы реестр в ноль, и человек решил бы, что данных нет. */
function tileFromQuery() {
  const key = QUERY.get('tile');
  return key && TILES.some((t) => t.key === key) ? key : null;
}

/** Фильтры колонок из адреса. Значения разделяются вертикальной чертой:
    в названиях месторождений есть и запятые, и скобки, и дефисы. */
function colFiltersFromQuery() {
  const out = {};
  for (const c of COLUMNS) {
    if (!c.filter) continue;
    const raw = QUERY.get(c.key);
    if (!raw) continue;
    const set = new Set(raw.split('|').map((v) => v.trim()).filter(Boolean));
    if (set.size) out[c.key] = set;
  }
  return out;
}

const state = {
  tile: tileFromQuery(),
  /* Кнопок-срезов в интерфейсе нет, но сам отбор остался: он нужен для
     глубоких ссылок из уведомлений — index.html?alert=overdue. */
  alert: QUERY.get('alert') || null,
  period: '',
  colFilters: colFiltersFromQuery(),  // ключ колонки → Set выбранных значений
  textFilters: {},         // ключ колонки → строка поиска
  colWidths: {},           // ключ колонки → ширина, заданная перетаскиванием
  sort: null,              // null = сортировка выключена, действует DEFAULT_SORT
  page: 1,
  pageSize: 50,
};

/* ------------------------------ помощники ------------------------------ */

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/"/g, '&quot;');

function fmtDateTime(d) {
  if (!d) return '';
  const x = toDate(d);
  if (isNaN(x)) return String(d);
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/* Дата без времени по стандарту читается как UTC и в местном поясе съезжает,
   поэтому такие строки разбираем как локальную полночь. Один помощник на файл:
   разные способы разбора в соседних строках рано или поздно разойдутся. */
function toDate(d) {
  if (d instanceof Date) return d;
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00` : d);
}

function fmtDate(d) {
  if (!d) return '';
  const x = toDate(d);
  if (isNaN(x)) return String(d);
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
}

function fmtDur(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${mm} мин`;
  return `${mm} мин`;
}

function cellValue(rec, key) {
  switch (key) {
    case 'formDate': return rec.regDate;
    case 'priority': return rec.priorityLabel;
    case 'status':   return rec.statusLabel;
    case 'isPrimary': return rec.isPrimary ? 'Первичная' : 'Повторная';
    case 'completeness': return rec.completenessLabel || '';
    default: return rec[key];
  }
}

function sortValue(rec, key) {
  if (key === 'priority') return PRIO_ORDER[rec.priority];
  if (key === 'control') return CTRL_ORDER[rec.controlKind];
  const v = cellValue(rec, key);
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return (v ?? '').toString().toLowerCase();
}

function colWidth(c) { return state.colWidths[c.key] || c.w; }

/* ------------------------------ выборка ------------------------------ */

function tileOf(rec) {
  return TILES.find((t) => t.statuses.includes(rec.status));
}

function inPeriod(rec) {
  if (!state.period) return true;
  if (state.period === 'month') {
    return rec.regDate.getMonth() === NOW.getMonth() && rec.regDate.getFullYear() === NOW.getFullYear();
  }
  return (NOW - rec.regDate) <= Number(state.period) * 86400000;
}

function matchesAlert(rec) {
  if (!state.alert) return true;
  if (state.alert === 'overdue') return rec.controlKind === 'overdue';
  if (state.alert === 'soon') return rec.controlKind === 'waiting' && rec.controlDelta <= 2 * 3600 * 1000;
  if (state.alert === 'window') {
    if (!rec.windowCloseAt) return false;
    const d = toDate(rec.windowCloseAt) - NOW;
    return d >= 0 && d <= 7 * 86400000;
  }
  return true;
}

function filtered() {
  return DATA.filter((rec) => {
    if (state.tile) {
      const t = tileOf(rec);
      if (!t || t.key !== state.tile) return false;
    }
    if (!matchesAlert(rec)) return false;
    if (!inPeriod(rec)) return false;

    for (const [key, set] of Object.entries(state.colFilters)) {
      if (!set || !set.size) continue;
      if (!set.has(String(cellValue(rec, key) ?? ''))) return false;
    }
    for (const [key, q] of Object.entries(state.textFilters)) {
      if (!q) continue;
      if (!String(cellValue(rec, key) ?? '').toLowerCase().includes(q.toLowerCase())) return false;
    }
    return true;
  });
}

function sorted(rows) {
  const { key, dir } = state.sort || DEFAULT_SORT;
  const k = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key); const vb = sortValue(b, key);
    if (va < vb) return -1 * k;
    if (va > vb) return 1 * k;
    return 0;
  });
}

/* ------------------------------ отрисовка ------------------------------ */

function renderTiles() {
  $('#tiles').innerHTML = TILES.map((t) => {
    const n = DATA.filter((r) => t.statuses.includes(r.status)).length;
    return `<button class="tile ${state.tile === t.key ? 'is-on' : ''}" data-tile="${t.key}">
      <span class="tile__n">${n}</span><span class="tile__l">${t.label}</span></button>`;
  }).join('');
}

function renderHead() {
  const cols = COLUMNS.filter((c) => c.visible);

  $('#cg').innerHTML = cols.map((c) => `<col data-col="${c.key}" style="width:${colWidth(c)}px">`).join('');
  $('#tbl').style.width = cols.reduce((s, c) => s + colWidth(c), 0) + 'px';

  $('#thead').innerHTML = '<tr>' + cols.map((c) => {
    const isSort = !!state.sort && state.sort.key === c.key;
    const filterOn = (state.colFilters[c.key] && state.colFilters[c.key].size)
      || state.textFilters[c.key];
    const hint = !isSort ? 'сортировать'
      : state.sort.dir === firstDir(c) ? 'сменить направление' : 'отключить сортировку';
    return `<th data-col="${c.key}">
      <span class="th">
        <span class="th__t ${isSort ? 'is-sorted' : ''}" data-sort="${c.key}" title="${c.label} — ${hint}">
          <span class="th__label">${c.label}</span>
          ${isSort ? `<svg class="ic-th th__arrow ${state.sort.dir === 'asc' ? 'is-asc' : ''}"><use href="#i-sort"/></svg>` : ''}
        </span>
        ${c.search ? `<span class="th__i ${filterOn ? 'is-on' : ''}" data-text="${c.key}"
              title="Поиск по номеру"><svg class="ic-th"><use href="#i-search"/></svg></span>` : ''}
        ${c.text ? `<span class="th__i ${filterOn ? 'is-on' : ''}" data-text="${c.key}"
              title="Поиск по тексту"><svg class="ic-th"><use href="#i-search"/></svg></span>` : ''}
        ${c.filter ? `<span class="th__i ${filterOn ? 'is-on' : ''}" data-filter="${c.key}"
              title="Фильтр"><svg class="ic-th"><use href="#i-funnel"/></svg></span>` : ''}
        ${c.period ? `<span class="th__i ${state.period ? 'is-on' : ''}" data-period="${c.key}"
              title="Период"><svg class="ic-th"><use href="#i-funnel"/></svg></span>` : ''}
      </span>
      <span class="resizer" data-resize="${c.key}"></span></th>`;
  }).join('') + '</tr>';
}

function renderCell(rec, c) {
  const v = cellValue(rec, c.key);

  if (c.key === 'number') {
    return rec.status === 'draft'
      ? '<span class="mark">черновик</span>'
      : `<a href="card.html?id=${rec.id}" data-card title="Открыть карточку рекомендации">${v}</a>`;
  }
  if (c.type === 'datetime') return `<span class="cell-date">${fmtDateTime(v)}</span>`;
  if (c.type === 'date') return `<span class="cell-date">${fmtDate(v)}</span>`;
  /* Приоритет и контроль ответа теряют смысл, как только вопрос ответа
     Заказчика закрыт — см. SLA_VISIBLE_STATUSES в data.js. */
  if ((c.key === 'priority' || c.key === 'control') && !SLA_VISIBLE_STATUSES.includes(rec.status)) {
    return '<span class="mark">—</span>';
  }
  if (c.key === 'priority') {
    return `<span class="prio prio--${rec.priority}" title="${rec.priorityLabel}">${rec.priority}<i>${rec.sla} ч</i></span>`;
  }
  if (c.key === 'status') {
    const [tone, filled] = STATUS_TONE[rec.status] || ['neutral', false];
    return `<span class="status"><i class="status__d status__d--${tone} ${filled ? '' : 'is-hollow'}"></i>${rec.statusLabel}</span>`;
  }
  if (c.key === 'control') {
    if (rec.controlKind === 'none') return '<span class="tag tag--default">нет срока</span>';
    if (rec.controlKind === 'pending') {
      return `<span class="tag tag--pending" title="Заказчику уйдёт с началом рабочего дня">
        передача ${fmtDateTime(rec.sentAt).slice(0, 5)} ${fmtDateTime(rec.sentAt).slice(11)}</span>`;
    }
    const label = { ok: 'в срок', late: 'с опозданием', overdue: 'просрочено', waiting: 'осталось' }[rec.controlKind];
    const suffix = rec.controlKind === 'ok' ? '' : ` ${fmtDur(rec.controlDelta)}`;
    return `<span class="tag tag--${rec.controlKind}">${label}${suffix}</span>`;
  }
  if (c.key === 'decision') {
    if (!v) return '<span class="mark">—</span>';
    const kind = v === 'Принята' ? 'ok' : v === 'Отклонена' ? 'late' : 'warning';
    return `<span class="tag tag--${kind}">${v}</span>`;
  }
  if (c.key === 'problem') {
    const flag = rec.note ? `<span class="note-flag" title="${esc(rec.note)}">*</span>` : '';
    return `<div class="clip" title="${esc(v)}">${v || ''}${flag}</div>`;
  }
  if (c.clip) return `<div class="clip" title="${esc(v)}">${v || ''}</div>`;
  if (c.clip1) return `<div class="clip1" title="${esc(v)}">${v || ''}</div>`;
  if (c.num) return v === undefined || v === null ? '<span class="mark">—</span>'
    : `<span class="cell-num">${typeof v === 'number' ? v.toLocaleString('ru-RU') : v}</span>`;
  return v === undefined || v === null || v === '' ? '<span class="mark">—</span>' : String(v);
}

function renderBody(rows) {
  const cols = COLUMNS.filter((c) => c.visible);
  const start = (state.page - 1) * state.pageSize;
  const slice = rows.slice(start, start + state.pageSize);

  if (!slice.length) {
    $('#tbody').innerHTML = `<tr><td colspan="${cols.length}" class="empty">
      Ничего не найдено. Снимите часть фильтров.</td></tr>`;
    return;
  }

  /* Строки не заливаются целиком. Единственное состояние, требующее действия
     прямо сейчас, — не полученный вовремя ответ; оно помечается кромкой слева. */
  $('#tbody').innerHTML = slice.map((rec) => {
    const cls = [];
    if (rec.controlKind === 'overdue') cls.push('row-overdue');
    if (rec.status === 'cancelled' || rec.status === 'draft') cls.push('row-muted');
    return `<tr class="${cls.join(' ')}">` + cols.map((c) =>
      `<td data-col="${c.key}" class="${c.cls || ''} ${c.num ? 'cell-num' : ''}">${renderCell(rec, c)}</td>`
    ).join('') + '</tr>';
  }).join('');
}

function renderPager(total) {
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > pages) state.page = pages;
  const from = total ? (state.page - 1) * state.pageSize + 1 : 0;
  const to = Math.min(total, state.page * state.pageSize);
  $('#pagerInfo').textContent = total === DATA.length
    ? `${from}–${to} из ${total}`
    : `${from}–${to} из ${total} отобранных · всего в реестре ${DATA.length}`;

  const btns = [`<button class="pgbtn" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>`];
  let gap = false;
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && p > 2 && p < pages - 1 && Math.abs(p - state.page) > 1) {
      if (!gap) { btns.push('<span class="pgbtn pgbtn--gap">…</span>'); gap = true; }
      continue;
    }
    gap = false;
    btns.push(`<button class="pgbtn ${p === state.page ? 'is-on' : ''}" data-page="${p}">${p}</button>`);
  }
  btns.push(`<button class="pgbtn" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>›</button>`);
  $('#pagerPages').innerHTML = btns.join('');
}

function render() {
  renderTiles();
  renderHead();
  const rows = sorted(filtered());
  const anyFilter = state.tile || state.alert || state.period
    || Object.keys(state.colFilters).length
    || Object.values(state.textFilters).some(Boolean);
  /* Кнопка сброса живёт в подвале таблицы, рядом со счётчиком отобранного.
     Подвал есть всегда, поэтому её появление ничего не сдвигает. */
  $('#btnReset').hidden = !anyFilter;
  renderBody(rows);
  renderPager(rows.length);
}

/* ------------------------------ поповеры ------------------------------ */

function closePopover() { $('#popover').hidden = true; }

function openPopover(anchor, html, onMount) {
  const p = $('#popover');
  p.innerHTML = html;
  p.hidden = false;
  const r = anchor.getBoundingClientRect();
  p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - p.offsetWidth - 12)) + 'px';
  p.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - p.offsetHeight - 12)) + 'px';
  if (onMount) onMount(p);
}

function openFilterPopover(anchor, key) {
  const counts = new Map();
  for (const rec of DATA) {
    const v = String(cellValue(rec, key) ?? '');
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const values = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
  const cur = state.colFilters[key] || new Set();

  openPopover(anchor, `
    <label class="field"><svg class="ic16 field__icon"><use href="#i-search"/></svg>
      <input type="search" id="pfq" placeholder="Поиск…"></label>
    <div class="popover__list" id="pflist">
      ${values.map((v) => `<label class="popover__row" data-v="${esc(v)}">
        <input type="checkbox" ${cur.has(v) ? 'checked' : ''}>
        <span>${v || '—'}</span><small>${counts.get(v)}</small></label>`).join('')}
    </div>
    <div class="popover__foot">
      <button class="btn btn--accent" id="pfApply">Применить</button>
      <button class="btn" id="pfReset">Сбросить</button>
    </div>`, (p) => {
    p.querySelector('#pfq').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      p.querySelectorAll('.popover__row').forEach((row) => {
        row.style.display = row.dataset.v.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    p.querySelector('#pfApply').addEventListener('click', () => {
      const set = new Set();
      p.querySelectorAll('.popover__row').forEach((row) => {
        if (row.querySelector('input').checked) set.add(row.dataset.v);
      });
      if (set.size) state.colFilters[key] = set; else delete state.colFilters[key];
      state.page = 1; closePopover(); render();
    });
    p.querySelector('#pfReset').addEventListener('click', () => {
      delete state.colFilters[key];
      state.page = 1; closePopover(); render();
    });
  });
}

function openTextPopover(anchor, key) {
  const col = COLUMNS.find((c) => c.key === key);
  openPopover(anchor, `
    <label class="field"><svg class="ic16 field__icon"><use href="#i-search"/></svg>
      <input type="search" id="ptq" placeholder="${col.key === 'number' ? 'Номер рекомендации…' : 'Поиск по тексту…'}"
             value="${esc(state.textFilters[key] || '')}"></label>
    <div class="popover__foot">
      <button class="btn btn--accent" id="ptApply">Применить</button>
      <button class="btn" id="ptReset">Сбросить</button>
    </div>`, (p) => {
    const input = p.querySelector('#ptq');
    input.focus();
    const apply = () => {
      const v = input.value.trim();
      if (v) state.textFilters[key] = v; else delete state.textFilters[key];
      state.page = 1; closePopover(); render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    p.querySelector('#ptApply').addEventListener('click', apply);
    p.querySelector('#ptReset').addEventListener('click', () => {
      delete state.textFilters[key];
      state.page = 1; closePopover(); render();
    });
  });
}

function openPeriodPopover(anchor) {
  const opts = [['', 'весь период'], ['7', 'последние 7 дней'],
    ['30', 'последние 30 дней'], ['month', 'текущий месяц']];
  openPopover(anchor, `
    <div class="popover__list">
      ${opts.map(([v, l]) => `<label class="popover__row">
        <input type="radio" name="per" value="${v}" ${state.period === v ? 'checked' : ''}>
        <span>${l}</span></label>`).join('')}
    </div>`, (p) => {
    p.querySelectorAll('input[name=per]').forEach((r) => {
      r.addEventListener('change', () => {
        state.period = r.value; state.page = 1; closePopover(); render();
      });
    });
  });
}

function openColumnsPopover(anchor) {
  openPopover(anchor, `
    <div class="popover__list">
      ${COLUMNS.map((c, i) => `<label class="popover__row">
        <input type="checkbox" data-i="${i}" ${c.visible ? 'checked' : ''}>
        <span>${c.label}</span></label>`).join('')}
    </div>
    <div class="popover__foot"><button class="btn" id="pcClose">Готово</button></div>`, (p) => {
    p.querySelectorAll('input[data-i]').forEach((cb) => {
      cb.addEventListener('change', () => {
        COLUMNS[Number(cb.dataset.i)].visible = cb.checked;
        render();
      });
    });
    p.querySelector('#pcClose').addEventListener('click', closePopover);
  });
}

/* ------------------------------ ширина колонок ------------------------------ */

let drag = null;

function startResize(e, key) {
  const col = COLUMNS.find((c) => c.key === key);
  drag = { key, startX: e.clientX, startW: colWidth(col) };
  document.body.classList.add('is-resizing');
  e.preventDefault();
}

document.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const w = Math.max(MIN_COL_W, drag.startW + (e.clientX - drag.startX));
  state.colWidths[drag.key] = w;
  const col = $(`#cg col[data-col="${drag.key}"]`);
  if (col) col.style.width = w + 'px';
  const cols = COLUMNS.filter((c) => c.visible);
  $('#tbl').style.width = cols.reduce((s, c) => s + colWidth(c), 0) + 'px';
});

document.addEventListener('mouseup', () => {
  if (!drag) return;
  drag = null;
  document.body.classList.remove('is-resizing');
});

/* ------------------------------ события ------------------------------ */

document.addEventListener('mousedown', (e) => {
  const rz = e.target.closest('[data-resize]');
  if (rz) startResize(e, rz.dataset.resize);
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-resize]')) return;

  /* Карточка листается по той же выборке, что показана в реестре: со всеми
     фильтрами и текущей сортировкой, а не по всему реестру подряд. Поэтому
     при переходе отдаём карточке список отобранных id и позицию в нём. */
  const openCard = e.target.closest('a[data-card]');
  if (openCard) {
    try {
      sessionStorage.setItem('vmap.selection',
        JSON.stringify(sorted(filtered()).map((r) => r.id)));
    } catch (err) { /* file:// без доступа к хранилищу — карточка листает весь реестр */ }
    return;
  }

  const tile = e.target.closest('[data-tile]');
  if (tile) {
    state.tile = state.tile === tile.dataset.tile ? null : tile.dataset.tile;
    state.page = 1; closePopover(); render(); return;
  }
  const f = e.target.closest('[data-filter]');
  if (f) { openFilterPopover(f, f.dataset.filter); return; }

  const t = e.target.closest('[data-text]');
  if (t) { openTextPopover(t, t.dataset.text); return; }

  const per = e.target.closest('[data-period]');
  if (per) { openPeriodPopover(per); return; }

  const s = e.target.closest('[data-sort]');
  if (s) {
    /* Три такта: включить → сменить направление → выключить. */
    const key = s.dataset.sort;
    const col = COLUMNS.find((c) => c.key === key);
    const first = firstDir(col);
    if (!state.sort || state.sort.key !== key) state.sort = { key, dir: first };
    else if (state.sort.dir === first) state.sort = { key, dir: first === 'asc' ? 'desc' : 'asc' };
    else state.sort = null;
    closePopover(); render(); return;
  }
  const pg = e.target.closest('[data-page]');
  if (pg && !pg.disabled) {
    state.page = Number(pg.dataset.page);
    closePopover(); render();
    $('.tablewrap').scrollTop = 0;
    return;
  }
  if (e.target.closest('#btnCols')) { openColumnsPopover($('#btnCols')); return; }

  if (!e.target.closest('#popover')) closePopover();
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });

$('#btnReset').addEventListener('click', () => {
  state.tile = null; state.alert = null; state.period = '';
  state.colFilters = {}; state.textFilters = {}; state.page = 1;
  render();
});

$('#pageSize').addEventListener('change', (e) => {
  state.pageSize = Number(e.target.value); state.page = 1; render();
});

/* ------------------------------ старт ------------------------------ */

render();
