/* Экран «Пользователи и роли» — поведение макета.

   Экран отвечает на один вопрос: что человек увидит, открыв модуль, и что
   сможет по увиденному сделать. Отсюда состав карточки — три настройки, а не
   список галочек по каждому действию:

     1. Зона ответственности — набор месторождений. Граница видимости, а не
        фильтр: от неё считаются плитки реестра, счётчики фильтров и «всего в
        реестре» (решение 87). Пустая зона означает «все объекты договора».
     2. Право решения — есть ли у пользователя Заказчика кнопки «Принять»,
        «Отклонить», «Требует уточнения». Без права карточка открывается
        целиком, вместе с нормативом ответа, — не хватает только кнопок
        (решение 89).
     3. Отбор по ответственному — у эксперта АКЭ рекомендация именная: он её
        выдал и он же ведёт её по телеметрии.

   Права на действия с рекомендациями задаются ролью. Редактирование экономической модели —
   отдельное полномочие: его нельзя неявно вывести из стороны или права решения. Паролей, входа и связи с учётными записями
   ВМАП тоже нет — в рабочем модуле человек приходит уже опознанным, а этот
   экран задаёт, что ему в модуле доступно.

   Рядом с зоной всегда стоит число рекомендаций, попадающих в неё сейчас:
   без него выбор восемнадцати названий — угадывание. Число считается той же
   функцией inScope, которой отбирают инбокс и реестр, иначе три экрана
   покажут одному человеку три разные цифры.

   Макет живой: правки меняют состояние в памяти и перерисовывают экран.
   Ничего не сохраняется — перезагрузка возвращает исходный состав. */

const $ = (s, root = document) => root.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');

/* Имена и названия ролей приходят и в текст, и в атрибуты разметки, поэтому
   экранируются одной функцией оба места — как в card.js и refs.js. */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Пояснения интерфейса пишутся в коде многострочно, а попадают в разметку,
   где перенос строки виден. Тот же приём, что в card.js. */
const prose = (s) => s.replace(/\s+/g, ' ').trim();

/* Кто правит настройки. Он же администратор модуля — см. ADMIN ниже. */
const ME = 'Фатхутдинов Д.Ф.';

function fmtDate(d) { return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDT(d) { return `${fmtDate(d)} ${fmtTime(d)}`; }

/** Русское склонение при числе: 1 месторождение, 2 месторождения, 5 месторождений. */
function plural(n, forms) {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/* ------------------------------ роли ------------------------------

   Состав ролей задан договором и решениями, а не заводится из интерфейса:
   за ролью стоят разрешённые действия и переходы статусов, то есть логика
   модуля. Поэтому роль у пользователя выбирается из списка, а сам список
   правится вместе с модулем — ровно как системные справочники на соседнем
   экране (решение 84).

   Стартовая страница у роли своя: эксперт и инженер приходят в «Мои задачи»,
   технолог без права решения — сразу в реестр (задач у него нет, в
   переключателе инбокса он не показывается), администратор — в «Пользователей
   и роли» (решение 82). */
const ROLE_SPECS = [
  {
    key: 'expert', side: 'Исполнитель', home: 'inbox',
    byExecutor: true, canDecide: false,
    note: 'Регистрирует рекомендации, передаёт их Заказчику и фиксирует факт реализации по телеметрии.',
  },
  {
    key: 'expertLead', side: 'Исполнитель', home: 'inbox',
    byExecutor: false, canDecide: false,
    note: 'Видит работу всей команды экспертов: просрочки ответа, согласованное без работ, спорные даты.',
  },
  {
    key: 'engineer', side: 'Заказчик', home: 'inbox',
    byExecutor: false, canDecide: true,
    note: 'Принимает решения по рекомендациям своих месторождений и организует мероприятия.',
  },
  {
    key: 'customerLead', side: 'Заказчик', home: 'inbox',
    byExecutor: false, canDecide: true,
    note: 'Контролирует прохождение рекомендаций по всем объектам договора.',
  },
  {
    key: 'viewer', side: 'Заказчик', home: 'registry',
    byExecutor: false, canDecide: false,
    /* Роль задаёт только значение по умолчанию: право решения — свойство
       человека, а не роли, и переключается в карточке. Поэтому в подписи
       «решения не принимает» не утверждается — иначе она разошлась бы с
       переключателем сразу, как только право выдали. */
    note: 'Работает с рекомендацией — обоснованием, ожидаемым эффектом, обсуждением. По умолчанию заводится без права решения.',
  },
  /* Администратор модуля ведёт этот экран и справочники; рекомендаций у него
     нет вовсе, поэтому ни зоны, ни права решения ему не задают, и счётчика
     рекомендаций в списке у него тоже нет (решение 82). */
  {
    key: 'admin', label: 'Администратор модуля', side: 'Исполнитель', home: 'users',
    byExecutor: false, canDecide: false, recs: false,
    note: 'Ведёт пользователей, роли и справочники модуля. Задач по рекомендациям у него не бывает.',
  },
];

/* Названия ролей берутся из data.js: там они уже написаны и оттуда же их
   читает переключатель инбокса. Дублировать список подписей в двух файлах —
   это гарантированно получить в модуле «Инженер Заказчика» на одном экране и
   «Инженер заказчика» на другом. */
for (const spec of ROLE_SPECS) {
  const known = USERS.find((u) => u.key === spec.key);
  if (known) spec.label = known.label;
}

const ROLE = Object.fromEntries(ROLE_SPECS.map((s) => [s.key, s]));

const HOMES = {
  inbox: 'Мои задачи',
  registry: 'Реестр рекомендаций',
  users: 'Пользователи и роли',
};

const SIDES = ['Исполнитель', 'Заказчик'];

/* Подпись к стороне объясняет деление один раз в заголовке группы, а не тегом
   на каждой строке — как классы справочников на соседнем экране. */
const SIDE_NOTE = {
  'Исполнитель': `Выдают рекомендации и ведут их по телеметрии. Решение по рекомендации принимает
    Заказчик, поэтому права решения у этих ролей нет.`,
  'Заказчик': `Принимают решения по рекомендациям и организуют мероприятия. Видят только те объекты,
    которые заданы зоной ответственности.`,
};

/* ------------------------------ пользователи ------------------------------

   Персоны демонстрационные и взяты из data.js: там уже лежат зона, право
   решения и именной отбор, и по ним же собирается инбокс. Здесь к ним
   добавляется только то, чего нет в общих данных, — признак активности,
   стартовая страница и история изменений.

   Администратора в USERS нет: инбокс его не показывает, реестр по нему не
   отбирает, и в общие данные он попал бы мёртвым грузом. Заведён здесь —
   до тех пор, пока список пользователей не станет отдельной сущностью. */
const ADMIN = {
  key: 'admin', who: ME, side: 'Исполнитель', zone: [], canDecide: false, canEditEconomy: true,
};

let seq = 0;

function makePerson(src, log) {
  const spec = ROLE[src.key];
  return {
    id: `u-${seq++}`,
    name: src.who,
    role: src.key,
    zone: [...src.zone],
    executor: src.executor || null,
    canDecide: !!src.canDecide,
    canEditEconomy: ECONOMY_EDITORS.includes(src.who) || !!src.canEditEconomy,
    home: spec.home,
    active: true,
    log: log.map((e) => ({ who: ME, ...e })),
  };
}

/* История заведена не для красоты: настройка доступа — единственное место
   модуля, где один человек меняет то, что видит другой, и вопрос «кто открыл
   ему это месторождение» задают именно здесь. Даты — до начала оказания
   услуг по договору (01.07.2026) и по ходу первого месяца работы. */
const people = [
  ...USERS.map((u) => makePerson(u, seedLog(u.key))),
  makePerson(ADMIN, seedLog('admin')),
];

function seedLog(key) {
  const start = [{ at: new Date('2026-06-24T10:12'), text: 'Учётная запись заведена.' }];
  if (key === 'expert') {
    return [
      { at: new Date('2026-07-02T09:31'), text: 'Отбор по ответственному: Матросов. Эксперт ведёт свои рекомендации.' },
      ...start,
    ];
  }
  if (key === 'engineer') {
    return [
      {
        at: new Date('2026-07-09T16:40'),
        text: 'Зона ответственности: добавлено месторождение «Новоортьягунское».',
      },
      {
        at: new Date('2026-06-30T11:05'),
        text: 'Зона ответственности задана: Дружное (Кумалиягунское и Танеевское), Восточно-Придорожное.',
      },
      ...start,
    ];
  }
  if (key === 'viewer') {
    return [
      {
        at: new Date('2026-07-14T12:20'),
        text: 'Право решения снято: решение по рекомендации принимает уполномоченный сотрудник Заказчика.',
      },
      { at: new Date('2026-07-14T12:18'), text: 'Зона ответственности задана — те же объекты, что у инженера.' },
      ...start,
    ];
  }
  return start;
}

let current = people[0].id;
let view = 'access';     // access | log
let form = null;         // { kind: 'user' | 'zone', … } — раскрытая форма
let formErr = '';

const person = () => people.find((p) => p.id === current);

/* ------------------------------ счёт по зоне ------------------------------

   Считается той же функцией inScope, что отбирает инбокс и реестр (решение
   87): собственная арифметика здесь означала бы, что администратор задаёт
   зону по одному числу, а человек потом видит другое. */

function scopeCount(zone, executor) {
  return DATA.filter((r) => inScope({ zone, executor }, r)).length;
}

/** Сколько рекомендаций даст одно месторождение с учётом именного отбора. */
function fieldCount(field, executor) {
  return DATA.filter((r) => r.field === field && (!executor || r.executor === executor)).length;
}

/* ------------------------------ левый список ------------------------------ */

function renderList() {
  const html = SIDES.map((side) => {
    const items = people.filter((p) => ROLE[p.role].side === side);
    if (!items.length) return '';
    return `<div class="userlist__section">${side}</div>
      <div class="userlist__note">${prose(SIDE_NOTE[side])}</div>
      ${items.map((p) => {
        const spec = ROLE[p.role];
        const n = spec.recs === false ? null : scopeCount(p.zone, p.executor);
        return `<a class="navitem uitem ${p.id === current ? 'is-active' : ''}" data-user="${p.id}">
          <span class="uitem__b">
            <span class="uitem__n">${esc(p.name)}${p.active ? '' : ' <span class="tag tag--default">отключён</span>'}</span>
            <span class="uitem__r">${esc(spec.label)}</span>
          </span>
          ${n === null ? '' : `<span class="badge" title="Рекомендаций в зоне ответственности">${n}</span>`}
        </a>`;
      }).join('')}`;
  }).join('');
  $('#userlist').innerHTML = html;
}

/* ------------------------------ шапка карточки ------------------------------ */

function renderHead() {
  const p = person();

  /* Добавление занимает панель целиком: настройки выбранного пользователя,
     оставшиеся под формой, читались бы как настройки заводимого — а зона и
     право решения у него ещё пустые. */
  if (form && form.mode === 'add') {
    $('#userhead').innerHTML = `
      <div class="userhead__top"><h2 class="userhead__t">Новый пользователь</h2></div>
      <div class="userhead__desc">Учётная запись заводится администратором модуля: человек не
        регистрируется сам, а получает роль и объекты.</div>`;
    return;
  }

  const spec = ROLE[p.role];
  const zoneText = p.zone.length
    ? `${p.zone.length} ${plural(p.zone.length, ['месторождение', 'месторождения', 'месторождений'])}`
    : 'все объекты договора';

  $('#userhead').innerHTML = `
    <div class="userhead__top">
      <h2 class="userhead__t">${esc(p.name)}</h2>
      <span class="tag tag--accent tag--lg">${esc(spec.label)}</span>
      ${p.active ? '' : '<span class="tag tag--default tag--lg">учётная запись отключена</span>'}
      ${p.name === ME ? '<span class="mark userhead__me">это вы</span>' : ''}
      <div class="userhead__act">
        <div class="seg">
          <button class="seg__b ${view === 'access' ? 'is-on' : ''}" data-view="access">Доступ</button>
          <button class="seg__b ${view === 'log' ? 'is-on' : ''}" data-view="log">Журнал изменений</button>
        </div>
        <button class="btn" data-act="edit"><svg class="ic16"><use href="#i-pencil"/></svg>Изменить</button>
        ${p.active
          ? `<button class="btn" data-act="askOff"><svg class="ic16"><use href="#i-off"/></svg>Отключить</button>`
          : `<button class="btn" data-act="on"><svg class="ic16"><use href="#i-check"/></svg>Включить</button>`}
      </div>
    </div>
    <div class="userhead__desc">${prose(spec.note)}</div>
    <div class="userhead__meta">
      <span>Сторона: <b>${spec.side}</b></span>
      <span>Стартовая страница: <b>${HOMES[p.home]}</b></span>
      ${spec.recs === false ? '' : `<span>Зона ответственности: <b>${zoneText}</b></span>`}
      <span>Изменений в журнале: <b>${p.log.length}</b></span>
    </div>`;
}

/* ------------------------------ форма пользователя ------------------------------ */

function errLine() { return formErr ? `<div class="form__err">${formErr}</div>` : ''; }

function userFormHtml() {
  const v = form.values;
  const spec = ROLE[v.role];

  return `<div class="form">
    <div class="form__h">${form.mode === 'add' ? 'Новый пользователь' : 'Правка пользователя'}</div>
    <div class="form__row">
      <label class="form__f"><span class="form__l">ФИО</span>
        <input class="inp" id="fName" value="${esc(v.name)}" placeholder="Фамилия И.О."></label>
      <label class="form__f"><span class="form__l">Роль</span>
        <span class="field field--wide"><select id="fRole">
          ${ROLE_SPECS.map((s) => `<option value="${s.key}" ${s.key === v.role ? 'selected' : ''}>${esc(s.label)} — ${s.side}</option>`).join('')}
        </select></span></label>
    </div>
    <div class="form__hint">${prose(spec.note)}</div>
    <div class="form__row">
      <label class="form__f"><span class="form__l">Стартовая страница</span>
        <span class="field field--wide"><select id="fHome">
          ${Object.entries(HOMES).map(([k, label]) => `<option value="${k}" ${k === v.home ? 'selected' : ''}>${label}</option>`).join('')}
        </select></span></label>
      ${spec.byExecutor
        ? `<label class="form__f"><span class="form__l">Отбор по ответственному</span>
            <span class="field field--wide"><select id="fExec">
              <option value="">Без отбора — все рекомендации зоны</option>
              ${EXECUTORS.map((e) => `<option value="${esc(e)}" ${e === v.executor ? 'selected' : ''}>${esc(e)}</option>`).join('')}
            </select></span></label>`
        : '<div class="form__f"></div>'}
    </div>
    ${form.mode === 'add'
      ? `<div class="form__hint">Зона ответственности и право решения задаются в карточке сразу после
          создания. У нового пользователя зона пустая — это значит «все объекты договора»,
          а не «ни одного».</div>`
      : ''}
    ${errLine()}
    <div class="form__btns">
      <button class="btn btn--accent" data-act="save">Сохранить</button>
      <button class="btn" data-act="cancel">Отмена</button>
    </div>
  </div>`;
}

/* ------------------------------ форма зоны ------------------------------

   Восемнадцать месторождений — уже тот размер, при котором список без поиска
   листают глазами дольше, чем набирают три буквы. Рядом с каждым стоит, во
   сколько рекомендаций оно обойдётся: разница между «Дружное» и «Тевлинско-
   Русскинское» — это разница в разы, и по названию она не видна.

   Режим «все объекты договора» вынесен отдельным переключателем, а не
   «снимите все галочки»: пустой список и «всё сразу» — противоположные по
   смыслу состояния, а на экране выглядели бы одинаково. */
/** Подпись справа от поиска: сколько объектов сейчас в списке. Вынесена в
    функцию, потому что при наборе в поиске экран не перерисовывается — строку
    обновляет обработчик ввода. */
function zbarInfo(shown) {
  return shown === FIELDS.length
    ? `${FIELDS.length} ${plural(FIELDS.length, ['месторождение', 'месторождения', 'месторождений'])} в договоре`
    : `найдено ${shown} из ${FIELDS.length}`;
}

function zoneFormHtml() {
  const p = person();
  const v = form.values;
  const q = v.q.trim().toLowerCase();
  const chosen = v.mode === 'all' ? [] : [...v.zone];
  const n = chosen.length;
  /* Пустой выбор в режиме «выбранные» — это ноль рекомендаций, а не «все»:
     inScope на пустой зоне отвечает «видно всё», и без этой развилки счётчик
     на снятых галочках показывал бы весь реестр. Сохранить такое состояние
     всё равно нельзя — форма его не пропускает, — но пока человек снимает
     галочки, счётчик обязан говорить правду. */
  const recs = v.mode === 'all' || !chosen.length ? 0 : scopeCount(chosen, p.executor);

  const rows = FIELDS.map((f) => {
    const hit = !q || f.toLowerCase().includes(q);
    const c = fieldCount(f, p.executor);
    return `<label class="zrow ${hit ? '' : 'is-hidden'}" data-field="${esc(f)}">
      <input type="checkbox" ${v.zone.has(f) ? 'checked' : ''} ${v.mode === 'all' ? 'disabled' : ''}>
      <span class="zrow__n">${esc(f)}</span>
      <small class="zrow__c" title="Рекомендаций в тестовом наборе">${c}</small>
    </label>`;
  }).join('');

  const shown = FIELDS.filter((f) => !q || f.toLowerCase().includes(q)).length;

  /* Заголовка у формы нет: она раскрывается внутри блока «Зона
     ответственности», и второй такой же заголовок читался бы как вложенный
     раздел. */
  return `<div class="form">
    <div class="radios">
      <label class="radio"><input type="radio" name="zmode" value="all" ${v.mode === 'all' ? 'checked' : ''}>
        Все объекты договора</label>
      <label class="radio"><input type="radio" name="zmode" value="list" ${v.mode === 'list' ? 'checked' : ''}>
        Выбранные месторождения</label>
    </div>

    <div class="zpick ${v.mode === 'all' ? 'is-off' : ''}">
      <div class="zbar">
        <label class="field"><svg class="ic16 field__icon"><use href="#i-search"/></svg>
          <input type="search" id="zq" value="${esc(v.q)}" placeholder="Поиск месторождения…"></label>
        <button class="btn btn--small" data-act="zoneAll">Отметить все</button>
        <button class="btn btn--small" data-act="zoneNone">Снять все</button>
        <span class="zbar__i" id="zfound">${zbarInfo(shown)}</span>
      </div>
      <div class="zlist">${rows}</div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <span class="kpi__k">Месторождений в зоне</span>
        <span class="kpi__v">${v.mode === 'all' ? FIELDS.length : n}<small>из ${FIELDS.length}</small></span>
      </div>
      <div class="kpi">
        <span class="kpi__k">Рекомендаций попадает в зону</span>
        <span class="kpi__v">${v.mode === 'all' ? scopeCount([], p.executor) : recs}<small>из ${DATA.length} в реестре</small></span>
      </div>
    </div>
    ${p.executor ? `<div class="form__hint">${prose(`Сверх зоны действует именной отбор:
      показываются только рекомендации, где ответственный — ${esc(p.executor)}. Поэтому даже при всех
      объектах договора виден не весь реестр, а ${scopeCount([], p.executor)} из ${DATA.length}.`)}</div>` : ''}

    <div class="form__hint">Зона — не фильтр, который можно снять: за её пределами рекомендаций для
      этого человека не существует. От неё считаются плитки реестра, счётчики в фильтрах колонок
      и число задач в «Моих задачах».</div>
    ${errLine()}
    <div class="form__btns">
      <button class="btn btn--accent" data-act="save">Сохранить</button>
      <button class="btn" data-act="cancel">Отмена</button>
    </div>
  </div>`;
}

/* ------------------------------ блоки доступа ------------------------------ */

function zoneBlock() {
  const p = person();
  const spec = ROLE[p.role];
  if (spec.recs === false) {
    return `<div class="ublock">
      <div class="block__h">Зона ответственности</div>
      <div class="ublock__t">${prose(`Роль не работает с рекомендациями, поэтому объектов ей не назначают.
        Настройки модуля от месторождения не зависят.`)}</div>
    </div>`;
  }

  if (form && form.kind === 'zone') {
    return `<div class="ublock">
      <div class="block__h">
        <svg class="ic16 ublock__ic"><use href="#i-map"/></svg>Зона ответственности
      </div>
      ${zoneFormHtml()}
    </div>`;
  }

  /* Сравнение идёт со всем реестром, а не с тем, что человеку доступно по
     другим основаниям: «54 из 54» формально верно, но не отвечает на вопрос,
     ради которого на счётчик и смотрят, — насколько зона сужает видимое. */
  const recs = scopeCount(p.zone, p.executor);

  const body = p.zone.length
    ? `<div class="zchips">${p.zone.map((f) => `<span class="zchip">${esc(f)}
        <small>${fieldCount(f, p.executor)}</small></span>`).join('')}</div>`
    : `<div class="ublock__t">${prose(`Ограничения по объектам нет — человек видит все месторождения
        договора. Так заданы роли Исполнителя и руководитель Заказчика.`)}</div>`;

  return `<div class="ublock">
    <div class="block__h">
      <svg class="ic16 ublock__ic"><use href="#i-map"/></svg>Зона ответственности
      <button class="btn btn--ghost btn--small ublock__act" data-act="zone">Изменить зону</button>
    </div>
    <div class="kpis">
      <div class="kpi">
        <span class="kpi__k">Месторождений в зоне</span>
        <span class="kpi__v">${p.zone.length || FIELDS.length}<small>из ${FIELDS.length}</small></span>
      </div>
      <div class="kpi">
        <span class="kpi__k">Рекомендаций видит сейчас</span>
        <span class="kpi__v">${recs}<small>из ${DATA.length} в реестре</small></span>
      </div>
    </div>
    ${body}
  </div>`;
}

function decideBlock() {
  const p = person();
  const spec = ROLE[p.role];

  /* У ролей Исполнителя переключателя нет вовсе, а не выключенный: решение по
     рекомендации принимает Заказчик, и включать это Исполнителю нечем.
     Выключенный переключатель означал бы «можно, но не сейчас». */
  if (spec.side === 'Исполнитель') {
    return `<div class="ublock">
      <div class="block__h">Право решения</div>
      <div class="ublock__t">${prose(`Решение по рекомендации принимает Заказчик, поэтому ролям
        Исполнителя оно не назначается. Действия Исполнителя другие: регистрация, передача
        и фиксация факта реализации по телеметрии.`)}</div>
    </div>`;
  }

  return `<div class="ublock">
    <div class="block__h">Право решения по рекомендациям</div>
    <label class="sw">
      <input type="checkbox" id="swDecide" ${p.canDecide ? 'checked' : ''}>
      <span class="sw__t"></span>
      <span class="sw__l">${p.canDecide ? 'Принимает решения' : 'Решения не принимает'}</span>
    </label>
    <div class="ublock__t">${p.canDecide
      ? prose(`В карточке доступны «Принять», «Отклонить» и «Требует уточнения». Каждое решение
          требует обоснования и двигает статус рекомендации.`)
      : prose(`Карточка открывается целиком — обоснование, ожидаемый эффект, история, обсуждение,
          норматив ответа. Кнопок «Принять», «Отклонить» и «Требует уточнения» в блоке решения нет,
          вместо них строка о том, что решение принимает уполномоченный сотрудник.`)}</div>
  </div>`;
}

function economyBlock() {
  const p = person();
  return `<div class="ublock">
    <div class="block__h">Экономическая модель</div>
    <label class="sw">
      <input type="checkbox" id="swEconomy" ${p.canEditEconomy ? 'checked' : ''}>
      <span class="sw__t"></span>
      <span class="sw__l">${p.canEditEconomy ? 'Может редактировать' : 'Только просмотр'}</span>
    </label>
    <div class="ublock__t">${p.canEditEconomy
      ? prose(`Пользователь может менять общие параметры, ставки по месторождениям и НДПИ по пластам.
          Публикация требует причины и записывается в историю отдельной версией.`)
      : prose(`Экономическая модель доступна для просмотра вместе с историей. Изменять значения
          и публиковать новую версию пользователь не может.`)}</div>
  </div>`;
}

function executorBlock() {
  const p = person();
  const spec = ROLE[p.role];
  if (!spec.byExecutor) return '';

  return `<div class="ublock">
    <div class="block__h">Отбор по ответственному</div>
    <div class="ublock__t">${p.executor
      ? prose(`Показываются только рекомендации, где ответственный Исполнителя — <b>${esc(p.executor)}</b>.
          Рекомендация у эксперта именная: он её выдал и он же ведёт её по телеметрии до закрытия
          окна эффекта.`)
      : prose(`Отбора нет — эксперт видит рекомендации всей зоны, включая чужие.`)}</div>
    <div class="ublock__t ublock__t--quiet">Меняется в форме правки пользователя.</div>
  </div>`;
}

function accountBlock() {
  const p = person();
  if (p.active) return '';
  return `<div class="ublock ublock--off">
    <div class="block__h">Учётная запись отключена</div>
    <div class="ublock__t">${prose(`Человек в модуль не входит, задачи ему не назначаются, в переключателе
      ответственных он не предлагается. Всё, что он успел сделать, остаётся на месте: имя в истории
      рекомендаций, решения и комментарии никуда не деваются — поэтому запись отключается, а не
      удаляется.`)}</div>
  </div>`;
}

/* ------------------------------ журнал ------------------------------ */

function logHtml() {
  const p = person();
  const entries = [...p.log].sort((a, b) => b.at - a.at);
  if (!entries.length) return '<div class="empty-pane">Записей нет.</div>';
  return `<div class="log">${entries.map((e) => `
    <div class="log__i">
      <div class="log__d">${fmtDT(e.at)}</div>
      <div class="log__t">${esc(e.text)}<span class="uwho">${esc(e.who)}</span></div>
    </div>`).join('')}</div>`;
}

/* ------------------------------ общая отрисовка ------------------------------ */

function render() {
  renderList();
  renderHead();

  const adding = form && form.mode === 'add';
  $('#userbody').innerHTML = view === 'log'
    ? logHtml()
    : `${form && form.kind === 'user' ? `<div class="ublock">${userFormHtml()}</div>` : ''}
       ${adding ? '' : `${accountBlock()}${zoneBlock()}${decideBlock()}${economyBlock()}${executorBlock()}`}`;

  $('#headActions').innerHTML = `
    <button class="btn btn--accent" data-act="add"><svg class="ic16"><use href="#i-plus"/></svg>Добавить пользователя</button>`;
}

function note(p, text) { p.log.push({ at: NOW, who: ME, text }); }

/* ------------------------------ формы ------------------------------ */

function openUserForm(mode) {
  const p = person();
  formErr = '';
  form = mode === 'add'
    ? { kind: 'user', mode: 'add', values: { name: '', role: 'engineer', home: 'inbox', executor: '' } }
    : { kind: 'user', mode: 'edit', values: { name: p.name, role: p.role, home: p.home, executor: p.executor || '' } };
  view = 'access';
  render();
  const el = $('#fName');
  if (el) el.focus();
}

function openZoneForm() {
  const p = person();
  formErr = '';
  form = {
    kind: 'zone',
    values: { mode: p.zone.length ? 'list' : 'all', zone: new Set(p.zone), q: '' },
  };
  view = 'access';
  render();
}

/** Значения формы пользователя читаются перед каждой перерисовкой: смена роли
    перестраивает форму, и набранное имя иначе стиралось бы на полпути. */
function readUserForm() {
  const v = form.values;
  if ($('#fName')) v.name = $('#fName').value.trim();
  if ($('#fRole')) v.role = $('#fRole').value;
  if ($('#fHome')) v.home = $('#fHome').value;
  v.executor = $('#fExec') ? $('#fExec').value : '';
}

function saveUserForm() {
  readUserForm();
  const v = form.values;
  const spec = ROLE[v.role];

  if (!v.name) { formErr = 'ФИО не заполнено.'; render(); return; }
  /* Одноимённый пользователь — это почти всегда вторая запись тому же
     человеку, а не однофамилец: имя стоит в истории рекомендаций, и две
     записи разведут одного человека надвое прямо в отчётности. */
  const dup = people.find((p) => p.id !== current && p.name.toLowerCase() === v.name.toLowerCase());
  if (dup) {
    formErr = `Пользователь «${v.name}» уже заведён — ${ROLE[dup.role].label}. Роль меняется у существующей записи, второй такой же не нужно.`;
    render(); return;
  }

  if (form.mode === 'add') {
    const p = {
      id: `u-${seq++}`, name: v.name, role: v.role, zone: [],
      executor: spec.byExecutor ? (v.executor || null) : null,
      canDecide: spec.canDecide, canEditEconomy: false, home: v.home, active: true, log: [],
    };
    people.push(p);
    current = p.id;
    note(p, `Учётная запись заведена: ${spec.label}.`);
    form = null; render(); return;
  }

  const p = person();
  if (p.name !== v.name) note(p, `Имя изменено: «${p.name}» → «${v.name}».`);
  if (p.role !== v.role) {
    note(p, `Роль изменена: ${ROLE[p.role].label} → ${spec.label}.`);
    /* Право решения — свойство стороны, а не человека: при переезде на роль
       Исполнителя оно снимается само, иначе в данных останется Исполнитель
       с правом решения Заказчика, и разбирать это будет некому. */
    if (spec.side === 'Исполнитель' && p.canDecide) {
      p.canDecide = false;
      note(p, 'Право решения снято вместе со сменой стороны: решения принимает Заказчик.');
    }
  }
  const exec = spec.byExecutor ? (v.executor || null) : null;
  if (p.executor !== exec) {
    note(p, exec
      ? `Отбор по ответственному: ${exec}.`
      : 'Отбор по ответственному снят — видны рекомендации всей зоны.');
  }
  if (p.home !== v.home) note(p, `Стартовая страница: ${HOMES[v.home]}.`);

  p.name = v.name; p.role = v.role; p.home = v.home; p.executor = exec;
  form = null; render();
}

function readZoneForm() {
  const v = form.values;
  const q = $('#zq');
  if (q) v.q = q.value;
}

function saveZoneForm() {
  readZoneForm();
  const p = person();
  const v = form.values;
  const next = v.mode === 'all' ? [] : FIELDS.filter((f) => v.zone.has(f));

  if (v.mode === 'list' && !next.length) {
    formErr = prose(`Не отмечено ни одного месторождения. Пустой список — это «все объекты договора»,
      и выбирается он переключателем выше; закрыть человеку доступ ко всему сразу нельзя — для этого
      отключают учётную запись.`);
    render(); return;
  }

  const was = new Set(p.zone);
  const added = next.filter((f) => !was.has(f));
  const gone = p.zone.filter((f) => !next.includes(f));

  if (added.length || gone.length || (!p.zone.length !== !next.length)) {
    const parts = [];
    if (!next.length) parts.push('открыты все объекты договора');
    else {
      if (added.length) parts.push(`добавлено: ${added.join(', ')}`);
      if (gone.length) parts.push(`убрано: ${gone.join(', ')}`);
      if (!was.size) parts.push(`зона ограничена ${next.length} ${plural(next.length, ['месторождением', 'месторождениями', 'месторождениями'])}`);
    }
    const recs = scopeCount(next, p.executor);
    note(p, `Зона ответственности: ${parts.join('; ')}. Видимых рекомендаций стало ${recs}.`);
  }

  p.zone = next;
  form = null; render();
}

/* ------------------------------ отключение ------------------------------

   Учётная запись отключается, а не удаляется, — по той же причине, по которой
   на соседнем экране значение справочника уходит в архив: имя автора стоит в
   истории рекомендаций, в решениях и в комментариях, и удаление превратило бы
   их в записи без автора. Разбирательство по разделу 10 договора после этого
   не собрать. */
function askOff(anchor) {
  const p = person();
  const spec = ROLE[p.role];
  const recs = spec.recs === false ? 0 : scopeCount(p.zone, p.executor);

  const pop = $('#popover');
  /* Кнопка не гасится, а объясняет себя по нажатию — как заблокированные
     действия на «Справочниках». Отключить себя нельзя ровно по одной причине:
     включить обратно будет некому, а второго администратора в модуле может
     и не быть. */
  pop.innerHTML = p.name === ME
    ? `<div class="confirm">
        <div class="confirm__h">Свою учётную запись отключить нельзя</div>
        <div class="confirm__t">${prose(`Пользователями и ролями ведает администратор, и, отключив
          себя, вернуть доступ он уже не сможет. Если запись нужно закрыть — сначала заведите
          второго администратора, он и отключит.`)}</div>
        <div class="popover__foot">
          <button class="btn btn--ghost" data-act="closePop">Понятно</button></div>
      </div>`
    : `<div class="confirm">
        <div class="confirm__h">Отключить «${esc(p.name)}»?</div>
        <div class="confirm__t">${prose(`Вход в модуль закроется, новые задачи назначаться не будут,
          в списке ответственных он больше не предлагается.`)}</div>
        ${recs ? `<div class="confirm__t">${prose(`Сейчас в его зоне ${recs}
          ${plural(recs, ['рекомендация', 'рекомендации', 'рекомендаций'])}. Они никуда не денутся,
          но следить за ними станет некому — назначьте зону кому-то ещё.`)}</div>` : ''}
        <div class="confirm__t">${prose(`Сделанное остаётся: имя в истории рекомендаций, решения и
          комментарии сохраняются. Поэтому запись отключается, а не удаляется.`)}</div>
        <div class="popover__foot">
          <button class="btn btn--no" data-act="off">Отключить</button>
          <button class="btn btn--ghost" data-act="closePop">Отмена</button></div>
      </div>`;
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left - 160, window.innerWidth - pop.offsetWidth - 12)) + 'px';
  pop.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 12)) + 'px';
}

function closePopover() { $('#popover').hidden = true; }

/* ------------------------------ события ------------------------------ */

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-user]');
  if (nav) {
    current = nav.dataset.user;
    view = 'access'; form = null; formErr = '';
    closePopover(); render(); return;
  }

  const seg = e.target.closest('[data-view]');
  if (seg) { view = seg.dataset.view; closePopover(); render(); return; }

  const btn = e.target.closest('[data-act]');
  if (btn) {
    const act = btn.dataset.act;
    const p = person();

    if (act === 'add') { closePopover(); openUserForm('add'); return; }
    if (act === 'edit') { closePopover(); openUserForm('edit'); return; }
    if (act === 'zone') { closePopover(); openZoneForm(); return; }
    if (act === 'askOff') { askOff(btn); return; }
    if (act === 'off') {
      p.active = false;
      note(p, 'Учётная запись отключена.');
      closePopover(); render(); return;
    }
    if (act === 'on') {
      p.active = true;
      note(p, 'Учётная запись включена.');
      closePopover(); render(); return;
    }
    if (act === 'zoneAll') {
      readZoneForm();
      /* Отмечает только то, что осталось после поиска: иначе кнопка под
         строкой поиска делает не то, что показано на экране. */
      const v = form.values;
      const q = v.q.trim().toLowerCase();
      for (const f of FIELDS) if (!q || f.toLowerCase().includes(q)) v.zone.add(f);
      render(); return;
    }
    if (act === 'zoneNone') {
      readZoneForm();
      const v = form.values;
      const q = v.q.trim().toLowerCase();
      for (const f of FIELDS) if (!q || f.toLowerCase().includes(q)) v.zone.delete(f);
      render(); return;
    }
    if (act === 'save') {
      if (form.kind === 'zone') saveZoneForm(); else saveUserForm();
      return;
    }
    if (act === 'cancel') { form = null; formErr = ''; render(); return; }
    if (act === 'closePop') { closePopover(); return; }
  }

  if (!e.target.closest('#popover')) closePopover();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'swEconomy') {
    const p = person();
    p.canEditEconomy = e.target.checked;
    const known = ECONOMY_EDITORS.indexOf(p.name);
    if (p.canEditEconomy && known < 0) ECONOMY_EDITORS.push(p.name);
    if (!p.canEditEconomy && known >= 0) ECONOMY_EDITORS.splice(known, 1);
    note(p, p.canEditEconomy
      ? 'Выдано отдельное право редактировать экономическую модель.'
      : 'Право редактировать экономическую модель снято; сохранён доступ на просмотр и к истории.');
    render(); return;
  }
  if (e.target.id === 'swDecide') {
    const p = person();
    p.canDecide = e.target.checked;
    note(p, p.canDecide
      ? 'Право решения выдано: в карточке появились «Принять», «Отклонить», «Требует уточнения».'
      : 'Право решения снято: карточка открывается целиком, но без кнопок решения.');
    render(); return;
  }
  if (e.target.id === 'fRole' || e.target.id === 'fHome' || e.target.id === 'fExec') {
    readUserForm(); render(); return;
  }
  if (form && form.kind === 'zone') {
    if (e.target.name === 'zmode') { readZoneForm(); form.values.mode = e.target.value; render(); return; }
    const row = e.target.closest('[data-field]');
    if (row) {
      readZoneForm();
      const f = row.dataset.field;
      if (e.target.checked) form.values.zone.add(f); else form.values.zone.delete(f);
      render();
    }
  }
});

/* Поиск по месторождениям прячет строки на месте, без перерисовки: перерисовка
   на каждой букве уносила бы фокус из поля ввода. */
document.addEventListener('input', (e) => {
  if (e.target.id !== 'zq') return;
  form.values.q = e.target.value;
  const q = e.target.value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('.zrow').forEach((row) => {
    const hit = !q || row.dataset.field.toLowerCase().includes(q);
    row.classList.toggle('is-hidden', !hit);
    if (hit) shown++;
  });
  $('#zfound').textContent = zbarInfo(shown);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePopover(); return; }
});

/* ------------------------------ старт ------------------------------ */

render();
