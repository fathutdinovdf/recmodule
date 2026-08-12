/* Экономическая модель — отдельный числовой редактор.

   Значения меняются пакетом: ввод в ячейке создаёт черновик, но не трогает
   исходные ECON_* до общего подтверждения. Это важно не только для удобства:
   частично применённая строка при ошибке в последнем поле дала бы расчёту
   смесь двух версий модели.

   Каждое сохранение требует причины и образует одну версию с полным diff.
   В рабочем приложении право и атомарность обеспечиваются сервером; статический
   экран воспроизводит ту же модель поведения в памяти. */

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');
const USER = 'Фатхутдинов Д.Ф.';
const CAN_EDIT = ECONOMY_EDITORS.includes(USER);

function fmtDT(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function plural(n, forms) {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const GLOBAL_FIELDS = [
  { key: 'oilPriceFact', label: 'Цена нефти — факт', unit: 'руб/т нефти', min: 0, positive: true },
  { key: 'oilPriceMsu', label: 'Цена нефти — МСУ', unit: 'руб/т нефти', min: 0, positive: true },
  { key: 'uptime', label: 'Коэффициент эксплуатации', unit: 'доля от 0 до 1', min: 0, max: 1, positive: true },
];

/* Короткие подписи нужны таблице, полные — aria-label и всплывающей подсказке.
   Ширину задают колонки, а не сжатие текста: основания умножения различаются,
   и перепутать «тонну жидкости» с «тонной нефти» дороже горизонтального скролла. */
const RATE_FIELDS = [
  { key: 'lift', label: 'Подъём', full: 'Электроэнергия на подъём жидкости, руб/т жидкости', nullable: true },
  { key: 'ppd', label: 'ППД', full: 'Электроэнергия на ППД, руб/т жидкости', nullable: true },
  { key: 'transport', label: 'Транспорт', full: 'Электроэнергия на транспорт, руб/т жидкости', nullable: true },
  { key: 'prep', label: 'Подготовка', full: 'Электроэнергия на подготовку, руб/т нефти', nullable: true },
  { key: 'chem', label: 'Реагенты', full: 'Деэмульгаторы, руб/т нефти', nullable: true },
  { key: 'espEcn', label: 'Обслуживание ЭЦН', full: 'Обслуживание ЭЦН, тыс. руб/год на скважину', nullable: true },
  { key: 'espShgn', label: 'Обслуживание ШГН', full: 'Обслуживание ШГН, тыс. руб/год на скважину', nullable: true },
  { key: 'espEvn', label: 'Обслуживание ЭВН', full: 'Обслуживание ЭВН, тыс. руб/год на скважину', nullable: true },
  /* В исходной модели есть отрицательные темпы. Запрещать их общей проверкой
     нельзя: это блокировало сохранение любой другой ячейки той же строки. */
  { key: 'decline', label: 'Темп падения', full: 'Годовой темп падения дебита нефти, %', nullable: true, signed: true },
];

const NDPI_FIELDS = [
  { key: 'ndpiFact', label: 'Ставка факт', full: 'Ставка НДПИ по фактическим ценам, руб/т нефти' },
  { key: 'ndpiMsu', label: 'Ставка МСУ', full: 'Ставка НДПИ по МСУ, руб/т нефти' },
];

const committed = {
  global: { ...ECON_GLOBAL },
  rates: ECON_RATES.map((r) => ({ ...r })),
  ndpi: NDPI_RATES.map((r) => ({ ...r })),
};

let activeTab = 'rates';
let drawer = null;              // null | history | review
let historyFilter = 'all';
let versionSeq = 2;
const dirty = new Map();        // key → { scope, row, field, raw }
const errors = new Map();       // key → message

const history = [{
  version: 'ЭМ-20260708-001', at: new Date('2026-07-08T10:22'), effectiveFrom: new Date('2026-07-08T10:22'),
  actor: USER, reason: 'Загружена исходная версия экономической модели Заказчика.', scope: 'all', changes: [],
}];

function editKey(scope, row, field) { return `${scope}:${row}:${field}`; }

function originalValue(scope, row, field) {
  return scope === 'global' ? committed.global[field] : committed[scope][Number(row)][field];
}

function objectName(scope, row) {
  if (scope === 'global') return 'Общие параметры';
  const item = committed[scope][Number(row)];
  return scope === 'rates' ? item.field : `${item.field} — ${item.plast}`;
}

function fieldSpec(scope, field) {
  if (scope === 'global') return GLOBAL_FIELDS.find((f) => f.key === field);
  if (scope === 'rates') return RATE_FIELDS.find((f) => f.key === field);
  if (field === 'regime') return { key: 'regime', label: 'Налоговый режим' };
  return NDPI_FIELDS.find((f) => f.key === field);
}

function inputValue(value) {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

function shownValue(value) {
  if (value === null || value === undefined || value === '') return 'не задано';
  if (typeof value === 'number') return value.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
  return String(value);
}

function parseValue(scope, field, raw) {
  if (field === 'regime') {
    return ['НДПИ', 'НДД'].includes(raw)
      ? { value: raw, error: '' }
      : { value: null, error: 'Выберите НДПИ или НДД.' };
  }

  const spec = fieldSpec(scope, field);
  const text = String(raw).trim().replace(',', '.');
  if (text === '') {
    if (spec.nullable) return { value: null, error: '' };
    return { value: null, error: 'Поле не может быть пустым.' };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { value: null, error: 'Введите число.' };
  if (!spec.signed && value < 0) return { value, error: 'Значение не может быть отрицательным.' };
  if (spec.positive && value <= 0) return { value, error: 'Значение должно быть больше нуля.' };
  if (spec.max !== undefined && value > spec.max) return { value, error: `Значение не может быть больше ${spec.max}.` };
  return { value, error: '' };
}

function sameValue(a, b) {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  return a === b;
}

function valueFor(scope, row, field) {
  const key = editKey(scope, row, field);
  return dirty.has(key) ? dirty.get(key).raw : inputValue(originalValue(scope, row, field));
}

function inputHtml(scope, row, field, label) {
  const key = editKey(scope, row, field);
  const classes = ['econcell', dirty.has(key) ? 'is-dirty' : '', errors.has(key) ? 'has-error' : ''].filter(Boolean).join(' ');
  const title = errors.get(key) || (dirty.has(key) ? 'Изменено, ещё не сохранено' : label);
  return `<td class="${classes}" data-cell-key="${key}" title="${esc(title)}">
    <input class="econinput" value="${esc(valueFor(scope, row, field))}" placeholder="не задано"
      inputmode="decimal" data-scope="${scope}" data-row="${row}" data-field="${field}"
      aria-label="${esc(label)}" ${CAN_EDIT ? '' : 'readonly'}></td>`;
}

function renderGlobal() {
  return `<div class="globalgrid">${GLOBAL_FIELDS.map((field) => {
    const key = editKey('global', 'global', field.key);
    const classes = ['globalfield', 'econcell', dirty.has(key) ? 'is-dirty' : '', errors.has(key) ? 'has-error' : ''].filter(Boolean).join(' ');
    return `<label class="${classes}" data-cell-key="${key}" title="${esc(errors.get(key) || '')}">
      <span class="globalfield__label">${field.label}</span>
      <input class="econinput" value="${esc(valueFor('global', 'global', field.key))}" inputmode="decimal"
        data-scope="global" data-row="global" data-field="${field.key}" aria-label="${field.label}"
        ${CAN_EDIT ? '' : 'readonly'}>
      <span class="globalfield__unit">${field.unit}</span>
    </label>`;
  }).join('')}</div>`;
}

function renderRates() {
  return `<div class="econtablewrap"><table class="tbl econtable">
    <thead><tr><th scope="col">Месторождение</th>${RATE_FIELDS.map((f) =>
      `<th scope="col" title="${esc(f.full)}">${f.label}</th>`).join('')}<th scope="col">Коэф. падения</th></tr></thead>
    <tbody>${committed.rates.map((item, row) => `<tr>
      <td class="cell-object"><div class="clip1" title="${esc(item.field)}">${esc(item.field)}</div></td>
      ${RATE_FIELDS.map((f) => inputHtml('rates', row, f.key, `${f.full}: ${item.field}`)).join('')}
      <td class="cell-num" data-decline-preview="${row}">${shownValue(previewDeclineK(row))}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function previewDeclineK(row) {
  const key = editKey('rates', row, 'decline');
  const parsed = dirty.has(key) ? parseValue('rates', 'decline', dirty.get(key).raw) : { value: committed.rates[row].decline, error: '' };
  if (parsed.error || parsed.value === null) return null;
  return +Math.min(1, Math.max(0.87, (100 - parsed.value / 2) / 100)).toFixed(4);
}

function renderNdpi() {
  return `<div class="econtablewrap"><table class="tbl econtable">
    <thead><tr><th scope="col">Месторождение</th><th scope="col">Пласт</th><th scope="col">Налоговый режим</th>
      ${NDPI_FIELDS.map((f) => `<th scope="col" title="${esc(f.full)}">${f.label}</th>`).join('')}</tr></thead>
    <tbody>${committed.ndpi.map((item, row) => {
      const regimeKey = editKey('ndpi', row, 'regime');
      return `<tr><td class="cell-object"><div class="clip1" title="${esc(item.field)}">${esc(item.field)}</div></td>
        <td class="cell-plast"><div class="clip1" title="${esc(item.plast)}">${esc(item.plast)}</div></td>
        <td class="econcell cell-regime ${dirty.has(regimeKey) ? 'is-dirty' : ''}" data-cell-key="${regimeKey}">
          <select class="econinput" data-scope="ndpi" data-row="${row}" data-field="regime" aria-label="Налоговый режим: ${esc(item.field)}, ${esc(item.plast)}" ${CAN_EDIT ? '' : 'disabled'}>
            ${['НДПИ', 'НДД'].map((v) => `<option ${valueFor('ndpi', row, 'regime') === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select></td>
        ${NDPI_FIELDS.map((f) => inputHtml('ndpi', row, f.key, `${f.full}: ${item.field}, ${item.plast}`)).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderContent() {
  const title = {
    global: 'Параметры, действующие для всех месторождений.',
    rates: 'Ставки затрат по узлам ВМАП. Пустая ячейка останавливает расчёт; ноль означает отсутствие затрат.',
    ndpi: 'Ставки по паре «месторождение + пласт». Скважина без привязанного пласта в расчёт не попадает.',
  };
  $('#econTitle').textContent = title[activeTab];
  $('#econContent').innerHTML = activeTab === 'global' ? renderGlobal() : activeTab === 'rates' ? renderRates() : renderNdpi();
  document.querySelectorAll('[data-tab]').forEach((b) => {
    const on = b.dataset.tab === activeTab;
    b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on));
  });
}

function dirtySummary() {
  const rows = new Set([...dirty.values()].map((d) => `${d.scope}:${d.row}`));
  return `${dirty.size} ${plural(dirty.size, ['изменение', 'изменения', 'изменений'])} в ${rows.size} ${plural(rows.size, ['строке', 'строках', 'строках'])}`;
}

function renderDirtyBar() {
  const bar = $('#dirtyBar');
  if (!dirty.size) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  bar.innerHTML = `<div class="dirtybar__text">${dirtySummary()}</div>
    ${errors.size ? `<div class="dirtybar__err">Исправьте ошибок: ${errors.size}</div>` : ''}
    <button class="btn" data-act="cancelAll">Отменить</button>
    <button class="btn btn--accent" data-act="review" ${errors.size ? 'disabled' : ''}>Сохранить изменения</button>`;
}

function changeList(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const name = entry.object;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(entry);
  }
  return [...groups.entries()].map(([name, changes]) => `<div class="changegroup">
    <div class="changegroup__object">${esc(name)}</div>
    ${changes.map((c) => `<div class="change"><span class="change__field">${esc(c.label)}</span>
      <span class="change__old">${esc(shownValue(c.oldValue))}</span><span class="change__arrow">→</span>
      <span class="change__new">${esc(shownValue(c.newValue))}</span></div>`).join('')}</div>`).join('');
}

function draftChanges() {
  return [...dirty.values()].map((d) => {
    const parsed = parseValue(d.scope, d.field, d.raw);
    return {
      ...d, object: objectName(d.scope, d.row), label: fieldSpec(d.scope, d.field).label,
      oldValue: originalValue(d.scope, d.row, d.field), newValue: parsed.value,
    };
  });
}

function renderReview() {
  const box = $('#econDrawer');
  box.hidden = false;
  box.innerHTML = `<header class="drawerhead"><div><h2 id="drawerTitle">Сохранение версии</h2>
      <p>${dirtySummary()}. Изменения вступят в силу ${fmtDT(NOW)}.</p></div>
      <button class="iconbtn iconbtn--lg" data-act="closeDrawer" title="Закрыть" aria-label="Закрыть панель"><svg class="ic16"><use href="#i-close"/></svg></button></header>
    <div class="drawerbody">
      <div class="reviewreason"><label for="changeReason">Причина изменения</label>
        <textarea id="changeReason" placeholder="Например: актуализация параметров по письму Заказчика…"></textarea>
        <div class="reviewerror" id="reviewError" hidden></div></div>
      ${changeList(draftChanges())}
      <div class="reviewactions"><button class="btn btn--accent" data-act="commit" disabled>Сохранить версию</button>
        <button class="btn" data-act="closeDrawer">Вернуться</button></div>
    </div>`;
  $('#changeReason').focus();
}

function renderHistory() {
  const box = $('#econDrawer');
  const entries = history.filter((h) => historyFilter === 'all' || h.scope === 'all' || h.scope === historyFilter);
  box.hidden = false;
  box.innerHTML = `<header class="drawerhead"><div><h2 id="drawerTitle">История изменений</h2>
      <p>Версии параметров экономической модели.</p></div>
      <button class="iconbtn iconbtn--lg" data-act="closeDrawer" title="Закрыть" aria-label="Закрыть историю"><svg class="ic16"><use href="#i-close"/></svg></button></header>
    <div class="drawerbody"><div class="drawerfilters">
      ${[['all', 'Все'], ['global', 'Общие'], ['rates', 'Месторождения'], ['ndpi', 'НДПИ']].map(([k, l]) =>
        `<button class="drawerfilter ${historyFilter === k ? 'is-on' : ''}" data-history-filter="${k}">${l}</button>`).join('')}</div>
      ${entries.map((tx) => `<article class="historytx"><div class="historytx__meta"><span>${esc(tx.version)}</span><span>${fmtDT(tx.at)}</span></div>
        <div class="historytx__reason">${esc(tx.reason)}</div>
        ${tx.changes.length ? changeList(tx.changes) : '<div class="change__field">Исходные значения загружены одним набором.</div>'}
        <div class="change__field">${esc(tx.actor)} · действует с ${fmtDT(tx.effectiveFrom)}</div></article>`).join('') || '<div class="change__field">Записей нет.</div>'}
    </div>`;
}

function renderDrawer() {
  const box = $('#econDrawer');
  if (!drawer) { box.hidden = true; box.innerHTML = ''; return; }
  if (drawer === 'review') renderReview(); else renderHistory();
}

function render() {
  $('#econAccess').innerHTML = CAN_EDIT
    ? '<svg class="ic16"><use href="#i-check"/></svg>Право редактирования выдано'
    : '<svg class="ic16"><use href="#i-lock"/></svg>Только просмотр';
  renderContent(); renderDirtyBar(); renderDrawer();
}

function updateDraft(input) {
  if (!CAN_EDIT) return;
  const { scope, row, field } = input.dataset;
  const key = editKey(scope, row, field);
  const raw = input.value;
  const parsed = parseValue(scope, field, raw);
  if (!parsed.error && sameValue(parsed.value, originalValue(scope, row, field))) {
    dirty.delete(key); errors.delete(key);
  } else {
    dirty.set(key, { scope, row, field, raw });
    if (parsed.error) errors.set(key, parsed.error); else errors.delete(key);
  }
  const cell = document.querySelector(`[data-cell-key="${CSS.escape(key)}"]`);
  if (cell) {
    cell.classList.toggle('is-dirty', dirty.has(key));
    cell.classList.toggle('has-error', errors.has(key));
    cell.title = errors.get(key) || (dirty.has(key) ? 'Изменено, ещё не сохранено' : '');
  }
  if (scope === 'rates' && field === 'decline') {
    const preview = document.querySelector(`[data-decline-preview="${row}"]`);
    if (preview) preview.textContent = shownValue(previewDeclineK(Number(row)));
  }
  renderDirtyBar();
}

function cancelOne(input) {
  const { scope, row, field } = input.dataset;
  const key = editKey(scope, row, field);
  dirty.delete(key); errors.delete(key); renderContent(); renderDirtyBar();
  const restored = document.querySelector(`[data-scope="${scope}"][data-row="${row}"][data-field="${field}"]`);
  if (restored) { restored.focus(); restored.select?.(); }
}

function validateDraft() {
  errors.clear();
  for (const [key, d] of dirty) {
    const parsed = parseValue(d.scope, d.field, d.raw);
    if (parsed.error) errors.set(key, parsed.error);
  }
  renderContent(); renderDirtyBar();
  return !errors.size;
}

function applyChange(change) {
  if (change.scope === 'global') {
    committed.global[change.field] = change.newValue;
    ECON_GLOBAL[change.field] = change.newValue;
    return;
  }
  const row = Number(change.row);
  committed[change.scope][row][change.field] = change.newValue;
  const source = change.scope === 'rates' ? ECON_RATES : NDPI_RATES;
  source[row][change.field] = change.newValue;
  if (change.scope === 'rates' && change.field === 'decline') {
    const k = change.newValue === null ? null : +Math.min(1, Math.max(0.87, (100 - change.newValue / 2) / 100)).toFixed(4);
    committed.rates[row].declineK = k; source[row].declineK = k;
  }
}

function commit() {
  const reason = $('#changeReason').value.trim();
  if (!reason) {
    const error = $('#reviewError'); error.hidden = false;
    error.textContent = 'Укажите причину: без неё изменение экономической модели нельзя восстановить и проверить.';
    $('#changeReason').focus(); return;
  }
  if (!validateDraft()) { drawer = null; render(); return; }

  const changes = draftChanges();
  for (const change of changes) applyChange(change);
  const scopes = new Set(changes.map((c) => c.scope));
  history.unshift({
    version: `ЭМ-20260805-${String(versionSeq++).padStart(3, '0')}`,
    at: new Date(NOW), effectiveFrom: new Date(NOW), actor: USER, reason,
    scope: scopes.size === 1 ? [...scopes][0] : 'all', changes,
  });
  dirty.clear(); errors.clear(); drawer = 'history'; render();
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'changeReason') {
    const button = document.querySelector('[data-act="commit"]');
    if (button) button.disabled = !e.target.value.trim();
    const error = $('#reviewError');
    if (error) error.hidden = true;
    return;
  }
  if (e.target.matches('.econinput')) updateDraft(e.target);
});

document.addEventListener('change', (e) => {
  if (e.target.matches('select.econinput')) updateDraft(e.target);
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('.econinput')) {
    if (e.key === 'Escape') { e.preventDefault(); cancelOne(e.target); }
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  } else if (e.key === 'Escape' && drawer) {
    drawer = null; render(); $('#btnHistory').focus();
  }
});

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { activeTab = tab.dataset.tab; renderContent(); return; }

  const filter = e.target.closest('[data-history-filter]');
  if (filter) { historyFilter = filter.dataset.historyFilter; renderHistory(); return; }

  if (e.target.closest('#btnHistory')) { drawer = drawer === 'history' ? null : 'history'; renderDrawer(); return; }

  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'cancelAll') { dirty.clear(); errors.clear(); drawer = null; render(); return; }
  if (act === 'review') { if (validateDraft()) { drawer = 'review'; renderDrawer(); } return; }
  if (act === 'closeDrawer') { drawer = null; renderDrawer(); return; }
  if (act === 'commit') { commit(); }
});

window.addEventListener('beforeunload', (e) => {
  if (!dirty.size) return;
  e.preventDefault(); e.returnValue = '';
});

render();
