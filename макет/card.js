/* Карточка рекомендации.
   Порядок блоков во вкладке «Сводка» фиксирован и намеренно заканчивается
   блоком решения: до кнопок «Принять» и «Отклонить» можно добраться, только
   прокрутив технологическое обоснование. Кнопок решения в шапке нет.

   Макет живой: формы действительно меняют состояние рекомендации в памяти и
   перерисовывают карточку. Обсуждать поведение форм на статике невозможно —
   вопрос всегда в том, что происходит после нажатия. Ничего не сохраняется:
   перезагрузка страницы возвращает исходные данные. */

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/"/g, '&quot;');

/* Дата без времени («2026-07-03») по стандарту разбирается как UTC, и в
   местном поясе съезжает на несколько часов, а в западных — на сутки назад.
   Поэтому такие строки читаем как локальную полночь. */
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

function dur(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); const mm = m % 60;
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${mm} мин`;
  return `${mm} мин`;
}

const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

/* В .block__b стоит pre-wrap — он нужен, чтобы сохранять переносы в тексте
   рекомендации, введённом человеком. Собственные пояснения интерфейса из-за
   него получали бы отступы исходного кода, поэтому их прогоняем через prose. */
const prose = (s) => s.replace(/\s+/g, ' ').trim();

/* ------------------------------ выбор записи ------------------------------ */

const params = new URLSearchParams(location.search);
const askedId = Number(params.get('id'));
const rec = DATA.find((r) => r.id === askedId)
  || DATA.find((r) => r.status === 'review')
  || DATA[DATA.length - 1];

document.title = `${rec.number} — карточка рекомендации`;

/* Макет открывают двойным кликом по файлу, а на file:// доступ к хранилищу
   в части браузеров запрещён — поэтому обе операции через try. */
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* нет хранилища */ } },
};

/* Листание идёт по той выборке, которая была на экране реестра: с её
   фильтрами и сортировкой. Реестр кладёт список id в sessionStorage при
   переходе. Если карточку открыли по прямой ссылке из уведомления, выборки
   нет — листаем весь реестр в порядке по умолчанию, новые сверху. */
function readSelection() {
  try {
    const raw = JSON.parse(store.get('vmap.selection') || '[]');
    if (Array.isArray(raw) && raw.includes(rec.id)) return raw;
  } catch (e) { /* испорченный ключ — просто игнорируем */ }
  return [...DATA].sort((a, b) => b.regDate - a.regDate).map((r) => r.id);
}

const SELECTION = readSelection();
const POS = SELECTION.indexOf(rec.id);
const PREV_ID = POS > 0 ? SELECTION[POS - 1] : null;
const NEXT_ID = POS >= 0 && POS < SELECTION.length - 1 ? SELECTION[POS + 1] : null;

/* ------------------------------ состояние ------------------------------ */

/* Вкладка переживает переход к соседней карточке: открыл «Реализацию» —
   листаешь именно реализации, а не возвращаешься каждый раз в «Сводку».
   Параметр в адресе перебивает запомненную: уведомление ведёт в нужную
   вкладку, а не туда, где человек был в прошлый раз. */
let tab = params.get('tab') || store.get('vmap.cardTab') || 'summary';
let form = null;        // раскрытая форма: accept | reject | clarify | fact | dispute | declineDispute
let logOnlyTalk = false;
let headMenuOpen = false; // выпадающее меню действий шапки, открывается кнопкой «⋯»
let error = '';         // текст ошибки валидации открытой формы

const TODAY = day(NOW);

const REJECT_REASONS = [
  'Нет технической возможности',
  'Работы уже запланированы',
  'Экономически нецелесообразно',
  'Скважина в ремонте или в ожидании',
  'Не согласны с технологическим обоснованием',
  'Иное',
];

/* ------------------------------ шапка ------------------------------ */

const CONTROL_LABEL = {
  ok: 'в срок', late: 'с опозданием', overdue: 'просрочено',
  waiting: 'осталось', pending: 'ожидает передачи', none: 'нет срока',
};

function controlTag() {
  const k = rec.controlKind;
  if (k === 'none') return '<span class="tag tag--default">нет срока</span>';
  if (k === 'pending') return `<span class="tag tag--pending">передача ${fmt(rec.sentAt)}</span>`;
  const suffix = k === 'ok' ? '' : ` ${dur(rec.controlDelta)}`;
  return `<span class="tag tag--${k}">${CONTROL_LABEL[k]}${suffix}</span>`;
}

/* Действия зависят от статуса. Решения Заказчика здесь нет намеренно —
   оно живёт в самом низу вкладки «Сводка». Фиксация реализации есть: это
   действие Исполнителя, но и оно ведёт в свою вкладку с формой, а не
   срабатывает из шапки одним нажатием. */
const HEAD_ACTIONS = {
  draft:        [['Зарегистрировать', 'accent'], ['Удалить', '']],
  registered:   [['Отменить', '']],
  sent:         [],
  review:       [],
  clarify:      [['Внести уточнение и передать', 'accent']],
  approved:     [['Зафиксировать реализацию', 'accent', 'goto:fact']],
  windowOpen:   [['Закрыть окно досрочно', '']],
  windowClosed: [],
  rejected:     [['Создать новую на основе', '']],
  cancelled:    [['Создать новую на основе', '']],
};

function renderHead() {
  const acts = HEAD_ACTIONS[rec.status] || [];
  const [tone, filled] = STATUS_TONE[rec.status];
  const disputed = rec.dispute && rec.dispute.state === 'open';

  $('#cardhead').innerHTML = `
    <div class="cardhead__top">
      <a class="cnbtn" href="index.html" title="К реестру"><svg class="ic20"><use href="#i-back"/></svg></a>
      <span class="cardhead__num">${rec.number}</span>
      <span class="headstatus"><i class="status__d status__d--${tone} ${filled ? '' : 'is-hollow'}"></i>${rec.statusLabel}</span>
      ${SLA_VISIBLE_STATUSES.includes(rec.status) ? `
        <span class="prio prio--${rec.priority} prio--pill" title="${rec.priorityLabel}">
          <svg class="ic16"><use href="#i-clock"/></svg>${rec.sla} ч</span>
        ${controlTag()}` : ''}
      ${rec.completenessLabel && rec.completeness === 'partial'
        ? '<span class="tag tag--warning">реализовано частично</span>' : ''}
      ${disputed ? '<span class="tag tag--late">дата реализации оспорена</span>' : ''}
      <div class="cardhead__trailing">
        <div class="pager">
          ${PREV_ID
            ? `<a class="cnbtn" href="card.html?id=${PREV_ID}" title="Предыдущая — стрелка влево"><svg class="ic16"><use href="#i-prev"/></svg></a>`
            : '<span class="cnbtn is-off"><svg class="ic16"><use href="#i-prev"/></svg></span>'}
          <span class="pager__pos" title="Позиция в выборке реестра">${
            POS >= 0 ? `${POS + 1} из ${SELECTION.length}` : '—'}</span>
          ${NEXT_ID
            ? `<a class="cnbtn" href="card.html?id=${NEXT_ID}" title="Следующая — стрелка вправо"><svg class="ic16"><use href="#i-next"/></svg></a>`
            : '<span class="cnbtn is-off"><svg class="ic16"><use href="#i-next"/></svg></span>'}
        </div>
        ${acts.length
          ? `<button class="cardhead__more" data-act="menu" title="Действия"><svg class="ic20"><use href="#i-more"/></svg></button>`
          : ''}
      </div>
    </div>

    <div class="cardhead__where">${rec.field} · куст ${rec.kust} · скважина <b>${rec.well}</b></div>
    <div class="cardhead__hr"></div>
    <div class="metas">
      <div class="meta"><span class="meta__k">Направление</span><span class="meta__v">${rec.direction}</span></div>
      <div class="meta"><span class="meta__k">Ответственный Исполнителя</span><span class="meta__v">${rec.executor}</span></div>
      <div class="meta"><span class="meta__k">Ответственный Заказчика</span><span class="meta__v">${rec.customer || '—'}</span></div>
      <div class="meta"><span class="meta__k">Источник</span><span class="meta__v">${rec.source}</span></div>
      <div class="meta"><span class="meta__k">Первичность</span><span class="meta__v">${rec.isPrimary ? 'Первичная' : 'Повторная'}</span></div>
    </div>

    ${acts.length ? `<div class="headmenu" ${headMenuOpen ? '' : 'hidden'}>
      ${acts.map(([label, kind, act]) =>
        `<button class="${kind === 'accent' ? 'is-accent' : ''}" ${act ? `data-act="${act}"` : ''}>${label}</button>`).join('')}
    </div>` : ''}`;
}

/* ------------------------------ лента статусов ------------------------------ */

/* Пять групп. «Реализация» — не период, а точка: рекомендация не задерживается
   в ней ни на секунду, потому что фиксация факта сразу открывает окно.
   В группе живёт только «Согласовано к реализации» — ожидание работ.

   Последняя группа — «Окно закрыто», не «Подтверждено»: по договору
   подтверждение эффекта наступает позже, после согласования расчёта между
   Заказчиком и Исполнителем, которое в модуле пока не смоделировано. */
const GROUPS = [
  { t: 'Подготовка',    st: ['draft', 'registered'] },
  { t: 'У Заказчика',   st: ['sent', 'review', 'clarify'] },
  { t: 'Реализация',    st: ['approved'] },
  { t: 'Окно эффекта',  st: ['windowOpen'] },
  { t: 'Окно закрыто',  st: ['windowClosed'] },
];

function renderRibbon() {
  const stop = rec.status === 'rejected' || rec.status === 'cancelled';
  const idx = GROUPS.findIndex((g) => g.st.includes(rec.status));

  const dates = [
    fmt(rec.regDate),
    rec.sentAt ? fmt(rec.sentAt) : '—',
    rec.factDate ? fmt(rec.factDate, false) : (rec.status === 'approved' ? 'ожидается' : '—'),
    rec.windowOpenAt ? fmt(rec.windowOpenAt, false) : '—',
    rec.windowCloseAt ? fmt(rec.windowCloseAt, false) : '—',
  ];

  let html = GROUPS.map((g, i) => {
    let cls = '';
    if (!stop && i < idx) cls = 'is-done';
    else if (!stop && i === idx) cls = 'is-now';
    return `<div class="step ${cls}"><span class="step__t">${g.t}</span><span class="step__d">${dates[i]}</span></div>`;
  }).join('');

  if (stop) {
    html += `<div class="step is-stop"><span class="step__t">${rec.statusLabel}</span>
      <span class="step__d">${fmt(rec.repliedAt || rec.sentAt)}</span></div>`;
  }
  $('#ribbon').innerHTML = html;
}

/* ------------------------------ вкладки ------------------------------ */

/* Черновики в аналоги и в правую колонку не попадают: у черновика нет ни
   номера, ни даты регистрации, и в реестре его видит только автор. */
const analogs = DATA.filter((r) => r.well === rec.well && r.id !== rec.id && r.status !== 'draft')
  .sort((a, b) => b.regDate - a.regDate);

function tabsDef() {
  return [
    ['summary', 'Сводка'],
    ['impl', 'Реализация'],
    ['analogs', 'Аналоги', analogs.length],
    ['files', 'Файлы', rec.attachments],
    ['links', 'Связи'],
    ['log', 'История и обсуждение', rec.comments.length],
  ];
}

function renderTabs() {
  $('#tabs').innerHTML = tabsDef().map(([k, t, n]) =>
    `<button class="tab ${k === tab ? 'is-on' : ''}" data-tab="${k}">${t}${
      n ? ` <span class="tab__n">${n}</span>` : ''}</button>`).join('');
}

function num(v, unit) {
  if (v === undefined || v === null) return '<span class="mark">—</span>';
  const s = typeof v === 'number' ? v.toLocaleString('ru-RU') : v;
  return `${v > 0 ? '+' : ''}${s}${unit ? `<small>${unit}</small>` : ''}`;
}

function errLine() {
  return error ? `<div class="form__err">${error}</div>` : '';
}

/* ------------------------------ формы решения ------------------------------ */

/* Обоснование обязательно при отклонении и при запросе уточнения: это
   единственное, что остаётся Исполнителю на входе следующего круга, и
   единственное, чем Заказчик объясняет отказ в отчётности по договору. */
function decisionForm() {
  if (form === 'accept') {
    return `<div class="form">
      <div class="form__h">Принять рекомендацию</div>
      <label class="form__f"><span class="form__l">Плановая дата работ <i>необязательно</i></span>
        <input type="date" class="inp inp--date" id="fPlan"></label>
      <label class="form__f"><span class="form__l">Комментарий <i>необязательно</i></span>
        <textarea class="inp inp--area" id="fText" rows="3"
          placeholder="Например: работы включены в план на неделю, ответственный — мастер по добыче."></textarea></label>
      <div class="form__hint">Решение останавливает таймер норматива и переводит рекомендацию
        в «Согласовано к реализации». Дальше факт реализации определяет Исполнитель по телеметрии.</div>
      ${errLine()}
      <div class="form__btns">
        <button class="btn btn--ok" data-act="submit:accept">Подтвердить решение</button>
        <button class="btn" data-act="cancel">Отмена</button></div>
    </div>`;
  }

  if (form === 'reject') {
    return `<div class="form">
      <div class="form__h">Отклонить рекомендацию</div>
      <label class="form__f"><span class="form__l">Причина</span>
        <select class="inp" id="fReason">${REJECT_REASONS.map((r) =>
          `<option>${r}</option>`).join('')}</select></label>
      <label class="form__f"><span class="form__l">Обоснование <i>обязательно</i></span>
        <textarea class="inp inp--area" id="fText" rows="4"
          placeholder="Что сделано или планируется вместо рекомендованного, почему рекомендация не принимается."></textarea></label>
      <div class="form__hint">Обоснование попадает в реестр — колонка «Обоснование при отклонении» —
        и в историю рекомендации. Отклонение завершает жизненный цикл: продолжение возможно
        только новой рекомендацией на основе этой.</div>
      ${errLine()}
      <div class="form__btns">
        <button class="btn btn--no" data-act="submit:reject">Отклонить</button>
        <button class="btn" data-act="cancel">Отмена</button></div>
    </div>`;
  }

  if (form === 'clarify') {
    return `<div class="form">
      <div class="form__h">Запросить уточнение</div>
      <label class="form__f"><span class="form__l">Что требуется уточнить <i>обязательно</i></span>
        <textarea class="inp inp--area" id="fText" rows="4"
          placeholder="Какого расчёта, замера или пояснения не хватает для решения."></textarea></label>
      <div class="form__hint">Рекомендация вернётся Исполнителю в статус «На уточнении» под тем же
        номером. После повторной передачи норматив ответа считается заново, но вся цепочка
        кругов сохраняется в истории.</div>
      ${errLine()}
      <div class="form__btns">
        <button class="btn btn--wait" data-act="submit:clarify">Отправить запрос</button>
        <button class="btn" data-act="cancel">Отмена</button></div>
    </div>`;
  }
  return '';
}

function decisionBlock() {
  if (rec.decision) {
    const kind = rec.decision === 'Принята' ? 'ok' : rec.decision === 'Отклонена' ? 'late' : 'warning';
    return `<div class="decision decision--done">
      <div class="decision__h">Решение Заказчика</div>
      <div class="block__b"><span class="tag tag--${kind}">${rec.decision}</span></div>
      <div class="decision__hint" style="margin-top:8px">
        Карточку открыли ${fmt(rec.openedAt)}, ответ дан ${fmt(rec.repliedAt)} — ${
          CONTROL_LABEL[rec.controlKind]}${rec.controlKind === 'ok' ? '' : ' ' + dur(rec.controlDelta)}.
        Ответственный Заказчика: ${rec.customer || '—'}.</div>
      ${rec.rejectReason ? `<div class="block__h" style="margin-top:12px">Обоснование Заказчика${
          rec.rejectKind ? ` · ${rec.rejectKind}` : ''}</div>
        <div class="block__b">${rec.rejectReason}</div>` : ''}
    </div>`;
  }
  if (rec.status === 'draft' || rec.status === 'registered') {
    return `<div class="decision decision--done">
      <div class="decision__h">Решение Заказчика</div>
      <div class="decision__hint">Рекомендация ещё не передана Заказчику${
        rec.status === 'registered' ? `. Передача произойдёт ${fmt(rec.sentAt)}, с открытием рабочего дня.` : '.'}</div>
    </div>`;
  }
  return `<div class="decision">
    <div class="decision__h">Решение по рекомендации</div>
    <div class="decision__hint">
      Доступно пользователю Заказчика с правом решения. При отклонении и запросе уточнения
      обоснование обязательно. Норматив ответа — ${rec.sla} рабочих часов с момента передачи,
      ${CONTROL_LABEL[rec.controlKind]}${rec.controlKind === 'ok' ? '' : ' ' + dur(rec.controlDelta)}.</div>
    ${form && ['accept', 'reject', 'clarify'].includes(form) ? decisionForm() : `
    <div class="decision__btns">
      <button class="btn btn--ok" data-act="open:accept">Принять</button>
      <button class="btn btn--no" data-act="open:reject">Отклонить</button>
      <button class="btn btn--wait" data-act="open:clarify">Требует уточнения</button>
    </div>`}
  </div>`;
}

function paneSummary() {
  const files = rec.attachments
    ? `<div class="files">${Array.from({ length: rec.attachments }, (_, i) =>
        `<span class="file"><svg class="ic12"><use href="#i-clip"/></svg>обоснование-${i + 1}.pdf</span>`).join('')}</div>`
    : '';

  return `
    <div class="block"><div class="block__h">Проблема / отклонение</div>
      <div class="block__b">${rec.problem}</div></div>

    <div class="block"><div class="block__h">Технологическое обоснование</div>
      <div class="block__b">${rec.rationale}</div>${files}</div>

    <div class="block"><div class="block__h">Рекомендуемое мероприятие</div>
      <div class="block__b">${rec.action}</div></div>

    <div class="block"><div class="block__h">Ожидаемый технологический результат</div>
      <div class="kpis">
        <div class="kpi"><span class="kpi__k">Δ Qж</span><span class="kpi__v">${num(rec.expectQzh, ' м³/сут')}</span></div>
        <div class="kpi"><span class="kpi__k">Δ Qн</span><span class="kpi__v">${num(rec.expectQn, ' т/сут')}</span></div>
        <div class="kpi"><span class="kpi__k">Δ ЭЭ</span><span class="kpi__v">${num(rec.expectEE, ' кВт·ч')}</span></div>
        <div class="kpi"><span class="kpi__k">Прогнозный эффект</span><span class="kpi__v">${
          rec.forecast ? rec.forecast.toLocaleString('ru-RU') + '<small> руб</small>' : '—'}</span></div>
      </div></div>

    <div class="block"><div class="block__h">Горизонт подтверждения</div>
      <div class="block__b">${prose(`90 суток с даты фактической реализации.
        Значение зафиксировано договором и не редактируется.`)}</div></div>

    ${decisionBlock()}`;
}

/* ------------------------------ вкладка «Реализация» ------------------------------ */

/* Файлы, приложенные к фиксации: выгрузка тренда, наряд-задание, скриншот. */
function factFiles() {
  if (!rec.factFiles) return '';
  return `<div class="files">${Array.from({ length: rec.factFiles }, (_, i) =>
    `<span class="file"><svg class="ic12"><use href="#i-clip"/></svg>реализация-${i + 1}.pdf</span>`).join('')}</div>`;
}

function factForm() {
  return `<div class="form">
    <div class="form__h">Фиксация реализации</div>

    <div class="form__row">
      <label class="form__f"><span class="form__l">Дата фактической реализации</span>
        <input type="date" class="inp inp--date" id="fFact" value="${TODAY}" max="${TODAY}"></label>
      <label class="form__f"><span class="form__l">Полнота реализации</span>
        <span class="radios">
          <label class="radio"><input type="radio" name="compl" value="full" checked>Полностью</label>
          <label class="radio"><input type="radio" name="compl" value="partial">Частично</label>
        </span></label>
    </div>
    <div class="form__hint">Дата — это сутки, с которых телеметрия показывает новый режим,
      а не момент нажатия кнопки: изменение можно заметить и через день-другой. От этой даты
      отсчитываются 90 суток окна.</div>

    <label class="form__f" id="fPartialWrap" hidden>
      <span class="form__l">Что не выполнено <i>обязательно при частичной реализации</i></span>
      <textarea class="inp inp--area" id="fPartial" rows="3"
        placeholder="Например: частота выведена не до рекомендованной, ревизия устьевой арматуры не проводилась."></textarea></label>

    <div class="form__f">
      <span class="form__l">Вложения <i>необязательно</i></span>
      <div class="files"><button class="btn">Прикрепить файл</button></div>
      <div class="form__hint">Выгрузка тренда из ВМАП, скриншот, наряд-задание — то, чем
        при необходимости подтверждается выбранная дата.</div>
    </div>

    <label class="form__f"><span class="form__l">Комментарий <i>необязательно</i></span>
      <textarea class="inp inp--area" id="fText" rows="2"
        placeholder="Что изменилось в режиме и почему дата именно такая."></textarea></label>

    <div class="form__hint">Фиксация в тот же момент открывает окно подтверждения эффекта
      и уведомляет Заказчика. Заказчик вправе оспорить дату, пока окно не закрыто.</div>
    ${errLine()}
    <div class="form__btns">
      <button class="btn btn--accent" data-act="submit:fact">Зафиксировать реализацию</button>
      <button class="btn" data-act="cancel">Отмена</button></div>
  </div>`;
}

function disputeForm() {
  return `<div class="form">
    <div class="form__h">Возражение по дате реализации</div>
    <label class="form__f"><span class="form__l">Дата, которую считаете верной <i>обязательно</i></span>
      <input type="date" class="inp inp--date" id="dDate" value="${rec.factDate || TODAY}"></label>
    <label class="form__f"><span class="form__l">Обоснование <i>обязательно</i></span>
      <textarea class="inp inp--area" id="dText" rows="4"
        placeholder="Почему изменение режима в указанные сутки не связано с выполнением рекомендации."></textarea></label>
    <div class="form__hint">Окно эффекта не останавливается: суточные значения телеметрии
      фиксируются снимком в модуле навсегда, поэтому смена даты просто сдвигает 90 суток
      по уже сохранённым суткам. До снятия возражения расчёт эффекта считается предварительным.</div>
    ${errLine()}
    <div class="form__btns">
      <button class="btn btn--no" data-act="submit:dispute">Отправить возражение</button>
      <button class="btn" data-act="cancel">Отмена</button></div>
  </div>`;
}

function declineDisputeForm() {
  return `<div class="form">
    <div class="form__h">Отклонить возражение</div>
    <label class="form__f"><span class="form__l">Обоснование <i>обязательно</i></span>
      <textarea class="inp inp--area" id="dText" rows="3"
        placeholder="Почему дата остаётся прежней: что показывает телеметрия в спорные сутки."></textarea></label>
    <div class="form__hint">Дата остаётся прежней, пометка о споре сохраняется в карточке
      и в истории. Дальнейшее разбирательство идёт вне модуля, по разделу 10 договора.</div>
    ${errLine()}
    <div class="form__btns">
      <button class="btn btn--no" data-act="submit:declineDispute">Отклонить возражение</button>
      <button class="btn" data-act="cancel">Отмена</button></div>
  </div>`;
}

function disputeBlock() {
  const d = rec.dispute;

  if (!d) {
    if (rec.status !== 'windowOpen') return '';
    return `<div class="block"><div class="block__h">Дата реализации</div>
      <div class="block__b">${prose(`Дату определил Исполнитель по телеметрии. Заказчик вправе
        с ней не согласиться, пока окно не закрыто: после закрытия эффект финализирован.`)}</div>
      ${form === 'dispute' ? disputeForm() : `<div class="form__btns" style="margin-top:12px">
        <button class="btn" data-act="open:dispute">Оспорить дату реализации</button>
        <span class="form__note">Действие Заказчика</span></div>`}
    </div>`;
  }

  if (d.state === 'open') {
    return `<div class="alertbox">
      <div class="alertbox__h">Дата реализации оспорена Заказчиком</div>
      <div class="alertbox__b">${d.reason}</div>
      <div class="alertbox__m">${fmt(d.at)} · предлагаемая дата <b>${fmt(d.proposedDate, false)}</b>
        вместо ${fmt(rec.factDate, false)} · расчёт эффекта до снятия возражения предварительный</div>
      ${form === 'declineDispute' ? declineDisputeForm() : `<div class="form__btns">
        <button class="btn btn--accent" data-act="submit:acceptDispute">Принять дату Заказчика</button>
        <button class="btn" data-act="open:declineDispute">Отклонить возражение</button>
        <span class="form__note">Действие Исполнителя</span></div>`}
    </div>`;
  }

  const accepted = d.state === 'accepted';
  return `<div class="block block--quiet"><div class="block__h">Спор о дате реализации</div>
    <div class="block__b">${d.reason}</div>
    <div class="alertbox__m">${fmt(d.at)} · ${accepted
      ? `дата изменена на ${fmt(rec.factDate, false)}, окно пересчитано`
      : `возражение отклонено ${fmt(d.resolvedAt)}: ${d.resolution}`}</div></div>`;
}

function paneImpl() {
  if (rec.status === 'approved') {
    return `<div class="block"><div class="block__h">Факт реализации</div>
      <div class="block__b">${prose(`Факт и дату реализации определяет Исполнитель. Эксперт ведёт
        скважину по телеметрии в ВМАП; смена режима или параметров — частоты, давления на приёме,
        загрузки ПЭД, программы периодического режима — означает, что рекомендованное мероприятие
        выполнено. Увидев изменение, эксперт фиксирует реализацию здесь, и этим же действием
        открывается окно подтверждения эффекта на 90 суток.`)}</div>
      ${form === 'fact' ? factForm() : `<div class="form__btns" style="margin-top:12px">
        <button class="btn btn--accent" data-act="open:fact">Зафиксировать реализацию</button>
        <span class="form__note">Действие Исполнителя</span></div>`}
    </div>`;
  }

  if (rec.status !== 'windowOpen' && rec.status !== 'windowClosed') {
    return '<div class="empty-pane">Реализация ещё не начиналась — решение Заказчика не принято.</div>';
  }

  const left = rec.windowCloseAt ? days(NOW, rec.windowCloseAt) : null;

  return `
    <div class="block"><div class="block__h">Фактическая реализация</div>
      <div class="kpis">
        <div class="kpi"><span class="kpi__k">Дата реализации</span><span class="kpi__v">${fmt(rec.factDate, false)}</span></div>
        <div class="kpi"><span class="kpi__k">Полнота</span><span class="kpi__v">${rec.completenessLabel || '—'}</span></div>
        <div class="kpi"><span class="kpi__k">Окно открыто</span><span class="kpi__v">${fmt(rec.windowOpenAt, false)}</span></div>
        <div class="kpi"><span class="kpi__k">Окно закрывается</span><span class="kpi__v">${fmt(rec.windowCloseAt, false)}${
          rec.status === 'windowOpen' && left !== null
            ? `<small> ${left > 0 ? `осталось ${left} сут` : 'сегодня'}</small>` : ''}</span></div>
      </div>
      <div class="form__hint" style="margin-top:10px">Зафиксировал ${rec.factBy || rec.executor},
        ${fmt(rec.factFixedAt)}. Окно отсчитывается от даты реализации, а не от момента фиксации.</div>
      ${rec.factNote ? `<div class="block__b" style="margin-top:8px">${rec.factNote}</div>` : ''}
      ${factFiles()}
    </div>

    ${disputeBlock()}

    <div class="block block--quiet"><div class="block__h">Расчёт эффекта</div>
      <div class="block__b">${prose(`Вторая итерация. Здесь появятся суточные значения за 90 суток,
        база, факт и рублёвый эффект.`)}${rec.dispute && rec.dispute.state === 'open'
          ? ' Пока дата реализации оспорена, расчёт помечается предварительным.' : ''}</div></div>`;
}

/* ------------------------------ остальные вкладки ------------------------------ */

function paneAnalogs() {
  if (!analogs.length) return '<div class="empty-pane">По этой скважине других рекомендаций нет.</div>';
  return `<div class="block"><div class="block__h">Рекомендации по скважине ${rec.well}
      <span class="tab__n">${analogs.length}</span></div>
    <div class="block__b">${prose(`Проверка на аналоги выполняется в момент регистрации: при совпадении
      скважины и направления эксперт обязан подтвердить, что это отдельная работа.`)}</div></div>
    <div class="log">${analogs.slice(0, 12).map((r) => `
      <div class="log__i"><div class="log__d">${fmt(r.regDate, false)}</div>
        <div class="log__t"><a href="card.html?id=${r.id}"><b>${r.number}</b></a> · ${r.direction}<br>
          <span class="log__who">${r.problem} — ${r.statusLabel}${
            r.direction === rec.direction ? ' · совпадает направление' : ''}</span></div></div>`).join('')}</div>`;
}

function paneFiles() {
  if (!rec.attachments) return '<div class="empty-pane">Вложений нет.</div>';
  return `<div class="files">${Array.from({ length: rec.attachments }, (_, i) =>
    `<span class="file"><svg class="ic12"><use href="#i-clip"/></svg>обоснование-${i + 1}.pdf</span>`).join('')}</div>`;
}

function paneLinks() {
  return `<div class="block"><div class="block__h">Связи</div>
    <div class="block__b">${prose(`Предупреждение ВМАП, из которого выросла рекомендация, связанные
      заявки Заказчика и цепочка уточнений под одним номером. Здесь же — ссылка на накопительную
      карточку скважины.`)}</div></div>
    <div class="files">
      <span class="file"><svg class="ic12"><use href="#i-link"/></svg>Предупреждение ВМАП №${1000 + rec.id}</span>
      <span class="file"><svg class="ic12"><use href="#i-link"/></svg>Скважина ${rec.well} — накопительная карточка</span>
    </div>`;
}

/* ------------------------------ история и обсуждение ------------------------------ */

/* Одна лента на события и реплики. Спорная ситуация по разделу 10 договора
   разбирается по одной хронологии: кто что сделал и что при этом писал.
   Две отдельные вкладки заставляли бы сшивать их глазами. Все комментарии
   общие — внутренних заметок Исполнителя нет. */
function events() {
  const ev = [];
  ev.push([rec.regDate, 'Рекомендация <b>зарегистрирована</b>', rec.executor, 'exec']);
  if (rec.sentAt) {
    const waited = rec.sentAt - rec.regDate > 60000;
    ev.push([rec.sentAt, `<b>Передана Заказчику</b>${
      waited ? ' — отложена до открытия рабочего окна' : ''}`, 'Система', 'sys']);
  }
  if (rec.openedAt) ev.push([rec.openedAt, 'Карточку <b>открыл</b> Заказчик — статус «На рассмотрении»', rec.customer, 'cust']);
  if (rec.repliedAt) ev.push([rec.repliedAt, `Решение Заказчика: <b>${rec.decision}</b>${
    rec.rejectKind ? ` — ${rec.rejectKind}` : ''}`, rec.customer, 'cust']);

  if (rec.factFixedAt) {
    ev.push([rec.factFixedAt,
      `<b>Зафиксирована реализация</b> (${(rec.completenessLabel || '').toLowerCase()}), дата внедрения ${
        fmt(rec.factDate, false)} — открыто окно подтверждения эффекта до ${fmt(rec.windowCloseAt, false)}${
        rec.factFiles ? `<br><span class="log__who">Приложено файлов: ${rec.factFiles}</span>` : ''}`,
      rec.factBy || rec.executor, 'exec']);
  }
  if (rec.dispute) {
    ev.push([rec.dispute.at,
      `<b>Дата реализации оспорена</b> — предложена ${fmt(rec.dispute.proposedDate, false)}<br>
       <span class="log__who">${rec.dispute.reason}</span>`, rec.customer || 'Заказчик', 'cust']);
    if (rec.dispute.state === 'accepted') {
      ev.push([rec.dispute.resolvedAt, `<b>Дата Заказчика принята</b> — окно пересчитано от ${
        fmt(rec.factDate, false)}`, rec.executor, 'exec']);
    }
    if (rec.dispute.state === 'declined') {
      ev.push([rec.dispute.resolvedAt, `<b>Возражение отклонено</b><br>
        <span class="log__who">${rec.dispute.resolution}</span>`, rec.executor, 'exec']);
    }
  }
  if (rec.windowCloseAt && rec.status === 'windowClosed') {
    /* У закрытия окна есть дата, но нет осмысленного времени: сутки закрылись
       целиком, поэтому час в ленте не показываем. */
    ev.push([rec.windowCloseAt, '<b>Окно закрыто</b>, эффект зафиксирован', 'Система', 'sys', true]);
  }
  return ev.map(([d, t, who, side, dateOnly]) =>
    ({ at: toDate(d), text: t, who, side, dateOnly, kind: 'event' }));
}

function paneLog() {
  const talk = rec.comments.map((c) => ({ ...c, at: new Date(c.at), kind: 'talk' }));
  const feed = (logOnlyTalk ? talk : [...events(), ...talk]).sort((a, b) => a.at - b.at);

  const rows = feed.map((e) => e.kind === 'event'
    ? `<div class="log__i"><div class="log__d">${fmt(e.at, !e.dateOnly)}</div>
        <div class="log__t">${e.text}<br><span class="log__who">${e.who || '—'}</span></div></div>`
    : `<div class="log__i log__i--talk"><div class="log__d">${fmt(e.at)}</div>
        <div class="log__t"><span class="who who--${e.side}">${e.author}</span>
          <span class="who__side">${e.side === 'exec' ? 'Исполнитель' : 'Заказчик'}</span>
          <div class="talk">${e.text}</div></div></div>`).join('');

  return `
    <div class="logbar">
      <button class="chip ${logOnlyTalk ? '' : 'is-on'}" data-act="log:all">Всё</button>
      <button class="chip ${logOnlyTalk ? 'is-on' : ''}" data-act="log:talk">Только обсуждение
        <span class="tab__n">${rec.comments.length}</span></button>
    </div>
    <div class="log">${rows || '<div class="empty-pane">Пока пусто.</div>'}</div>
    <div class="composer">
      <textarea class="inp inp--area" id="cText" rows="2"
        placeholder="Комментарий по рекомендации…"></textarea>
      <div class="composer__foot">
        <span class="form__note">Комментарий виден обеим сторонам. Статус он не меняет:
          уточнение по-прежнему запрашивается решением, а не репликой.</span>
        <button class="btn btn--accent" data-act="submit:comment">Отправить</button>
      </div>
    </div>`;
}

function renderPane() {
  const map = {
    summary: paneSummary, impl: paneImpl, analogs: paneAnalogs,
    files: paneFiles, links: paneLinks, log: paneLog,
  };
  $('#tabpane').innerHTML = map[tab]();

  /* Поле «что не выполнено» показывается только при частичной реализации —
     переключение без перерисовки, иначе форма теряла бы введённое. */
  const partial = $('#fPartialWrap');
  if (partial) {
    document.querySelectorAll('input[name=compl]').forEach((r) => {
      r.addEventListener('change', () => { partial.hidden = r.value !== 'partial' || !r.checked; });
    });
  }
}

/* ------------------------------ правая колонка ------------------------------ */

function rnd32(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function renderContext() {
  const r = rnd32(hash(rec.well));
  const qzh = 60 + r() * 180;
  const series = Array.from({ length: 30 }, (_, i) =>
    qzh * (0.88 + r() * 0.24) * (i > 21 ? 0.82 : 1));
  const min = Math.min(...series); const max = Math.max(...series);
  const pts = series.map((v, i) =>
    `${(i / 29 * 320).toFixed(1)},${(58 - (v - min) / (max - min || 1) * 50).toFixed(1)}`).join(' ');

  const prev = analogs.slice(0, 5);

  $('#context').innerHTML = `
    <div class="card">
      <div class="card__h">Скважина ${rec.well}<a href="#">карточка</a></div>
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
    </div>

    <div class="card">
      <div class="card__h">Ранее по этой скважине<a href="#">все ${analogs.length}</a></div>
      ${prev.length ? `<div class="prev">${prev.map((p) => `
        <a class="prev__i" href="card.html?id=${p.id}">
          <div class="prev__t"><b>${p.number}</b> · ${fmt(p.regDate, false)} · ${p.statusLabel}</div>
          <div class="prev__p">${p.problem}</div></a>`).join('')}</div>`
        : '<div class="block__b">Других рекомендаций нет.</div>'}
    </div>`;
}

/* ------------------------------ действия ------------------------------ */

function setStatus(key) {
  rec.status = key;
  rec.statusLabel = STATUSES.find((s) => s.key === key).label;
}

/* Ответ существует только вместе с решением, поэтому контроль ответа
   пересчитывается тем же действием, что фиксирует решение. */
function answerNow() {
  rec.repliedAt = NOW;
  if (!rec.openedAt) rec.openedAt = NOW;
  if (!rec.customer) rec.customer = 'Чернышов А.А';
  const ok = rec.repliedAt <= rec.dueAt;
  rec.controlKind = ok ? 'ok' : 'late';
  rec.controlDelta = workHoursBetween(ok ? rec.repliedAt : rec.dueAt,
    ok ? rec.dueAt : rec.repliedAt) * 3600000;
}

function refresh() {
  renderHead(); renderRibbon(); renderTabs(); renderPane();
}

function val(sel) {
  const el = $(sel);
  return el ? el.value.trim() : '';
}

function submit(what) {
  error = '';

  if (what === 'accept') {
    answerNow();
    rec.decision = 'Принята';
    rec.planDate = val('#fPlan');
    setStatus('approved');
    if (val('#fText')) addComment(val('#fText'), 'cust');
    form = null; refresh(); return;
  }

  if (what === 'reject') {
    const text = val('#fText');
    if (!text) { error = 'Обоснование обязательно: без него отклонение не фиксируется.'; renderPane(); return; }
    answerNow();
    rec.decision = 'Отклонена';
    rec.rejectKind = val('#fReason');
    rec.rejectReason = text;
    setStatus('rejected');
    form = null; refresh(); return;
  }

  if (what === 'clarify') {
    const text = val('#fText');
    if (!text) { error = 'Опишите, что именно требуется уточнить.'; renderPane(); return; }
    answerNow();
    rec.decision = 'Требует уточнения';
    rec.rejectKind = 'Запрос уточнения';
    rec.rejectReason = text;
    setStatus('clarify');
    form = null; refresh(); return;
  }

  if (what === 'fact') {
    const date = val('#fFact');
    const compl = (document.querySelector('input[name=compl]:checked') || {}).value || 'full';

    if (!date) { error = 'Укажите дату фактической реализации.'; renderPane(); return; }
    if (new Date(date) > NOW) { error = 'Дата реализации не может быть в будущем.'; renderPane(); return; }
    if (compl === 'partial' && !val('#fPartial')) {
      error = 'При частичной реализации обязательно описать, что не выполнено.';
      renderPane(); return;
    }

    rec.factDate = date;
    rec.factFixedAt = NOW;
    rec.factBy = rec.executor;
    rec.completeness = compl;
    rec.completenessLabel = COMPLETENESS[compl];
    rec.factNote = compl === 'partial' ? val('#fPartial') : '';
    rec.factFiles = 0;
    rec.windowOpenAt = date;
    rec.windowCloseAt = day(new Date(new Date(date).getTime() + 90 * 86400000));
    setStatus('windowOpen');
    if (val('#fText')) addComment(val('#fText'), 'exec');
    form = null; refresh(); return;
  }

  if (what === 'dispute') {
    const text = val('#dText');
    const date = val('#dDate');
    if (!date || !text) { error = 'Нужны и дата, и обоснование возражения.'; renderPane(); return; }
    rec.dispute = { at: NOW, proposedDate: date, reason: text, state: 'open' };
    form = null; refresh(); return;
  }

  if (what === 'acceptDispute') {
    /* Окно не останавливалось и не теряло данных: суточные значения лежат в
       нашей БД, поэтому смена даты просто сдвигает 90 суток по сохранённым суткам. */
    rec.factDate = rec.dispute.proposedDate;
    rec.windowOpenAt = rec.factDate;
    rec.windowCloseAt = day(new Date(new Date(rec.factDate).getTime() + 90 * 86400000));
    rec.dispute.state = 'accepted';
    rec.dispute.resolvedAt = NOW;
    form = null; refresh(); return;
  }

  if (what === 'declineDispute') {
    const text = val('#dText');
    if (!text) { error = 'Обоснование обязательно.'; renderPane(); return; }
    rec.dispute.state = 'declined';
    rec.dispute.resolvedAt = NOW;
    rec.dispute.resolution = text;
    form = null; refresh(); return;
  }

  if (what === 'comment') {
    const text = val('#cText');
    if (!text) return;
    addComment(text, 'exec');
    renderTabs(); renderPane(); return;
  }
}

function addComment(text, side) {
  rec.comments.push({
    at: NOW, side,
    author: side === 'exec' ? 'Фатхутдинов Д.Ф.' : (rec.customer || 'Заказчик'),
    text,
  });
  rec.commentsCount = rec.comments.length;
}

/* ------------------------------ события ------------------------------ */

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) {
    tab = t.dataset.tab; form = null; error = '';
    store.set('vmap.cardTab', tab);
    renderTabs(); renderPane(); return;
  }

  const a = e.target.closest('[data-act]');
  const isMenuToggle = a && a.dataset.act === 'menu';

  /* Меню действий закрывается любым кликом, кроме клика по самой кнопке-
     переключателю: снаружи, по пункту меню (даже нерабочему, без data-act),
     по пункту с действием — везде. Переключатель обрабатывает открытие/закрытие сам. */
  if (headMenuOpen && !isMenuToggle) { headMenuOpen = false; renderHead(); }

  if (!a) return;
  const [kind, what] = a.dataset.act.split(':');

  if (kind === 'menu') { headMenuOpen = !headMenuOpen; renderHead(); return; }
  if (kind === 'open') { form = what; error = ''; renderPane(); return; }
  if (kind === 'goto') {
    /* Кнопка из шапки не выполняет действие, а ведёт к форме во вкладке. */
    tab = 'impl'; form = what; error = '';
    store.set('vmap.cardTab', tab);
    renderTabs(); renderPane(); return;
  }
  if (kind === 'cancel') { form = null; error = ''; renderPane(); return; }
  if (kind === 'log') { logOnlyTalk = what === 'talk'; renderPane(); return; }
  if (kind === 'submit') { submit(what); return; }
});

/* Листание стрелками — как в почтовом клиенте. Внутри поля ввода стрелки
   работают по своему прямому назначению. */
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowLeft' && PREV_ID) location.href = `card.html?id=${PREV_ID}`;
  if (e.key === 'ArrowRight' && NEXT_ID) location.href = `card.html?id=${NEXT_ID}`;
});

renderHead();
renderRibbon();
renderTabs();
renderPane();
renderContext();
