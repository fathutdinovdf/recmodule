/* Экран «Заявки Заказчика» — встречный поток.

   Рекомендацию выдаём мы, заявку присылают нам. Отсюда всё остальное:
   приоритет ставит Заказчик, а не Исполнитель; срок держим мы, а не он;
   просрочка здесь — нарушение договора с нашей стороны, а не с чужой.

   Главное на экране — два независимых срока, которых нет у рекомендации:

     первичная проверка достаточности данных — четыре рабочих часа,
     одинаково для всех приоритетов;
     ответ по существу — 4 / 8 / 24 часа по приоритету, и отсчёт идёт
     с момента, когда данных стало достаточно.

   Поэтому в списке у каждой заявки написано не «сколько осталось», а
   «сколько осталось на что»: до принятия в работу и после — это разные часы,
   и путать их нельзя.

   Компоновка master-detail, а не «реестр плюс карточка отдельной страницей»,
   как у рекомендаций. Причина в объёме: заявок десятки, а не сотни, фильтров
   им столько не нужно, и работа с ними — это чтение подряд, а не поиск одной
   в списке из ста восьмидесяти.

   Макет живой: формы меняют состояние в памяти и перерисовывают экран.
   Ничего не сохраняется — перезагрузка возвращает исходные данные. */

const $ = (s, root = document) => root.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Пояснения интерфейса пишутся в коде многострочно, а попадают в разметку,
   где перенос строки виден. Тот же приём, что в card.js. */
const prose = (s) => s.replace(/\s+/g, ' ').trim();

function toDate(d) {
  if (d instanceof Date) return d;
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00` : d);
}

function fmt(d, withTime = true) {
  if (!d) return '—';
  const x = toDate(d);
  if (isNaN(x)) return '—';
  const date = `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
  return withTime ? `${date} ${pad(x.getHours())}:${pad(x.getMinutes())}` : date;
}

/** Длительность словами. Часы здесь рабочие, поэтому «сутки» не пишем:
    двое календарных суток могут быть двумя рабочими часами. */
function dur(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  const ч = Math.floor(m / 60);
  const мм = m % 60;
  if (!ч) return `${мм} мин`;
  return мм ? `${ч} ч ${мм} мин` : `${ч} ч`;
}

const statusLabel = (k) => (CLAIM_STATUSES.find((s) => s.key === k) || {}).label || k;

/* ------------------------------ состояние ------------------------------ */

const QUERY = new URLSearchParams(location.search);

/* Заявки приходят на объекты, и зона ответственности действует на них так же,
   как в реестре рекомендаций: пользователь Заказчика не должен видеть чужие
   объекты. Роль читается тем же параметром, что на остальных экранах.
   По умолчанию — эксперт: заявки разбирает Исполнитель. */
const USER = USERS.find((u) => u.key === QUERY.get('role')) || USERS[0];

/* Именной отбор по ответственному Исполнителя к заявкам не применяется:
   заявку адресуют команде, а не эксперту, и распределяют её уже внутри.
   Поэтому inScope здесь не годится — берём только зону по объектам. */
const VISIBLE = CLAIMS.filter((c) => !USER.zone.length || USER.zone.includes(c.field));

/* Плитки считают по тому, чей сейчас ход, а не по статусам подряд: человек
   открывает экран с вопросом «где горит у меня», а не «сколько чего всего». */
const CLAIM_TILES = [
  { key: 'check', label: 'Ждут проверки данных', test: (c) => c.status === 'sent' },
  { key: 'work', label: 'В работе у нас', test: (c) => c.status === 'accepted' },
  { key: 'overdue', label: 'Срок нарушен', test: (c) => claimControl(c).kind === 'overdue' },
  { key: 'wait', label: 'Ждём данные', test: (c) => c.status === 'clarify' },
  { key: 'closed', label: 'Закрыты', test: (c) => c.status === 'closed' },
];

let tile = null;
let query = '';
let form = null;      // раскрытая форма: accept | clarify | answer
let error = '';
let current = null;   // id выбранной заявки

/* ------------------------------ отбор ------------------------------ */

function filtered() {
  const q = query.trim().toLowerCase();
  return VISIBLE.filter((c) => {
    if (tile && !CLAIM_TILES.find((t) => t.key === tile).test(c)) return false;
    if (!q) return true;
    return [c.number, c.well, c.type, c.field, c.problem]
      .some((v) => String(v).toLowerCase().includes(q));
  }).sort(byUrgency);
}

/* Сверху то, где ход за нами и время уходит. Внутри группы — по остатку:
   у кого меньше, тот выше. Закрытые уезжают вниз по дате ответа. */
function byUrgency(a, b) {
  const вес = (c) => {
    const k = claimControl(c).kind;
    if (k === 'overdue') return 0;
    if (k === 'waiting') return 1;
    if (k === 'none') return 2;
    return 3;
  };
  const ва = вес(a);
  const вб = вес(b);
  if (ва !== вб) return ва - вб;
  if (ва === 0) return claimControl(b).delta - claimControl(a).delta;
  if (ва === 1) return claimControl(a).delta - claimControl(b).delta;
  return toDate(b.answeredAt || b.createdAt) - toDate(a.answeredAt || a.createdAt);
}

/* ------------------------------ элементы ------------------------------ */

/* Тег контроля показывает и величину, и то, к какому сроку она относится.
   Без второго «осталось 2 ч» на заявке в работе и на заявке, ждущей
   проверки, выглядят одинаково, а это разные обязательства. */
function controlTag(c) {
  const x = claimControl(c);
  if (x.kind === 'none') return `<span class="tag tag--default">${x.what}</span>`;
  const слово = { overdue: 'просрочен', waiting: 'осталось', ok: 'в срок', late: 'с опозданием' }[x.kind];
  const величина = x.kind === 'ok' ? '' : ` ${dur(x.delta)}`;
  return `<span class="tag tag--${x.kind}" title="${esc(x.what)}">${слово}${величина}</span>`;
}

function statusDot(c) {
  const [tone, filled] = CLAIM_TONE[c.status];
  return `<i class="status__d status__d--${tone} ${filled ? '' : 'is-hollow'}"></i>`;
}

/* ------------------------------ список ------------------------------ */

function renderTiles() {
  $('#tiles').innerHTML = CLAIM_TILES.map((t) => {
    const n = VISIBLE.filter(t.test).length;
    return `<button class="tile ${tile === t.key ? 'is-on' : ''}" data-tile="${t.key}">
      <span class="tile__n">${n}</span><span class="tile__l">${t.label}</span></button>`;
  }).join('');
}

function renderList() {
  const rows = filtered();
  if (current === null || !rows.some((c) => c.id === current)) {
    current = rows.length ? rows[0].id : null;
  }

  $('#list').innerHTML = rows.length ? rows.map((c) => `
    <button class="ci ${c.id === current ? 'is-on' : ''}" data-id="${c.id}">
      <div class="ci__top">
        <span class="ci__n">${c.number}</span>
        <span class="prio prio--${c.priority}" title="${esc(c.priorityLabel)}">${c.priority}<i>${c.sla} ч</i></span>
        ${controlTag(c)}
      </div>
      <div class="ci__t">${esc(c.type)}</div>
      <div class="ci__m">скв. ${esc(c.well)} · ${esc(c.field)}</div>
      <div class="ci__s">${statusDot(c)}${statusLabel(c.status)} · ${fmt(c.createdAt)}</div>
    </button>`).join('')
    : '<div class="empty-pane">Заявок по этому отбору нет.</div>';

  $('#listFoot').textContent = rows.length === VISIBLE.length
    ? `${rows.length} ${plural(rows.length, ['заявка', 'заявки', 'заявок'])}`
    : `${rows.length} из ${VISIBLE.length}`;
}

function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/* ------------------------------ карточка ------------------------------ */

/* Раздел 2 формы заявки — параметры скважины на момент обращения. Это не
   текущая телеметрия: Заказчик прислал их вместе с заявкой, и разбирать
   ситуацию нужно по ним, иначе через неделю картина уже другая. */
function paramsBlock(c) {
  const p = c.params;
  const строки = [
    ['Дебит жидкости', `${p.qzh} м³/сут`],
    ['Обводнённость', `${p.water} %`],
    ['Дебит нефти', `${p.qn} т/сут`],
    ['Частота ПЭД', `${p.freq} Гц`],
    ['Ток ПЭД', `${p.current} А`],
    ['Загрузка ПЭД', `${p.load} %`],
  ];
  return `<dl class="params params--wide">${строки
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/* Обе стрелки часов рядом. Показывать только текущую нельзя: по закрытой
   заявке спор пойдёт именно о том, уложились ли в оба срока. */
function clocksBlock(c) {
  const проверка = c.checkedAt
    ? `${fmt(c.checkedAt)} — ${c.checkedAt <= c.checkDueAt
      ? '<span class="tag tag--ok">в срок</span>'
      : `<span class="tag tag--late">с опозданием ${dur(workHoursBetween(c.checkDueAt, c.checkedAt) * 3600000)}</span>`}`
    : `срок до ${fmt(c.checkDueAt)} · ${controlTag(c)}`;

  const ответ = c.status === 'sent' || c.status === 'clarify'
    ? '<span class="mark">отсчёт начнётся, когда данных станет достаточно</span>'
    : c.answeredAt
      ? `${fmt(c.answeredAt)} — ${c.answeredAt <= c.dueAt
        ? '<span class="tag tag--ok">в срок</span>'
        : `<span class="tag tag--late">с опозданием ${dur(workHoursBetween(c.dueAt, c.answeredAt) * 3600000)}</span>`}`
      : `срок до ${fmt(c.dueAt)} · ${controlTag(c)}`;

  return `<div class="clocks">
    <div class="clock">
      <div class="clock__k">Первичная проверка данных <i>${CLAIM_CHECK_HOURS} рабочих часа</i></div>
      <div class="clock__v">${проверка}</div>
    </div>
    <div class="clock">
      <div class="clock__k">Ответ по существу <i>${c.sla} рабочих часов, приоритет ${c.priority}</i></div>
      <div class="clock__v">${ответ}</div>
    </div>
  </div>`;
}

/* Действия Исполнителя зависят от статуса ровно так же, как в карточке
   рекомендации: кнопка раскрывает форму, а не срабатывает сразу. */
function actionsBlock(c) {
  if (c.status === 'closed') {
    return `<div class="decision decision--done">
      <div class="decision__h">Ответ Исполнителя</div>
      <div class="block__b">${esc(c.answer)}</div>
      ${c.refused ? '<div class="block__b"><span class="tag tag--late">мотивированный отказ</span></div>' : ''}
      ${c.recId ? `<div class="decision__hint decision__hint--gap">
        По заявке выдана рекомендация <a href="card.html?id=${c.recId}">${
          esc((DATA.find((r) => r.id === c.recId) || {}).number || '')}</a>.</div>` : ''}
    </div>`;
  }

  if (form) return formBlock(c);

  if (c.status === 'sent') {
    return `<div class="decision">
      <div class="decision__h">Первичная проверка</div>
      <div class="decision__hint">${prose(`Договор даёт ${CLAIM_CHECK_HOURS} рабочих часа на то, чтобы
        либо принять заявку в работу, либо направить перечень недостающих сведений. Норматив ответа
        по существу начнёт идти с момента, когда данных станет достаточно.`)}</div>
      <div class="decision__btns">
        <button class="btn btn--ok" data-act="open:accept">Данных достаточно, принять в работу</button>
        <button class="btn btn--wait" data-act="open:clarify">Запросить недостающие данные</button>
      </div>
    </div>`;
  }

  if (c.status === 'clarify') {
    return `<div class="decision">
      <div class="decision__h">Запрошены недостающие данные</div>
      <div class="block__b">${esc(c.missing)}</div>
      <div class="decision__hint">${prose(`Ход за Заказчиком. Норматив ответа не идёт и начнёт
        отсчитываться заново, когда данные придут: по договору срок считается с момента получения
        полного перечня сведений.`)}</div>
      <div class="decision__btns">
        <button class="btn btn--ok" data-act="open:accept">Данные получены, принять в работу</button>
      </div>
    </div>`;
  }

  return `<div class="decision">
    <div class="decision__h">Ответ по существу</div>
    <div class="decision__hint">${prose(`Ответ по существу либо мотивированный отказ — договор
      допускает оба исхода. Если по заявке выдаётся рекомендация, она заводится отдельно и
      связывается с заявкой.`)}</div>
    <div class="decision__btns">
      <button class="btn btn--ok" data-act="open:answer">Ответить</button>
    </div>
  </div>`;
}

function errLine() {
  return error ? `<div class="form__err">${esc(error)}</div>` : '';
}

function formBlock(c) {
  if (form === 'accept') {
    return `<div class="form">
      <div class="form__h">Принять заявку в работу</div>
      <label class="form__f"><span class="form__l">Комментарий <i>необязательно</i></span>
        <textarea class="inp inp--area" id="fText" rows="3"
          placeholder="Например: данные полные, взят в работу экспертом по механизированному фонду."></textarea></label>
      <div class="form__hint">С этого момента пойдёт норматив ответа — ${c.sla} рабочих часов
        по приоритету ${c.priority}. Срок истечёт ${fmt(addWorkHours(NOW, c.sla))}.</div>
      ${errLine()}
      <div class="form__btns">
        <button class="btn btn--ok" data-act="submit:accept">Принять в работу</button>
        <button class="btn" data-act="cancel">Отмена</button></div>
    </div>`;
  }

  if (form === 'clarify') {
    return `<div class="form">
      <div class="form__h">Запросить недостающие данные</div>
      <label class="form__f"><span class="form__l">Каких сведений не хватает <i>обязательно</i></span>
        <textarea class="inp inp--area" id="fText" rows="4"
          placeholder="Перечень документов, замеров или параметров, без которых разбор невозможен."></textarea></label>
      <div class="form__hint">${prose(`Перечень уходит Заказчику, заявка переходит в «Требует
        уточнения». Норматив ответа по существу не идёт, пока данные не получены.`)}</div>
      ${errLine()}
      <div class="form__btns">
        <button class="btn btn--wait" data-act="submit:clarify">Отправить запрос</button>
        <button class="btn" data-act="cancel">Отмена</button></div>
    </div>`;
  }

  return `<div class="form">
    <div class="form__h">Ответ по заявке</div>
    <label class="form__f"><span class="form__l">Ответ по существу <i>обязательно</i></span>
      <textarea class="inp inp--area" id="fText" rows="5"
        placeholder="Результат разбора и предложение Исполнителя с технологическим обоснованием."></textarea></label>
    <label class="chk"><input type="checkbox" id="fRefuse">
      <span>Это мотивированный отказ, а не ответ по существу</span></label>
    <div class="form__hint">${prose(`Ответ закрывает заявку. Если по ней нужно выдать рекомендацию —
      она заводится в реестре отдельно и связывается с этой заявкой.`)}</div>
    ${errLine()}
    <div class="form__btns">
      <button class="btn btn--ok" data-act="submit:answer">Отправить ответ</button>
      <button class="btn" data-act="cancel">Отмена</button></div>
  </div>`;
}

function renderCard() {
  const c = VISIBLE.find((x) => x.id === current);
  if (!c) {
    $('#card').innerHTML = '<div class="empty-pane">Выберите заявку в списке слева.</div>';
    return;
  }

  $('#card').innerHTML = `
    <div class="claimhead">
      <div class="claimhead__top">
        <span class="claimhead__n">${c.number}</span>
        <span class="headstatus">${statusDot(c)}${statusLabel(c.status)}</span>
        <span class="prio prio--${c.priority} prio--pill" title="${esc(c.priorityLabel)}">
          <svg class="ic16"><use href="#i-clock"/></svg>${c.sla} ч</span>
        ${controlTag(c)}
      </div>
      <div class="claimhead__obj">${esc(c.field)} · куст ${esc(c.kust)} · скважина <b>${esc(c.well)}</b></div>
      <div class="claimhead__meta">
        <span><i>Тип обращения</i>${esc(c.type)}</span>
        <span><i>От Заказчика</i>${esc(c.customer)}</span>
        <span><i>Ответственный АКЭ</i>${esc(c.executor)}</span>
        <span><i>Отклонения с</i>${fmt(c.since, false)}</span>
      </div>
    </div>

    ${clocksBlock(c)}

    <div class="claimbody">
      <div class="block"><div class="block__h">Описание ситуации</div>
        <div class="block__b">${esc(c.problem)}</div></div>

      <div class="block"><div class="block__h">Параметры скважины при обращении</div>
        ${paramsBlock(c)}</div>

      ${c.attachments ? `<div class="block"><div class="block__h">Вложения</div>
        <div class="files">${Array.from({ length: c.attachments }, (_, i) =>
          `<span class="file"><svg class="ic12"><use href="#i-clip"/></svg>заявка-${c.id}-${i + 1}.pdf</span>`).join('')}</div>
      </div>` : ''}

      ${actionsBlock(c)}

      <div class="block"><div class="block__h">История</div>
        <div class="log">${history(c).map((e) => `
          <div class="log__i"><div class="log__d">${fmt(e.at)}</div>
            <div class="log__t">${e.t}<br><span class="log__who">${esc(e.who)}</span></div></div>`).join('')}</div>
      </div>
    </div>`;
}

/* История собирается из отметок времени, а не хранится списком: пока событий
   пять, второй источник истины дороже, чем сборка на лету. */
function history(c) {
  const e = [{ at: c.createdAt, t: 'Заявка направлена Исполнителю', who: c.customer }];
  if (+c.receivedAt !== +c.createdAt) {
    e.push({
      at: c.receivedAt,
      t: 'Считается полученной — открылось рабочее окно',
      who: 'по договору',
    });
  }
  if (c.checkedAt) {
    e.push({
      at: c.checkedAt,
      t: c.status === 'clarify' ? 'Запрошены недостающие данные' : 'Данные признаны достаточными, принята в работу',
      who: c.executor,
    });
  }
  if (c.answeredAt) {
    e.push({
      at: c.answeredAt,
      t: c.refused ? 'Направлен мотивированный отказ' : 'Направлен ответ по существу',
      who: c.executor,
    });
  }
  return e.sort((a, b) => toDate(a.at) - toDate(b.at));
}

/* ------------------------------ действия ------------------------------ */

function submit(what) {
  const c = VISIBLE.find((x) => x.id === current);
  const text = ($('#fText').value || '').trim();

  if (what === 'accept') {
    c.status = 'accepted';
    c.checkedAt = c.checkedAt || NOW;
    /* Норматив ответа начинается заново от момента, когда данных стало
       достаточно, — так сформулирован договор для заявок. */
    c.completeAt = NOW;
    c.dueAt = addWorkHours(NOW, c.sla);
    delete c.missing;
    form = null; error = ''; render(); return;
  }

  if (what === 'clarify') {
    if (!text) { error = 'Перечислите, каких именно сведений не хватает.'; render(); return; }
    c.status = 'clarify';
    c.checkedAt = c.checkedAt || NOW;
    c.missing = text;
    delete c.dueAt; delete c.completeAt;
    form = null; error = ''; render(); return;
  }

  if (!text) { error = 'Ответ по существу не может быть пустым.'; render(); return; }
  c.status = 'closed';
  c.answeredAt = NOW;
  c.answer = text;
  c.refused = $('#fRefuse').checked;
  form = null; error = ''; render();
}

function render() {
  renderTiles();
  renderList();
  renderCard();
  $('#navBadge').textContent = VISIBLE.filter((c) => c.status === 'sent' || c.status === 'accepted').length;

  const части = [];
  if (USER.zone.length) части.push(`${USER.zone.length} объекта зоны ответственности`);
  $('#zoneNote').innerHTML = части.length
    ? `<b>${USER.who}</b> · ${части.join(' · ')} · показано ${VISIBLE.length} из ${CLAIMS.length}`
    : '';
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-tile]');
  if (t) { tile = tile === t.dataset.tile ? null : t.dataset.tile; render(); return; }

  const i = ev.target.closest('[data-id]');
  if (i) { current = Number(i.dataset.id); form = null; error = ''; render(); return; }

  const a = ev.target.closest('[data-act]');
  if (!a) return;
  const [act, arg] = a.dataset.act.split(':');
  if (act === 'open') { form = arg; error = ''; render(); }
  if (act === 'cancel') { form = null; error = ''; render(); }
  if (act === 'submit') submit(arg);
});

$('#q').addEventListener('input', (ev) => { query = ev.target.value; render(); });

render();
