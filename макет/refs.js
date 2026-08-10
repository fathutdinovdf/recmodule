/* Экран «Справочники» — поведение макета.

   Главное на экране — не таблицы, а деление справочников на три класса, потому
   что от класса зависит всё остальное: есть ли кнопки правки, что происходит с
   уже выданными ссылками на значение и кому писать, если значение неверное.

     1. Справочники модуля      — ведём сами, правим прямо здесь.
     2. Системные справочники   — перечисления, за которыми стоят переходы
                                  статусов, права и расчёт норматива; правка
                                  такого списка — правка логики, а не данных.
     3. Данные ВМАП             — источник истины вне модуля, синхронизация
                                  раз в 15 минут, редактировать нечего.

   Класс показывается тегом у названия и объяснён один раз в списке слева, а не
   на каждой строке: иначе экран превращается в стену предупреждений.

   Плашки-предупреждения над таблицами убраны все до единой (решение 85): они
   объясняли не работу со справочником, а историю проектных решений и
   расхождения с Формой 2 — то есть нашу кухню, а не дело пользователя.

   Кнопки нигде не гасятся. Заблокированное действие остаётся кликабельным и по
   нажатию объясняет, почему оно недоступно: серая кнопка сообщает «нельзя», но
   не сообщает «почему», а именно «почему» здесь и спрашивают — про удаление
   используемого значения и про код месторождения.

   Макет живой: значения добавляются, правятся, уходят в архив и возвращаются,
   изменения ложатся в историю справочника. Ничего не сохраняется — перезагрузка
   возвращает исходное состояние. */

const $ = (s, root = document) => root.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');

/* Значения справочников приходят в разметку и в атрибуты, и в текст, поэтому
   экранируем одной функцией оба места — как в card.js и wizard.js. */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Пояснения интерфейса пишутся в коде многострочно, а попадают в разметку,
   где перенос строки виден. Тот же приём, что в card.js. */
const prose = (s) => s.replace(/\s+/g, ' ').trim();

const USER = 'Фатхутдинов Д.Ф.';

function fmtDate(d) { return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDT(d) { return `${fmtDate(d)} ${fmtTime(d)}`; }

/** Русское склонение при числе: 1 значение, 2 значения, 5 значений. */
function plural(n, forms) {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

function agoPhrase(from) {
  const m = Math.round((NOW - from) / 60000);
  if (m <= 0) return 'только что';
  if (m < 60) return `${m} ${plural(m, ['минуту', 'минуты', 'минут'])} назад`;
  const h = Math.round(m / 60);
  return `${h} ${plural(h, ['час', 'часа', 'часов'])} назад`;
}

/* ------------------------------ счётчики использования ------------------------------

   Считаются один раз по DATA, а не задаются вручную: число «сколько
   рекомендаций ссылается на значение» — единственное, на чём держится вся
   логика удаления, и разойтись с реестром оно не имеет права. */

function countBy(fn) {
  const m = new Map();
  for (const rec of DATA) {
    const v = fn(rec);
    if (v === undefined || v === null || v === '') continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}

const USE = {
  direction:    countBy((r) => r.direction),
  action:       countBy((r) => r.action),
  priority:     countBy((r) => r.priority),
  status:       countBy((r) => r.status),
  decision:     countBy((r) => r.decision),
  completeness: countBy((r) => r.completeness),
  field:        countBy((r) => r.field),
  kust:         countBy((r) => r.kust),
  well:         countBy((r) => r.well),
};

/** Использований у значения. Считается по `src` — исходному значению, с которым
    справочник пришёл, а не по текущему названию: переименование значения не
    рвёт связь с рекомендациями, потому что рекомендация ссылается на строку
    справочника, а не на её текст. */
function useOf(spec, item) {
  if (!spec.useKey) return null;
  if (item.src === null || item.src === undefined) return 0;   // значение, заведённое в макете
  return USE[spec.useKey].get(item.src) || 0;
}

/* Сколько рекомендаций с этим приоритетом ещё ждут ответа Заказчика. Нужно в
   форме правки норматива: изменение срока пересчитает контроль ответа именно
   у них, у остальных норматив уже история (SLA_VISIBLE_STATUSES в data.js). */
function openByPriority(code) {
  return DATA.filter((r) => r.priority === code && SLA_VISIBLE_STATUSES.includes(r.status)).length;
}

/* ------------------------------ реплики ВМАП ------------------------------

   Реплика в макете собрана из объектов, встречающихся в тестовом наборе
   рекомендаций, а не из полной выгрузки: в ВМАП по Когалымнефтегазу 7076
   скважин, тащить их в статический файл незачем. Это сказано на экране — иначе
   таблица из 25 скважин читалась бы как «весь фонд». */

const fieldKusts = new Map();   // месторождение → множество кустов
const kustFields = new Map();   // куст → множество месторождений
const wellInfo = new Map();     // скважина → { field, kust }

for (const r of DATA) {
  if (!fieldKusts.has(r.field)) fieldKusts.set(r.field, new Set());
  fieldKusts.get(r.field).add(r.kust);
  if (!kustFields.has(r.kust)) kustFields.set(r.kust, new Set());
  kustFields.get(r.kust).add(r.field);
  if (!wellInfo.has(r.well)) wellInfo.set(r.well, { field: r.field, kust: r.kust });
}

const fieldWells = new Map();
for (const [well, info] of wellInfo) {
  if (!fieldWells.has(info.field)) fieldWells.set(info.field, new Set());
  fieldWells.get(info.field).add(well);
}
const kustWells = new Map();
for (const [well, info] of wellInfo) {
  if (!kustWells.has(info.kust)) kustWells.set(info.kust, new Set());
  kustWells.get(info.kust).add(well);
}

/* Разрезать имя узла на месторождение и цех больше незачем: решение 77 признаёт
   узел дерева самостоятельным месторождением. «Южно-Ягунское / ЦДНГ-2 (Я)» —
   это отдельное месторождение, а не часть чего-то целого, и сводить четыре узла
   в одну строку не требуется. Отсюда убраны splitNode, счётчик узлов и колонка
   «Узлов дерева», которая существовала только чтобы показать проблему. */

/* ------------------------------ синхронизация ------------------------------

   Синхронизация одна на все три реплики: короткий рейс в PostgreSQL ois_vmap
   раз в 15 минут тянет Wells, OrganizationUnits и Parameters разом. Поэтому и
   журнал общий, а не свой у каждой таблицы. */

function floor15(d) {
  const x = new Date(d);
  x.setMinutes(Math.floor(x.getMinutes() / 15) * 15, 0, 0);
  return x;
}

/* Строки журнала фиксированные, а не случайные: макет должен выглядеть
   одинаково при каждом открытии. Обычный рейс не меняет ничего — справочники
   ВМАП живут месяцами; изменения показаны там, где они правдоподобны. */
const SYNC_NOTES = [
  'Изменений нет.',
  'Изменений нет.',
  'Wells: 1 изменение — у скважины 985 изменено поле Name.',
  'Изменений нет.',
  'Изменений нет.',
  'OrganizationUnits: 1 изменение — переименован узел «Западно-Икилорское-обнова».',
  'Изменений нет.',
  'Изменений нет.',
];

const sync = {
  at: floor15(NOW),
  log: SYNC_NOTES.map((text, i) => ({
    at: new Date(floor15(NOW) - i * 15 * 60000),
    manual: false,
    text,
  })),
};

/* Копия списка причин отклонения отсюда убрана: теперь REJECT_REASONS живёт в
   data.js, который подключён к этому экрану. Копия и оригинал делили одну
   глобальную область, и второе объявление const роняло весь refs.js на
   загрузке — экран открывался пустым. */

/* Какой статус наступает после решения Заказчика. Решение — событие, двигающее
   статус, а не отдельное поле (решение 22), поэтому список решений закрыт
   статусной моделью и не может пополняться из интерфейса. */
const DECISION_NEXT = {
  'Принята': 'approved',
  'Отклонена': 'rejected',
  'Требует уточнения': 'clarify',
};

/* Кружок статуса кодирует, чья сторона держит процесс (решение 30). Подпись к
   цвету нужна здесь и только здесь: на этом экране справочник объясняет сам
   себя, в реестре цвет читается без легенды. */
const TONE_LABEL = {
  neutral: 'Исполнитель',
  wait: 'Заказчик',
  work: 'В работе у Заказчика',
  done: 'Есть результат',
  reject: 'Отклонено',
};

/* ------------------------------ колонки ------------------------------ */

const nameCell = (v) => `<span class="cell-name">${esc(v)}</span>`;
const numCell = (v) => `<span class="cell-num">${v}</span>`;

const COL_USE = {
  key: 'use', label: 'Использований', w: 132, right: true,
  val: (it, s) => useOf(s, it) ?? -1,
  render: (it, s) => {
    const n = useOf(s, it);
    if (n === null) {
      return `<span class="mark" title="Отклонения перенесены из Формы 2, где отдельного поля
        «причина» нет — есть только текст обоснования">нет данных</span>`;
    }
    if (!n) return '<span class="mark">0</span>';
    return `<span class="cell-num" title="${n} ${plural(n, ['рекомендация ссылается', 'рекомендации ссылаются', 'рекомендаций ссылаются'])} на это значение">${n}</span>`;
  },
};

const COL_ACT = { key: 'act', label: '', w: 92, render: (it, s) => actCell(it, s) };

/* ------------------------------ справочники ------------------------------ */

/* Названия групп деловые: «наши» и «зашито в модуль» звучали разговорно, а
   экран открывают обе стороны договора (решение 84). */
const GROUPS = [
  {
    key: 'own', title: 'Справочники модуля',
    note: 'Значения правятся, добавляются и уходят в архив; каждое изменение попадает в историю справочника.',
  },
  {
    key: 'fixed', title: 'Системные справочники',
    note: 'За каждым значением стоят переходы статусов, права и расчёт норматива. Меняются вместе с логикой модуля.',
  },
  {
    key: 'replica', title: 'Данные ВМАП',
    note: 'Приходят из ВМАП и обновляются синхронизацией. В модуле не редактируются.',
  },
];

/* У данных ВМАП тег такой же, как у системных: пользователю важно одно — что
   править нельзя. Откуда именно приходит значение, сказано в заголовке группы. */
const CLASS_TAG = {
  own: '<span class="tag tag--accent tag--lg">редактируемый</span>',
  fixed: '<span class="tag tag--default tag--lg">не редактируется</span>',
  replica: '<span class="tag tag--default tag--lg">не редактируется</span>',
};

const SPECS = [
  {
    key: 'directions', group: 'own', nav: 'Направления', title: 'Направления',
    useKey: 'direction',
    desc: `Направление задаёт, к какому виду работ относится рекомендация. Обязательное поле мастера,
      колонка и фильтр реестра, разрез отчётности по договору.`,
    form: { label: 'Название направления', kind: 'line', ph: 'Например: Сопровождение осложненного фонда скважин' },
    addLabel: 'Добавить направление',
    build: () => DIRECTIONS.map((v) => ({ src: v, name: v })),
    cols: [{ key: 'name', label: 'Направление', render: (it) => nameCell(it.name) }, COL_USE, COL_ACT],
    seedLog: [
      { at: new Date('2026-06-12T10:14'), text: 'Добавлено значение «Сопровождение осложненного фонда скважин».' },
      { at: new Date('2026-06-05T15:02'), text: 'Справочник заведён из листа «Справочники» Формы 2 — шесть значений.' },
    ],
  },
  {
    key: 'actions', group: 'own', nav: 'Рекомендуемые мероприятия', title: 'Рекомендуемые мероприятия',
    useKey: 'action',
    desc: `Типовые формулировки, из которых эксперт собирает рекомендацию. Справочник не закрытый:
      в мастере рядом с ним есть «Иное — сформулировать вручную», и текст правится после подстановки.`,
    form: { label: 'Формулировка', kind: 'area', ph: 'Одно предложение, как в реестре' },
    addLabel: 'Добавить формулировку',
    build: () => ACTIONS.map((v) => ({ src: v, name: v })),
    cols: [{ key: 'name', label: 'Формулировка', render: (it) => `<div class="clip">${esc(it.name)}</div>` }, COL_USE, COL_ACT],
    seedLog: [
      { at: new Date('2026-07-21T09:40'), text: 'Добавлено значение «Планирование СКО ГНО с обязательной промывкой».' },
    ],
  },
  {
    key: 'reasons', group: 'own', nav: 'Причины отклонения', title: 'Причины отклонения',
    useKey: null,
    desc: `Причина выбирается Заказчиком в форме отклонения. Обоснование при этом обязательно
      всегда — причина только группирует отказы для отчётности.`,
    form: { label: 'Причина отклонения', kind: 'line', ph: 'Короткая формулировка' },
    addLabel: 'Добавить причину',
    build: () => REJECT_REASONS.map((v) => ({ src: v, name: v })),
    cols: [{ key: 'name', label: 'Причина', render: (it) => nameCell(it.name) }, COL_USE, COL_ACT],
    seedLog: [
      { at: new Date('2026-08-05T18:20'), text: 'Справочник заведён при разработке формы решения — шесть значений.' },
    ],
  },
  {
    key: 'priorities', group: 'own', nav: 'Приоритеты и нормативы', title: 'Приоритеты и нормативы ответа',
    useKey: 'priority', rowActs: ['edit'],
    desc: `Приоритет задаёт норматив ответа Заказчика. Норматив считается рабочими часами от передачи,
      рабочее окно — пн–пт 09:00–24:00 по Когалыму.`,
    /* Норматив редактируется — это решение 80. Плашка осталась, но говорит не о
       расхождении с договором (оно живёт в документах проекта, а не на экране),
       а о последствии правки: сроки уже согласованы, и менять их в одностороннем
       порядке нельзя. Это операционное предупреждение, оно человеку нужно. */
    build: () => PRIORITIES.map((p) => ({ src: p.code, code: p.code, name: p.label, sla: p.sla })),
    cols: [
      { key: 'code', label: 'Приоритет', w: 104, render: (it) => `<span class="prio prio--${it.code}">${it.code}</span>` },
      { key: 'name', label: 'Название', render: (it) => nameCell(it.name) },
      {
        key: 'sla', label: 'Норматив ответа', w: 176,
        render: (it) => `${numCell(it.sla)} ч <span class="mark">рабочих</span>`,
      },
      COL_USE, COL_ACT,
    ],
    seedLog: [
      {
        at: new Date('2026-07-03T11:26'),
        text: 'Нормативы ответа установлены: 4 / 8 / 24 рабочих часа для приоритетов I / II / III.',
      },
    ],
  },

  /* Пороги, по которым модуль решает, что пора тревожить человека. Раньше 21
     сутки и 7 суток были константами в коде инбокса — то есть числа, которые
     подбираются по ходу работы, менялись только релизом (решение 81).
     Горизонт окна лежит рядом и не редактируется: видно, что настраивается,
     а что установлено договором. */
  {
    key: 'params', group: 'own', nav: 'Параметры модуля', title: 'Параметры модуля',
    useKey: null, rowActs: ['edit'],
    desc: `Сроки, по которым модуль поднимает тревогу. Норматив ответа Заказчика сюда не входит —
      он привязан к приоритету и живёт в справочнике «Приоритеты и нормативы».`,
    build: () => MODULE_PARAMS.map((p) => ({
      src: p.key, pkey: p.key, name: p.name, value: p.value,
      unit: p.unit, hint: p.hint, fixed: !!p.fixed,
    })),
    cols: [
      { key: 'name', label: 'Параметр', render: (it) => nameCell(it.name) },
      {
        key: 'value', label: 'Значение', w: 150, right: true,
        render: (it) => `${numCell(it.value)} <span class="mark">${esc(it.unit)}</span>`,
      },
      {
        key: 'hint', label: 'На что влияет',
        render: (it) => `<div class="clip">${esc(it.hint)}</div>`,
      },
      {
        key: 'act', label: '', w: 52,
        /* У зафиксированного договором параметра действия нет вовсе: кнопка,
           которая всегда отвечает «нельзя», раздражает сильнее, чем её отсутствие. */
        render: (it, s) => (it.fixed ? '' : actCell(it, s)),
      },
    ],
    seedLog: [
      { at: new Date('2026-07-15T14:05'), text: 'Порог «согласовано, работ нет» установлен — 21 сутки.' },
    ],
  },

  {
    key: 'statuses', group: 'fixed', nav: 'Статусы', title: 'Статусы рекомендации',
    useKey: 'status',
    desc: `Десять статусов. За каждым стоят разрешённые переходы, права роли и то, показывается ли
      норматив ответа, — поэтому статус нельзя ни добавить, ни переименовать из интерфейса.`,
    build: () => STATUSES.map((s, i) => {
      const [tone, filled] = STATUS_TONE[s.key] || ['neutral', false];
      const tile = TILES.find((t) => t.statuses.includes(s.key));
      return { src: s.key, n: i + 1, name: s.label, tone, filled, tile: tile ? tile.label : '—' };
    }),
    cols: [
      { key: 'n', label: '№', w: 56, render: (it) => `<span class="mark">${it.n}</span>` },
      {
        key: 'name', label: 'Статус',
        render: (it) => `<span class="status"><i class="status__d status__d--${it.tone} ${it.filled ? '' : 'is-hollow'}"></i>${esc(it.name)}</span>`,
      },
      {
        key: 'tone', label: 'Кружок статуса', w: 190,
        render: (it) => `<span class="mark">${TONE_LABEL[it.tone]}${it.filled ? '' : ', шаг не закрыт'}</span>`,
      },
      { key: 'tile', label: 'Плитка реестра', w: 150, render: (it) => esc(it.tile) },
      COL_USE,
    ],
  },
  {
    key: 'decisions', group: 'fixed', nav: 'Решения Заказчика', title: 'Решения Заказчика',
    useKey: 'decision',
    desc: `Решение — событие, которое двигает статус, а не отдельное поле рекомендации. Поэтому список
      закрыт статусной моделью: новое решение означало бы новый переход.`,
    build: () => DECISIONS.map((v) => ({
      src: v, name: v,
      next: (STATUSES.find((s) => s.key === DECISION_NEXT[v]) || {}).label || '—',
    })),
    cols: [
      { key: 'name', label: 'Решение', w: 220, render: (it) => nameCell(it.name) },
      { key: 'next', label: 'Переводит в статус', render: (it) => esc(it.next) },
      COL_USE,
    ],
  },
  {
    key: 'completeness', group: 'fixed', nav: 'Полнота реализации', title: 'Полнота реализации',
    useKey: 'completeness',
    desc: `Полнота реализации — поле рекомендации: она нужна в отчётности и после того, как
      рекомендация ушла в окно подтверждения эффекта.`,
    build: () => Object.entries(COMPLETENESS).map(([k, v]) => ({
      src: k, name: v,
      note: k === 'partial'
        ? 'Требует обязательного пояснения в форме фиксации; в шапке карточки показывается пилюлей.'
        : 'Значение по умолчанию в форме фиксации реализации.',
    })),
    cols: [
      { key: 'name', label: 'Значение', w: 180, render: (it) => nameCell(it.name) },
      { key: 'note', label: 'Где влияет', render: (it) => `<div class="clip">${esc(it.note)}</div>` },
      COL_USE,
    ],
  },

  {
    key: 'fields', group: 'replica', nav: 'Месторождения', title: 'Месторождения',
    useKey: 'field', replica: true,
    src: 'ois_vmap."OrganizationUnits", OrganizationUnitType = 3',
    /* Кусты и скважины считаются по выгрузке ВМАП, а не по тестовому набору
       рекомендаций: раньше здесь стояли числа вида «2 куста», хотя на
       месторождении их полторы сотни, и таблица врала про масштаб фонда. */
    build: () => FIELDS.map((f) => ({
      src: f, name: f,
      code: FIELD_CODE[f] || '',
      kusts: FIELD_STATS[f].kusts,
      wells: FIELD_STATS[f].wells,
    })),
    cols: [
      {
        key: 'name', label: 'Месторождение',
        render: (it) => `<div class="clip1" title="${esc(it.name)}">${esc(it.name)}</div>`,
      },
      {
        key: 'code', label: 'Код номера', w: 116,
        render: (it, s) => {
          const locked = useOf(s, it) > 0;
          const lock = locked
            ? `<svg class="lockic ic12"><use href="#i-lock"/></svg>`
            : '';
          return `<span class="cell-code">${esc(it.code) || '<span class="mark">не задан</span>'}</span>${lock}`;
        },
      },
      { key: 'kusts', label: 'Кустов', w: 84, right: true, render: (it) => numCell(it.kusts) },
      { key: 'wells', label: 'Скважин', w: 88, right: true, render: (it) => numCell(it.wells) },
      COL_USE,
      { key: 'act', label: '', w: 52, render: (it, s) => actCell(it, s) },
    ],
  },

];

const SPEC = Object.fromEntries(SPECS.map((s) => [s.key, s]));

/* ------------------------------ состояние ------------------------------ */

/* Состояние справочника заводится при первом открытии: items — рабочая копия
   значений (в неё пишет правка), log — история изменений. Ничего не
   сохраняется: перезагрузка возвращает исходный состав. */
const store = {};

function refState(key) {
  if (!store[key]) {
    const s = SPEC[key];
    store[key] = {
      items: (s.build ? s.build() : []).map((it, i) => ({ id: `${key}-${i}`, archived: false, ...it })),
      log: (s.seedLog || []).map((e) => ({ who: USER, ...e })),
      ui: { sort: null, filters: {}, showArchived: false },
    };
  }
  return store[key];
}

let current = 'directions';
let view = 'values';     // values | log
let form = null;         // { key, id, mode, values } — раскрытая форма правки
let formErr = '';
let newSeq = 0;

/* ------------------------------ отбор и сортировка ------------------------------ */

function colVal(col, it, s) {
  if (col.val) return col.val(it, s);
  return it[col.key];
}

function visibleRows(s) {
  const st = refState(s.key);
  let rows = st.items.filter((it) => st.ui.showArchived || !it.archived);

  for (const [ck, set] of Object.entries(st.ui.filters)) {
    if (!set || !set.size) continue;
    const col = s.cols.find((c) => c.key === ck);
    rows = rows.filter((it) => set.has(String(colVal(col, it, s) ?? '')));
  }

  const sort = st.ui.sort;
  const sortCol = sort && s.cols.find((c) => c.key === sort.key);
  if (sortCol) {
    const col = sortCol;
    const k = sort.dir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const va = colVal(col, a, s); const vb = colVal(col, b, s);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * k;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'ru', { numeric: true }) * k;
    });
  }
  return rows;
}

/* ------------------------------ отрисовка: навигация ------------------------------ */

function renderNav() {
  const html = GROUPS.map((g) => {
    const items = SPECS.filter((s) => s.group === g.key);
    if (!items.length) return '';
    return `<div class="reflist__section">${g.title}</div>
      ${g.note ? `<div class="reflist__note">${prose(g.note)}</div>` : ''}
      ${items.map((s) => {
        const n = s.stub ? null : refState(s.key).items.filter((it) => !it.archived).length;
        return `<a class="navitem ${s.key === current ? 'is-active' : ''}" data-ref="${s.key}">
          <span class="navitem__label">${s.nav}</span>
          ${n === null ? '' : `<span class="badge">${n}</span>`}</a>`;
      }).join('')}`;
  }).join('');
  $('#reflist').innerHTML = html;
}

/* ------------------------------ отрисовка: шапка ------------------------------ */

function headMeta(s) {
  if (s.stub) return '';
  const st = refState(s.key);
  const n = st.items.filter((it) => !it.archived).length;
  const arch = st.items.filter((it) => it.archived).length;

  if (s.replica) {
    const next = new Date(sync.at.getTime() + 15 * 60000);
    return `<div class="refhead__meta">
      <span><b>${n}</b> ${plural(n, ['значение', 'значения', 'значений'])}</span>
      ${/* Имя схемы и таблицы («ois_vmap."OrganizationUnits", OrganizationUnitType = 3»)
            с экрана убрано: пользователю справочника нужно знать, что данные из ВМАП
            и когда они обновлялись, а не как называется таблица. В коде поле src
            оставлено — оно понадобится при переносе в React. */''}
      <span>Источник: <b>ВМАП</b></span>
      <span>Синхронизация: <b>${fmtTime(sync.at)}</b>, ${agoPhrase(sync.at)} · следующая в ${fmtTime(next)}</span>
    </div>`;
  }
  const used = st.items.filter((it) => !it.archived && (useOf(s, it) || 0) > 0).length;
  return `<div class="refhead__meta">
    <span><b>${n}</b> ${plural(n, ['значение', 'значения', 'значений'])}</span>
    ${arch ? `<span><b>${arch}</b> в архиве</span>` : ''}
    ${s.useKey ? `<span>Используется в рекомендациях: <b>${used}</b> из ${n}</span>` : ''}
    ${s.group === 'own' ? `<span>Изменений в истории: <b>${st.log.length}</b></span>` : ''}
  </div>`;
}

function renderHead() {
  const s = SPEC[current];
  const hasLog = !s.stub && (s.group === 'own' || s.replica);
  const logLabel = s.replica ? 'Журнал синхронизации' : 'История изменений';

  $('#refhead').innerHTML = `
    <div class="refhead__top">
      <h2 class="refhead__t">${s.title}</h2>
      ${CLASS_TAG[s.group]}
      <div class="refhead__act">
        ${hasLog ? `<div class="seg">
          <button class="seg__b ${view === 'values' ? 'is-on' : ''}" data-view="values">Значения</button>
          <button class="seg__b ${view === 'log' ? 'is-on' : ''}" data-view="log">${logLabel}</button>
        </div>` : ''}
        ${s.replica ? `<button class="btn" data-act="sync"><svg class="ic16"><use href="#i-sync"/></svg>Синхронизировать сейчас</button>` : ''}
        ${s.group === 'own' && s.addLabel && view === 'values'
          ? `<button class="btn btn--accent" data-act="add"><svg class="ic16"><use href="#i-plus"/></svg>${s.addLabel}</button>` : ''}
      </div>
    </div>
    ${s.desc ? `<div class="refhead__desc">${prose(s.desc)}</div>` : ''}
    ${headMeta(s)}`;
}

/* ------------------------------ отрисовка: пояснение ------------------------------ */

function renderNotice() {
  const s = SPEC[current];
  const box = $('#refnotice');
  const n = s.notice;
  if (!n || view !== 'values') { box.hidden = true; return; }

  box.hidden = false;
  box.className = `refnotice ${n.kind === 'info' ? 'refnotice--info' : ''}`;
  box.innerHTML = `
    <div class="refnotice__h">
      <svg class="ic16"><use href="#i-info"/></svg>${n.h}
    </div>
    <div class="refnotice__t">${prose(n.t)}</div>`;
}

/* ------------------------------ отрисовка: форма ------------------------------ */

function errLine() { return formErr ? `<div class="form__err">${formErr}</div>` : ''; }

function formHtml() {
  const s = SPEC[form.key];
  const v = form.values;

  if (form.kind === 'code') {
    return `<div class="form">
      <div class="form__h">Код месторождения для номера рекомендации</div>
      <div class="form__row">
        <label class="form__f" style="flex:0 0 160px"><span class="form__l">Код</span>
          <input class="inp inp--num" id="fCode" maxlength="4" value="${esc(v.code)}" placeholder="ЮЯ1"></label>
        <div class="form__f"><span class="form__l">Узел</span>
          <div class="form__hint">${esc(v.name)}</div></div>
      </div>
      <div class="form__hint">Код войдёт в номера новых рекомендаций по этому узлу:
        <b>${esc(v.code || 'ХХ')}-26-0001</b>. Код свой у каждого месторождения — общий код на
        четыре Южно-Ягунских давал бы одинаковые номера разным объектам.</div>
      ${errLine()}
      <div class="form__btns">
        <button class="btn btn--accent" data-act="save">Сохранить</button>
        <button class="btn" data-act="cancel">Отмена</button>
      </div>
    </div>`;
  }

  if (form.kind === 'param') {
    return `<div class="form">
      <div class="form__h">${esc(form.item.name)}</div>
      <label class="form__f" style="max-width:240px">
        <span class="form__l">Значение, ${esc(form.item.unit)}</span>
        <input class="inp inp--num" id="fValue" type="number" min="1" max="365" value="${esc(v.value)}"></label>
      <div class="form__hint">${prose(form.item.hint)}</div>
      <div class="form__hint">Изменение действует сразу и на уже идущие рекомендации: параметр
        не хранится в рекомендации, он применяется при отборе.</div>
      ${errLine()}
      <div class="form__btns">
        <button class="btn btn--accent" data-act="save">Сохранить</button>
        <button class="btn" data-act="cancel">Отмена</button>
      </div>
    </div>`;
  }

  if (form.kind === 'priority') {
    const open = openByPriority(v.code);
    return `<div class="form">
      <div class="form__h">Приоритет ${esc(v.code)} — норматив ответа</div>
      <div class="form__row">
        <label class="form__f"><span class="form__l">Название</span>
          <input class="inp" id="fName" value="${esc(v.name)}"></label>
        <label class="form__f" style="flex:0 0 200px">
          <span class="form__l">Норматив ответа, рабочих часов</span>
          <input class="inp inp--num" id="fSla" type="number" min="1" max="99" value="${esc(v.sla)}"></label>
      </div>
      <div class="form__hint">Норматив считается рабочими часами от передачи Заказчику: пн–пт
        09:00–24:00 по Когалыму. Изменение немедленно пересчитает контроль ответа у
        <b>${open}</b> ${plural(open, ['рекомендации', 'рекомендаций', 'рекомендаций'])},
        по которым ответ ещё не получен; у остальных норматив уже история и не пересчитывается.</div>
      <div class="form__hint">Сроки согласованы обеими сторонами: правка меняет договорённость,
        а не только настройку модуля.</div>
      ${errLine()}
      <div class="form__btns">
        <button class="btn btn--accent" data-act="save">Сохранить</button>
        <button class="btn" data-act="cancel">Отмена</button>
      </div>
    </div>`;
  }

  const f = s.form;
  const input = f.kind === 'area'
    ? `<textarea class="inp inp--area" id="fName" rows="3" placeholder="${esc(f.ph)}">${esc(v.name)}</textarea>`
    : `<input class="inp" id="fName" value="${esc(v.name)}" placeholder="${esc(f.ph)}">`;

  return `<div class="form">
    <div class="form__h">${form.mode === 'add' ? 'Новое значение' : 'Правка значения'}</div>
    <label class="form__f"><span class="form__l">${f.label}</span>${input}</label>
    ${form.mode === 'edit' && (useOf(s, form.item) || 0) > 0
      ? `<div class="form__hint">Значение используется в
         <b>${useOf(s, form.item)}</b> ${plural(useOf(s, form.item), ['рекомендации', 'рекомендациях', 'рекомендациях'])}.
         Переименование их не тронет: рекомендация ссылается на строку справочника, а не на её текст, —
         но новое название встанет во всех карточках и в реестре сразу.</div>`
      : ''}
    ${errLine()}
    <div class="form__btns">
      <button class="btn btn--accent" data-act="save">Сохранить</button>
      <button class="btn" data-act="cancel">Отмена</button>
    </div>
  </div>`;
}

function renderForm() {
  const box = $('#refform');
  if (!form || form.key !== current || view !== 'values') { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = formHtml();
}

/* ------------------------------ отрисовка: таблица ------------------------------ */

/* Кнопки строки. Ни одна не гасится: заблокированное действие объясняет себя
   по нажатию — именно «почему нельзя» здесь и спрашивают. */
function actCell(it, s) {
  if (s.replica) {
    return `<div class="rowact">
      <button class="iconbtn iconbtn--xs" data-row="${it.id}" data-act="code"
        title="Код месторождения для номера рекомендации"><svg class="ic12"><use href="#i-pencil"/></svg></button>
    </div>`;
  }
  if (s.group !== 'own') return '';
  /* У приоритетов доступна только правка: сам список из трёх уровней закрыт
     статусной моделью и Формой 2 — редактируется норматив, а не состав. */
  const only = s.rowActs;
  return `<div class="rowact">
    <button class="iconbtn iconbtn--xs" data-row="${it.id}" data-act="edit"
      title="Изменить"><svg class="ic12"><use href="#i-pencil"/></svg></button>
    ${only ? '' : it.archived
      ? `<button class="iconbtn iconbtn--xs" data-row="${it.id}" data-act="restore"
          title="Вернуть из архива"><svg class="ic12"><use href="#i-restore"/></svg></button>`
      : `<button class="iconbtn iconbtn--xs" data-row="${it.id}" data-act="archive"
          title="Убрать из выбора — в архив"><svg class="ic12"><use href="#i-archive"/></svg></button>`}
    ${only ? '' : `<button class="iconbtn iconbtn--xs" data-row="${it.id}" data-act="del"
      title="Удалить"><svg class="ic12"><use href="#i-trash"/></svg></button>`}
  </div>`;
}

function renderTable() {
  const s = SPEC[current];
  const st = refState(s.key);
  const rows = visibleRows(s);

  /* Таблица занимает всю ширину панели: колонок мало, и горизонтальная прокрутка
     реестра здесь была бы лишней. Ширины заданы всем колонкам, кроме одной
     смысловой — она забирает остаток. */
  $('#tbl').style.width = '100%';
  $('#cg').innerHTML = s.cols.map((c) =>
    `<col${c.w ? ` style="width:${c.w}px"` : ''}>`).join('');

  $('#thead').innerHTML = '<tr>' + s.cols.map((c) => {
    const sort = st.ui.sort;
    const on = sort && sort.key === c.key;
    const filterOn = st.ui.filters[c.key] && st.ui.filters[c.key].size;
    if (!c.label) return '<th></th>';
    return `<th class="${c.right ? 'th--right' : ''}">
      <span class="th">
        <span class="th__t ${on ? 'is-sorted' : ''}" data-sort="${c.key}" title="${c.label} — сортировать">
          <span class="th__label">${c.label}</span>
          ${on ? `<svg class="ic-th th__arrow ${sort.dir === 'asc' ? 'is-asc' : ''}"><use href="#i-sort"/></svg>` : ''}
        </span>
        ${c.filter ? `<span class="th__i ${filterOn ? 'is-on' : ''}" data-filter="${c.key}"
          title="Фильтр"><svg class="ic-th"><use href="#i-funnel"/></svg></span>` : ''}
      </span></th>`;
  }).join('') + '</tr>';

  if (!rows.length) {
    $('#tbody').innerHTML = `<tr><td colspan="${s.cols.length}" class="empty">
      Ничего не найдено. Снимите фильтр.</td></tr>`;
    return;
  }

  $('#tbody').innerHTML = rows.map((it) => `
    <tr class="${it.archived ? 'row-muted' : ''}">${s.cols.map((c) => `
      <td class="${c.right ? 'cell-use' : ''}">${c.render(it, s)}${
        c.key === 'name' && it.archived ? ' <span class="tag tag--default">в архиве</span>' : ''}</td>`).join('')}
    </tr>`).join('');
}

/* ------------------------------ отрисовка: история ------------------------------ */

function renderLog() {
  const s = SPEC[current];
  const entries = s.replica
    ? sync.log.map((e) => ({
      at: e.at, who: e.manual ? `${USER} — вручную` : 'Синхронизация с ВМАП', text: e.text,
    }))
    : [...refState(s.key).log].sort((a, b) => b.at - a.at);

  $('#logwrap').innerHTML = entries.length
    ? `<div class="log">${entries.map((e) => `
        <div class="log__i">
          <div class="log__at">${fmtDT(e.at)}</div>
          <div class="log__b">
            <div class="log__who">${esc(e.who)}</div>
            <div class="log__t">${esc(e.text)}</div>
          </div>
        </div>`).join('')}</div>`
    : '<div class="empty">Записей нет.</div>';
}

/* ------------------------------ отрисовка: подвал ------------------------------ */

function renderPager() {
  const s = SPEC[current];
  const box = $('#pager');
  if (s.stub || view === 'log') { box.hidden = true; return; }
  box.hidden = false;

  const st = refState(s.key);
  const rows = visibleRows(s);
  const total = st.items.filter((it) => !it.archived).length;
  const arch = st.items.filter((it) => it.archived).length;
  const anyFilter = Object.values(st.ui.filters).some((x) => x && x.size);

  const info = anyFilter
    ? `${rows.length} из ${total} ${plural(total, ['значения', 'значений', 'значений'])}`
    : `${total} ${plural(total, ['значение', 'значения', 'значений'])}`;

  box.innerHTML = `
    <div class="pager__info">${info}</div>
    ${anyFilter ? '<button class="btn btn--ghost btn--small" data-act="resetFilters">Сбросить фильтры</button>' : ''}
    ${s.group === 'own' && !s.rowActs ? `<label class="pager__sw">
      <input type="checkbox" id="swArch" ${st.ui.showArchived ? 'checked' : ''}>
      Показывать архивные${arch ? ` (${arch})` : ''}</label>` : ''}`;
}

/* ------------------------------ отрисовка: заглушка ------------------------------ */

function renderStub() {
  const s = SPEC[current];
  const box = $('#refstub');
  if (!s.stub) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h3>${s.stub.h}</h3>
    ${s.stub.p.map((p) => `<p>${prose(p)}</p>`).join('')}
    <button class="btn">Перейти в «Пользователи и роли»</button>`;
}

/* ------------------------------ общая отрисовка ------------------------------ */

function render() {
  const s = SPEC[current];
  renderNav();
  renderHead();
  renderNotice();
  renderForm();
  renderStub();

  const showTable = !s.stub && view === 'values';
  $('#tablewrap').hidden = !showTable;
  $('#logwrap').hidden = s.stub || view !== 'log';

  if (showTable) renderTable();
  if (!s.stub && view === 'log') renderLog();
  renderPager();

  /* Выгрузка нужна не «на всякий случай»: отступления от договора по статусам и
     нормативам согласуются составом значений, и приложением к протоколу
     согласования форм идут именно справочники (решения 6, 60, 64). */
  $('#headActions').innerHTML = `
    <button class="btn" title="${prose(`Все справочники модуля одним файлом — приложение
      к протоколу согласования форм`)}">
      <svg class="ic16"><use href="#i-export"/></svg>Выгрузка для протокола</button>`;
}

/* ------------------------------ история ------------------------------ */

function log(key, text) {
  refState(key).log.push({ at: NOW, who: USER, text });
}

/* ------------------------------ действия над значениями ------------------------------ */

function openForm(key, id, kind) {
  const s = SPEC[key];
  const st = refState(key);
  const item = id ? st.items.find((it) => it.id === id) : null;
  formErr = '';

  if (kind === 'code') {
    form = { key, id, mode: 'edit', kind: 'code', item, values: { code: item.code, name: item.name } };
  } else if (s.key === 'params') {
    form = { key, id, mode: 'edit', kind: 'param', item, values: { value: item.value } };
  } else if (s.key === 'priorities') {
    form = { key, id, mode: 'edit', kind: 'priority', item, values: { code: item.code, name: item.name, sla: item.sla } };
  } else if (item) {
    form = { key, id, mode: 'edit', kind: 'text', item, values: { name: item.name } };
  } else {
    form = { key, id: null, mode: 'add', kind: 'text', item: null, values: { name: '' } };
  }
  render();
  const el = $('#fName') || $('#fCode');
  if (el) el.focus();
}

function readForm() {
  if (form.kind === 'code') { form.values.code = $('#fCode').value.trim().toUpperCase(); return; }
  if (form.kind === 'param') { form.values.value = $('#fValue').value.trim(); return; }
  if (form.kind === 'priority') {
    form.values.name = $('#fName').value.trim();
    form.values.sla = $('#fSla').value.trim();
    return;
  }
  form.values.name = $('#fName').value.trim();
}

function saveForm() {
  const key = form.key;
  const s = SPEC[key];
  const st = refState(key);
  readForm();
  const v = form.values;

  if (form.kind === 'code') {
    if (!/^[А-ЯЁA-Z0-9]{2,4}$/.test(v.code)) {
      formErr = 'Код — от двух до четырёх заглавных букв или цифр: он читается внутри номера рекомендации.';
      render(); return;
    }
    const busy = st.items.find((it) => it.id !== form.id && it.code === v.code);
    if (busy) {
      formErr = `Код «${v.code}» уже занят узлом «${busy.name}». Номера двух объектов совпадать не могут.`;
      render(); return;
    }
    const item = st.items.find((it) => it.id === form.id);
    const was = item.code;
    item.code = v.code;
    log(key, `Узел «${item.name}»: код номера ${was ? `изменён с ${was} на ${v.code}` : `задан — ${v.code}`}.`);
    form = null; render(); return;
  }

  if (form.kind === 'param') {
    const n = Number(v.value);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      formErr = 'Значение — целое число суток от 1 до 365.';
      render(); return;
    }
    const item = st.items.find((it) => it.id === form.id);
    if (item.value !== n) {
      log(key, `«${item.name}»: ${item.value} → ${n} ${item.unit}.`);
      item.value = n;
      /* Правим и сам MODULE_PARAMS: инбокс читает параметр через param(), и без
         этого экран справочников показывал бы одно, а инбокс считал по другому. */
      const src = MODULE_PARAMS.find((p) => p.key === item.pkey);
      if (src) src.value = n;
    }
    form = null; render(); return;
  }

  if (form.kind === 'priority') {
    const sla = Number(v.sla);
    if (!v.name) { formErr = 'Название приоритета не заполнено.'; render(); return; }
    if (!Number.isFinite(sla) || sla < 1 || sla > 99) {
      formErr = 'Норматив ответа — целое число рабочих часов от 1 до 99.';
      render(); return;
    }
    const item = st.items.find((it) => it.id === form.id);
    const parts = [];
    if (item.name !== v.name) parts.push(`название «${item.name}» → «${v.name}»`);
    if (item.sla !== sla) parts.push(`норматив ответа ${item.sla} → ${sla} рабочих часов`);
    item.name = v.name; item.sla = sla;
    if (parts.length) {
      log(key, `Приоритет ${item.code}: ${parts.join('; ')}. Требует внесения в протокол согласования форм.`);
    }
    form = null; render(); return;
  }

  if (!v.name) { formErr = 'Значение не заполнено.'; render(); return; }
  const dup = st.items.find((it) => it.id !== form.id && it.name.toLowerCase() === v.name.toLowerCase());
  if (dup) {
    formErr = dup.archived
      ? 'Такое значение уже есть, оно в архиве. Верните его из архива, а не заводите второе: иначе в отчётности будут две строки об одном и том же.'
      : 'Такое значение в справочнике уже есть.';
    render(); return;
  }

  if (form.mode === 'add') {
    /* У заведённого в макете значения нет `src`: считать использования не по
       чему, и это правда — на новое значение ещё никто не сослался. */
    st.items.push({ id: `${key}-new-${newSeq++}`, src: null, name: v.name, archived: false });
    log(key, `Добавлено значение «${v.name}».`);
  } else {
    const item = st.items.find((it) => it.id === form.id);
    if (item.name !== v.name) log(key, `Значение «${item.name}» переименовано в «${v.name}».`);
    item.name = v.name;
  }
  form = null; render();
}

function archiveItem(key, id) {
  const st = refState(key);
  const item = st.items.find((it) => it.id === id);
  item.archived = true;
  log(key, `Значение «${item.name}» убрано из выбора (архив).`);
  if (form && form.id === id) form = null;
  render();
}

function restoreItem(key, id) {
  const st = refState(key);
  const item = st.items.find((it) => it.id === id);
  item.archived = false;
  log(key, `Значение «${item.name}» возвращено из архива.`);
  render();
}

function deleteItem(key, id) {
  const st = refState(key);
  const item = st.items.find((it) => it.id === id);
  st.items = st.items.filter((it) => it.id !== id);
  log(key, `Значение «${item.name}» удалено: ни одна рекомендация на него не ссылалась.`);
  if (form && form.id === id) form = null;
  render();
}

/* ------------------------------ поповеры ------------------------------ */

function closePopover() { $('#popover').hidden = true; }

function openPopover(anchor, html, onMount) {
  const p = $('#popover');
  p.innerHTML = html;
  p.hidden = false;
  const r = anchor.getBoundingClientRect();
  p.style.left = Math.max(8, Math.min(r.left - 160, window.innerWidth - p.offsetWidth - 12)) + 'px';
  p.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - p.offsetHeight - 12)) + 'px';
  if (onMount) onMount(p);
}

/* Попытка удалить используемое значение — главный вопрос любого справочника,
   поэтому она не молчит и не гасит кнопку. Правило простое:

     значение, на которое никто не ссылается, удаляется совсем;
     значение, уже попавшее в рекомендации, не удаляется никогда — только
     уходит из выбора в архив.

   Причина именно такая: рекомендации живут годами, по ним считается эффект и
   идут акты, а удалённое направление превратило бы полсотни карточек в записи
   с пустым полем — и ни отчёт по договору, ни разбирательство по разделу 10
   после этого не собрать. Подмена на «прочее» ещё хуже: она молча искажает
   историю. Архив закрывает обе задачи — в новых рекомендациях значения нет,
   в старых оно на месте. */
function askDelete(anchor, key, id) {
  const s = SPEC[key];
  const st = refState(key);
  const item = st.items.find((it) => it.id === id);
  const n = useOf(s, item);

  if (n === null) {
    openPopover(anchor, `<div class="confirm">
      <div class="confirm__h">Удалить нельзя</div>
      <div class="confirm__t">${prose(`Счётчик использования по этому справочнику недоступен, а удалять
        значение, не зная, ссылается ли на него хоть одна рекомендация, нельзя. Доступен архив:
        значение уйдёт из формы отклонения, но останется в уже принятых решениях.`)}</div>
      <div class="popover__foot">
        <button class="btn" data-act="doArchive" data-row="${id}">Убрать в архив</button>
        <button class="btn btn--ghost" data-act="closePop">Отмена</button></div>
    </div>`);
    return;
  }

  if (n === 0) {
    openPopover(anchor, `<div class="confirm">
      <div class="confirm__h">Удалить «${esc(item.name)}»?</div>
      <div class="confirm__t">Ни одна рекомендация на это значение не ссылается — удаление
        безопасно и попадёт в историю справочника.</div>
      <div class="popover__foot">
        <button class="btn btn--no" data-act="doDelete" data-row="${id}">Удалить</button>
        <button class="btn btn--ghost" data-act="closePop">Отмена</button></div>
    </div>`);
    return;
  }

  openPopover(anchor, `<div class="confirm">
    <div class="confirm__h">Удалить нельзя: значение используется</div>
    <div class="confirm__t">${prose(`На значение «${esc(item.name)}» ссылается ${n}
      ${plural(n, ['рекомендация', 'рекомендации', 'рекомендаций'])}. Удаление оставило бы их с пустым
      полем — вместе с теми, по которым уже считается эффект и подписаны акты.`)}</div>
    <div class="confirm__t">${prose(`Вместо удаления значение убирается в архив: в мастере и в форме
      решения оно больше не предлагается, а в старых рекомендациях, в реестре и в фильтрах остаётся
      на месте. Вернуть из архива можно в любой момент.`)}</div>
    <div class="popover__foot">
      <button class="btn" data-act="doArchive" data-row="${id}">Убрать в архив</button>
      <button class="btn btn--ghost" data-act="closePop">Отмена</button></div>
  </div>`);
}

/* Код месторождения — единственный наш атрибут на реплике ВМАП: сам узел
   приходит из базы, а код для номера рекомендации живёт в нашей таблице.
   Поэтому он и правится — но только пока по узлу не выдан ни один номер:
   выданные номера не перевыпускаются, и смена кода разорвала бы связь номера
   с объектом. */
function askCode(anchor, key, id) {
  const s = SPEC[key];
  const item = refState(key).items.find((it) => it.id === id);
  const n = useOf(s, item);
  if (!n) { openForm(key, id, 'code'); return; }

  openPopover(anchor, `<div class="confirm">
    <div class="confirm__h">Код изменить нельзя</div>
    <div class="confirm__t">${prose(`Код «${esc(item.code)}» уже стоит в номерах ${n}
      ${plural(n, ['рекомендации', 'рекомендаций', 'рекомендаций'])} — ${esc(item.code)}-26-0001 и далее.
      Выданные номера не перевыпускаются: номер читается как адрес объекта и живёт в переписке,
      в актах и в выгрузках Формы 2.`)}</div>
    <div class="confirm__t">${prose(`Код правится только у узла, по которому ещё не выдано ни одного
      номера, — например, у нового месторождения, приехавшего очередной синхронизацией.`)}</div>
    <div class="popover__foot">
      <button class="btn btn--ghost" data-act="closePop">Понятно</button></div>
  </div>`);
}

function openFilterPopover(anchor, colKey) {
  const s = SPEC[current];
  const st = refState(s.key);
  const col = s.cols.find((c) => c.key === colKey);

  const counts = new Map();
  for (const it of st.items) {
    const v = String(colVal(col, it, s) ?? '');
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const values = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  const cur = st.ui.filters[colKey] || new Set();

  openPopover(anchor, `
    <label class="field"><svg class="ic16 field__icon"><use href="#i-search"/></svg>
      <input type="search" id="pfq" placeholder="Поиск…"></label>
    <div class="popover__list">
      ${values.map((v) => `<label class="popover__row" data-v="${esc(v)}">
        <input type="checkbox" ${cur.has(v) ? 'checked' : ''}>
        <span>${esc(v) || '—'}</span><small>${counts.get(v)}</small></label>`).join('')}
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
      if (set.size) st.ui.filters[colKey] = set; else delete st.ui.filters[colKey];
      closePopover(); render();
    });
    p.querySelector('#pfReset').addEventListener('click', () => {
      delete st.ui.filters[colKey];
      closePopover(); render();
    });
  });
}

/* ------------------------------ события ------------------------------ */

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-ref]');
  if (nav) {
    current = nav.dataset.ref;
    view = 'values'; form = null; formErr = '';
    closePopover(); render(); return;
  }

  const seg = e.target.closest('[data-view]');
  if (seg) { view = seg.dataset.view; closePopover(); render(); return; }

  const sort = e.target.closest('[data-sort]');
  if (sort) {
    /* Три такта, как в реестре: включить → сменить направление → выключить. */
    const st = refState(current);
    const key = sort.dataset.sort;
    const cur = st.ui.sort;
    if (!cur || cur.key !== key) st.ui.sort = { key, dir: 'asc' };
    else if (cur.dir === 'asc') st.ui.sort = { key, dir: 'desc' };
    else st.ui.sort = null;
    closePopover(); render(); return;
  }

  const flt = e.target.closest('[data-filter]');
  if (flt) { openFilterPopover(flt, flt.dataset.filter); return; }

  const btn = e.target.closest('[data-act]');
  if (btn) {
    const act = btn.dataset.act;
    const id = btn.dataset.row;

    if (act === 'add') { closePopover(); openForm(current, null); return; }
    if (act === 'edit') { closePopover(); openForm(current, id); return; }
    if (act === 'code') { askCode(btn, current, id); return; }
    if (act === 'archive') { closePopover(); archiveItem(current, id); return; }
    if (act === 'restore') { closePopover(); restoreItem(current, id); return; }
    if (act === 'del') { askDelete(btn, current, id); return; }
    if (act === 'doArchive') { closePopover(); archiveItem(current, id); return; }
    if (act === 'doDelete') { closePopover(); deleteItem(current, id); return; }
    if (act === 'closePop') { closePopover(); return; }
    if (act === 'save') { saveForm(); return; }
    if (act === 'cancel') { form = null; formErr = ''; render(); return; }
    if (act === 'resetFilters') { refState(current).ui.filters = {}; render(); return; }
    if (act === 'sync') {
      /* Ручная синхронизация — тот же рейс, что по расписанию, просто раньше
         срока. Отдельной записи «запущено вручную» в журнале мало: важно, что
         именно приехало, поэтому строка та же, что у планового рейса. */
      sync.at = NOW;
      sync.log.unshift({ at: NOW, manual: true, text: 'Изменений нет.' });
      closePopover(); render(); return;
    }
  }

  if (!e.target.closest('#popover')) closePopover();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'swArch') {
    refState(current).ui.showArchived = e.target.checked;
    render();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePopover(); return; }
  /* Enter сохраняет однострочную форму: значение справочника — одно поле,
     и тянуться мышью до кнопки после одного слова незачем. */
  if (e.key === 'Enter' && form && e.target.closest('#refform') && e.target.tagName === 'INPUT') {
    e.preventDefault(); saveForm();
  }
});

/* ------------------------------ старт ------------------------------ */

render();
