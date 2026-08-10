/* Инбокс «Мои задачи».

   Зачем окно существует. Быстрых действий по решению в строке реестра нет
   намеренно (решение 3): Заказчик обязан открыть карточку и прочитать
   обоснование. Значит уложиться в норматив ответа можно только одним способом —
   человек должен сразу видеть, что горит, и попадать в нужную карточку одним
   кликом. Инбокс это и делает: он не даёт действий, он сокращает путь до них.

   Про сам норматив: 4 / 8 / 24 рабочих часа в договоре не написаны, они пришли
   из Формы 2 и оставлены как рабочее правило (решение 64). Поэтому на экране
   они нигде не названы договорными — «норматив ответа», и всё. Единственный
   договорной срок — один рабочий день на ответ Исполнителя по заявке Заказчика
   (решение 65), но заявки — отдельный раздел меню, экрана у них ещё нет, и в
   инбоксе им пока браться неоткуда.

   Отсюда три правила экрана:
     1. Каждая строка — ссылка в карточку, и по возможности сразу в ту вкладку,
        где лежит нужное действие (card.html?id=N&tab=impl).
     2. Порядок внутри блока — «сначала горит»: просроченное сверху, по
        величине просрочки; горящее — по остатку, у кого меньше времени.
     3. Блоки делятся на два сорта: «ход за мной» и «под наблюдением». В значок
        бокового меню попадают только первые — иначе он показывал бы объём
        работы, а не число дел, которые сегодня надо сделать.

   Данные берутся из data.js без изменений: контроль ответа (controlKind и
   controlDelta) уже посчитан рабочими часами, и пересчитывать его
   здесь было бы вторым источником истины. */

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/"/g, '&quot;');

/* Дата без времени по стандарту читается как UTC и в местном поясе съезжает —
   поэтому такие строки разбираем как локальную полночь. Приём тот же, что в
   реестре и в карточке. */
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

function fmtDur(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${mm} мин`;
  return `${mm} мин`;
}

const daysSince = (d) => Math.floor((NOW - toDate(d)) / 86400000);
const daysTo = (d) => Math.round((toDate(d) - NOW) / 86400000);

/* Русское склонение для «суток» — иначе на экране получается «12 сутки». */
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
/* Ноль суток на экране читается как «ничего не ждём», хотя ждём — просто
   меньше суток. Пишем словами: разница между «0 суток» и «меньше суток»
   в блоке «вернули на уточнение» — это разница между «уже поздно» и «ещё нет». */
const sut = (n) => (n <= 0 ? 'меньше суток' : `${n} ${plural(n, 'сутки', 'суток', 'суток')}`);

/* ------------------------------ роли ------------------------------ */

/* Пять ролей: один набор окон, разный состав действий и разная стартовая
   страница. Пользователи Заказчика видят только свои объекты — ЦИТС из
   модели исключён, его место занял узел дерева ВМАП «месторождение × цех»,
   поэтому зона ответственности задаётся набором таких узлов.

   Роли Исполнителя отбираются по ответственному Исполнителя: у эксперта АКЭ
   рекомендация именная, он её выдал и он же ведёт её по телеметрии.

   Персоны демонстрационные: в рабочем модуле роль и зона приходят с учётной
   записью. Взяты имена, которые уже есть в данных, — иначе инбокс был бы
   пустым у любой роли. */
const ROLES = [
  {
    key: 'expert',
    label: 'Эксперт АКЭ',
    who: 'Матросов',
    side: 'Исполнитель',
    scope: 'свои рекомендации',
    mine: (r) => r.executor === 'Матросов',
    build: buildExpert,
  },
  {
    key: 'expertLead',
    label: 'Руководитель АКЭ',
    who: 'Фатхутдинов Д.Ф.',
    side: 'Исполнитель',
    scope: 'вся команда экспертов',
    mine: () => true,
    build: buildExpertLead,
  },
  {
    key: 'engineer',
    label: 'Инженер Заказчика',
    who: 'Гадаятов Ф.Г',
    side: 'Заказчик',
    scope: 'Дружное, Восточно-Придорожное, Новоортьягунское',
    zone: ['Дружное (Кумалиягунское и Танеевское)', 'Восточно-Придорожное', 'Новоортьягунское'],
    mine(r) { return this.zone.includes(r.field); },
    build: buildEngineer,
  },
  {
    key: 'customerLead',
    label: 'Руководитель Заказчика',
    who: 'Сафин Р.М.',
    side: 'Заказчик',
    scope: 'все объекты договора',
    mine: () => true,
    build: buildCustomerLead,
  },
  /* Администратора в «Моих задачах» больше нет (решение 82). Задач по
     рекомендациям у него не бывает: его стартовая страница — «Пользователи и
     роли», а инбокс показывал служебную сводку и разбор объектов, выписанных
     на АГЗУ. Объектом рекомендации может быть только скважина, разбирать
     нечего. */
];

/* Стартовая роль демо — эксперт АКЭ: рекомендации рождаются у Исполнителя, и
   именно у него инбокс наполнен всеми типами задач сразу. Параметр в адресе
   нужен, чтобы демонстрационную ссылку можно было послать сразу на нужную
   роль. */
const params = new URLSearchParams(location.search);
const startKey = params.get('role');
let role = ROLES.find((r) => r.key === startKey) || ROLES[0];

/* Сколько строк показываем внутри блока. Инбокс — не второй реестр: если
   задач больше, дальше человек идёт в реестр, а не листает здесь. */
const ROW_LIMIT = 6;

/* ------------------------------ общие срезы ------------------------------ */

const mine = () => DATA.filter((r) => role.mine(r));

/* Просрочка сверху и по убыванию: чем дольше молчим, тем выше. У горящих
   наоборот — сверху тот, у кого меньше осталось. */
const byOverdue = (a, b) => b.controlDelta - a.controlDelta;
const byLeft = (a, b) => a.controlDelta - b.controlDelta;
const byOldestAnswer = (a, b) => a.repliedAt - b.repliedAt;

const disputed = (r) => r.dispute && r.dispute.state === 'open';

/* Окно эффекта, закрывающееся скоро. Горизонт — настройка справочника
   «Параметры модуля» (решение 81). Тот же отбор, что у глубокой ссылки
   index.html?alert=window, — специально один в один, чтобы счётчик инбокса и
   реестр не разошлись. */
const CLOSING_SOON_DAYS = param('closingSoonDays');
function windowClosingSoon(r) {
  if (!r.windowCloseAt) return false;
  const d = toDate(r.windowCloseAt) - NOW;
  return d >= 0 && d <= CLOSING_SOON_DAYS * 86400000;
}

/* ------------------------------ элементы строки ------------------------------ */

/* Приоритет и контроль ответа показываются, только пока вопрос ответа
   Заказчика не закрыт — SLA_VISIBLE_STATUSES в data.js. После решения это
   историческая справка, и в инбоксе она занимала бы место молча. */
function slaTags(rec) {
  if (!SLA_VISIBLE_STATUSES.includes(rec.status)) return '';
  const prio = `<span class="prio prio--${rec.priority}" title="${rec.priorityLabel}">${rec.priority}<i>${rec.sla} ч</i></span>`;

  const k = rec.controlKind;
  let tag = '';
  if (k === 'pending') {
    tag = `<span class="tag tag--pending" title="Заказчику уйдёт с началом рабочего дня">ожидает передачи</span>`;
  } else if (k !== 'none') {
    const label = { ok: 'в срок', late: 'с опозданием', overdue: 'просрочено', waiting: 'осталось' }[k];
    const suffix = k === 'ok' ? '' : ` ${fmtDur(rec.controlDelta)}`;
    tag = `<span class="tag tag--${k}">${label}${suffix}</span>`;
  }
  return prio + tag;
}

function statusDot(rec) {
  const [tone, filled] = STATUS_TONE[rec.status] || ['neutral', false];
  return `<i class="status__d status__d--${tone} ${filled ? '' : 'is-hollow'} task__dot"
             title="${esc(rec.statusLabel)}"></i>`;
}

/* Строка задачи. Вся строка — ссылка: довести до карточки за один клик и есть
   смысл окна. Где действие живёт не в «Сводке», ссылка сразу несёт вкладку —
   параметр tab в адресе перебивает запомненную. */
function taskRow(rec, block) {
  const href = block.href ? block.href(rec) : `card.html?id=${rec.id}`;
  const when = block.when ? block.when(rec) : fmt(rec.regDate);
  const num = rec.status === 'draft' ? '<span class="mark">черновик</span>' : rec.number;

  return `<a class="task" href="${href}">
    ${statusDot(rec)}
    <div class="task__b">
      <div class="task__r1">
        <span class="task__num">${num}</span>
        ${slaTags(rec)}
        <span class="task__when">${when}</span>
      </div>
      <div class="task__r2">${rec.problem || '—'}</div>
      <div class="task__r3">${rec.field} · куст ${rec.kust} · скв. <b>${rec.well}</b>
        · ${rec.direction}${block.showExecutor ? ` · ${rec.executor}` : ''}</div>
      ${block.extra ? `<div class="task__r4">${block.extra(rec)}</div>` : ''}
    </div>
    <svg class="ic16 task__go"><use href="#i-next"/></svg>
  </a>`;
}

/* ------------------------------ отрисовка блоков ------------------------------ */

/* Пояснение под заголовком необязательно. Там, где название блока говорит само
   за себя, строка только шумит — а если она объясняет не задачу, а нерешённый
   вопрос проекта, то и вовсе выносит внутреннюю кухню на экран Заказчику. */
function whyLine(b) {
  return b.why ? `<div class="blk__why">${b.why}</div>` : '';
}

function renderBlock(b) {
  if (b.html) {
    return `<section class="blk blk--${b.tone}" id="${b.id}">
      <div class="blk__h">
        <h2 class="blk__t">${b.title}</h2>
        ${b.count === undefined ? '' : `<span class="badge${b.tone === 'calm' ? '' : ' badge--accent'}">${b.count}</span>`}
        ${b.deep ? `<a class="blk__deep" href="${b.deep}">${b.deepLabel || 'в реестре'} →</a>` : ''}
      </div>
      ${whyLine(b)}
      ${b.html}
    </section>`;
  }

  const rows = b.rows || [];
  const shown = rows.slice(0, b.limit || ROW_LIMIT);

  return `<section class="blk blk--${b.tone}" id="${b.id}">
    <div class="blk__h">
      <h2 class="blk__t">${b.title}</h2>
      <span class="badge${b.tone === 'calm' ? '' : ' badge--accent'}">${b.count === undefined ? rows.length : b.count}</span>
      ${b.deep ? `<a class="blk__deep" href="${b.deep}">${b.deepLabel || 'в реестре'} →</a>` : ''}
    </div>
    ${whyLine(b)}
    ${shown.length
      ? `<div class="blk__list">${shown.map((r) => taskRow(r, b)).join('')}</div>`
      : `<div class="blk__empty">${b.empty || 'Пусто — задач нет.'}</div>`}
    ${rows.length > shown.length
      ? `<div class="blk__more">Показаны ${shown.length} из ${rows.length}${
          b.deep ? ` · <a href="${b.deep}">остальные в реестре</a>` : ''}</div>`
      : ''}
  </section>`;
}

/* Сводная таблица руководителя. Берём тот же табличный паттерн, что в реестре:
   12/16, те же отступы и границы — второй визуальный язык здесь не нужен. */
function sumTable(head, rows) {
  return `<table class="tbl sum">
    <thead><tr>${head.map((h, i) => `<th${i ? ' class="sum__n"' : ''}>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) =>
      `<td${i ? ' class="sum__n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

/* ------------------------------ инбокс эксперта АКЭ ------------------------------ */

function buildExpert() {
  const my = mine();
  const clarify = my.filter((r) => r.status === 'clarify').sort(byOldestAnswer);
  const disputes = my.filter(disputed).sort((a, b) => toDate(a.dispute.at) - toDate(b.dispute.at));
  const drafts = my.filter((r) => r.status === 'draft').sort((a, b) => a.regDate - b.regDate);
  const pending = my.filter((r) => r.status === 'registered').sort((a, b) => a.sentAt - b.sentAt);
  const approved = my.filter((r) => r.status === 'approved').sort(byOldestAnswer);
  const windows = my.filter((r) => r.status === 'windowOpen')
    .sort((a, b) => toDate(a.windowCloseAt) - toDate(b.windowCloseAt));
  const closingSoon = windows.filter(windowClosingSoon);

  const blocks = [
    {
      id: 'b-clarify', tone: 'hot', act: true, rows: clarify,
      title: 'Вернули на уточнение',
      why: `Заказчик прочитал рекомендацию и просит деталей. Пока мы не ответим, решение
            не двинется: уточнение вносится в ту же рекомендацию, номер не меняется.`,
      when: (r) => `запрошено ${fmt(r.repliedAt)}`,
      extra: (r) => `Заказчик: ${r.customer || '—'} · у нас ${sut(daysSince(r.repliedAt))}`,
    },
    {
      id: 'b-dispute', tone: 'hot', act: true, rows: disputes,
      title: 'Оспорена дата реализации',
      why: `Заказчик не согласен с датой, от которой считается окно. Окно при этом не
            останавливается, но расчёт эффекта до снятия возражения предварительный —
            ответ за нами: принять дату Заказчика или отклонить возражение с обоснованием.`,
      href: (r) => `card.html?id=${r.id}&tab=impl`,
      when: (r) => `возражение ${fmt(r.dispute.at)}`,
      extra: (r) => `наша дата ${fmt(r.factDate, false)} · предлагают ${fmt(r.dispute.proposedDate, false)}`,
      empty: 'Возражений по датам реализации нет.',
    },
    {
      id: 'b-draft', tone: 'warn', act: true, rows: drafts,
      title: 'Незаконченные черновики',
      why: `У черновика нет ни номера, ни даты регистрации, и в реестре его видит только
            автор. Никто, кроме вас, эту работу не подхватит.`,
      when: (r) => `создан ${fmt(r.regDate)}`,
      extra: (r) => `лежит ${sut(daysSince(r.regDate))}`,
    },
    {
      id: 'b-pending', tone: 'calm', rows: pending,
      title: 'Уйдут Заказчику с открытием рабочего окна',
      why: `Передача идёт только в рабочее окно — пн–пт 09:00–24:00 по Когалыму, — и
            норматив ответа стартует с момента передачи, а не регистрации. Действия
            не требуется: это напоминание, чтобы успеть отозвать или поправить.`,
      when: (r) => `передача ${fmt(r.sentAt)}`,
      extra: (r) => `через ${fmtDur(r.sentAt - NOW)} · норматив ${r.sla} ч пойдёт с этого момента`,
    },
    {
      id: 'b-approved', tone: 'calm', rows: approved,
      title: 'Согласовано — проверить телеметрию и зафиксировать реализацию',
      why: `Факт и дату реализации определяет Исполнитель. Ведём скважину в ВМАП: смена
            частоты, давления на приёме, загрузки ПЭД или программы периодического режима
            означает, что мероприятие выполнено — тогда фиксируем дату, и этим же
            действием открывается окно эффекта на 90 суток.`,
      href: (r) => `card.html?id=${r.id}&tab=impl`,
      deep: `index.html?tile=approved&executor=${encodeURIComponent(role.who)}`,
      deepLabel: 'все согласованные за вами, в реестре',
      when: (r) => `согласовано ${fmt(r.repliedAt, false)}`,
      extra: (r) => `ждём смены режима ${sut(daysSince(r.repliedAt))}`,
    },
    {
      id: 'b-window', tone: 'calm', rows: closingSoon, count: closingSoon.length,
      title: `Окна эффекта, закрывающиеся в ближайшие ${CLOSING_SOON_DAYS} суток`,
      /* Текст собирается из данных, а не написан по факту сегодняшнего набора:
         на другом наборе «разбирать нечего» превратилось бы в ложь молча. */
      why: `Окно идёт 90 суток от даты фактической реализации; после закрытия дата
            реализации не пересматривается, поэтому спорное разбирают до него.
            ${windows.length
              ? `Ближайшее из ваших ${windows.length} открытых закрывается
                 ${fmt(windows[0].windowCloseAt, false)}.`
              : 'Открытых окон у вас сейчас нет.'}`,
      deep: 'index.html?alert=window',
      deepLabel: 'закрывающиеся в реестре, по всей команде',
      when: (r) => `до закрытия ${sut(daysTo(r.windowCloseAt))}`,
      empty: 'Ни одно окно в этот срок не закрывается.',
    },
  ];

  const tiles = [
    { n: clarify.length, l: 'Вернули на уточнение', href: '#b-clarify' },
    { n: disputes.length, l: 'Оспорена дата реализации', href: '#b-dispute' },
    { n: drafts.length, l: 'Черновики', href: '#b-draft' },
    { n: pending.length, l: 'Уйдут в 09:00', href: '#b-pending' },
    { n: approved.length, l: 'Ждём реализации', href: '#b-approved' },
    { n: closingSoon.length, l: 'Окно закрывается на неделе', href: 'index.html?alert=window' },
  ];

  return { tiles, blocks };
}

/* ------------------------------ инбокс руководителя АКЭ ------------------------------ */

function buildExpertLead() {
  const all = DATA;
  const overdue = all.filter((r) => r.controlKind === 'overdue');
  const clarify = all.filter((r) => r.status === 'clarify');
  const pending = all.filter((r) => r.status === 'registered');
  const approved = all.filter((r) => r.status === 'approved');
  const windows = all.filter((r) => r.status === 'windowOpen');
  const disputes = all.filter(disputed);

  /* «Согласовано, а режим не меняется» — единственное место, где у Исполнителя
     копится невидимая проблема: норматива на реализацию в договоре нет, срок
     ничем не подсвечивается, и рекомендация может стоять месяцами. Порог —
     настройка справочника «Параметры модуля», а не константа (решение 81). */
  const STUCK_DAYS = param('stuckDays');
  const stuck = approved.filter((r) => daysSince(r.repliedAt) > STUCK_DAYS).sort(byOldestAnswer);

  const team = EXECUTORS.map((ex) => {
    const s = all.filter((r) => r.executor === ex);
    const cnt = (f) => s.filter(f).length;
    return [ex,
      cnt((r) => r.status === 'draft'),
      cnt((r) => r.status === 'registered'),
      cnt((r) => r.status === 'clarify'),
      cnt((r) => r.status === 'sent' || r.status === 'review'),
      cnt((r) => r.controlKind === 'overdue'),
      cnt((r) => r.status === 'approved'),
      cnt((r) => r.status === 'windowOpen'),
      cnt(disputed)];
  });
  team.sort((a, b) => b[5] - a[5]);
  team.push(['<b>Итого</b>',
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<b>${team.reduce((s, r) => s + r[i], 0)}</b>`)]);

  const blocks = [
    {
      id: 'b-team', tone: 'calm', count: all.length,
      title: 'Сводка по команде',
      why: `Руководителю нужны не свои задачи, а места, где работа встала. Колонка
            «просрочено» считает ответы Заказчика: это не вина эксперта, но именно
            он поднимает вопрос на оперативке.`,
      html: sumTable(
        ['Эксперт', 'Черновики', 'Ждут передачи', 'На уточнении', 'У Заказчика',
          'из них просрочено', 'Согласовано', 'Окна открыты', 'Оспорено'],
        team),
    },
    {
      id: 'b-dispute', tone: 'hot', act: true, rows: disputes,
      title: 'Возражения Заказчика по дате реализации',
      why: `От даты реализации считаются 90 суток окна и деньги по договору. Пока
            возражение не снято, расчёт эффекта предварительный, а разбирательство
            в случае отказа уходит из модуля в раздел 10 договора.`,
      href: (r) => `card.html?id=${r.id}&tab=impl`,
      when: (r) => `возражение ${fmt(r.dispute.at)}`,
      showExecutor: true,
      extra: (r) => `наша дата ${fmt(r.factDate, false)} · предлагают ${fmt(r.dispute.proposedDate, false)}
                     · разница ${sut(Math.abs(daysTo(r.dispute.proposedDate) - daysTo(r.factDate)))}`,
      empty: 'Возражений нет.',
    },
    {
      id: 'b-stuck', tone: 'warn', act: true, rows: stuck,
      title: `Согласовано больше ${STUCK_DAYS} суток назад, реализации нет`,
      why: `Рекомендация принята, но режим на скважине не менялся — окно эффекта не
            открылось, в зачёт по договору она не идёт. Норматива на реализацию
            договор не устанавливает, поэтому это ручной контроль руководителя.`,
      href: (r) => `card.html?id=${r.id}&tab=impl`,
      when: (r) => `согласовано ${fmt(r.repliedAt, false)}`,
      showExecutor: true,
      extra: (r) => `ждём смены режима ${sut(daysSince(r.repliedAt))}`,
    },
  ];

  const tiles = [
    { n: overdue.length, l: 'Просрочен ответ Заказчика', href: 'index.html?alert=overdue' },
    { n: clarify.length, l: 'На уточнении у экспертов', href: '#b-team' },
    { n: pending.length, l: 'Ждут передачи', href: '#b-team' },
    { n: approved.length, l: 'Согласовано, реализации нет', href: '#b-stuck' },
    { n: stuck.length, l: `Из них дольше ${STUCK_DAYS} суток`, href: '#b-stuck' },
    { n: windows.length, l: 'Окна эффекта открыты', href: '#b-team' },
  ];

  return { tiles, blocks };
}

/* ------------------------------ инбокс инженера Заказчика ------------------------------ */

function buildEngineer() {
  const my = mine();
  const overdue = my.filter((r) => r.controlKind === 'overdue').sort(byOverdue);
  const soon = my.filter((r) => r.controlKind === 'waiting').sort(byLeft);
  /* Глубокая ссылка index.html?alert=soon отбирает не «срок ещё идёт», а
     «истекает в ближайшие два рабочих часа» — так устроен matchesAlert в app.js.
     Считаем этот подмножественный счёт тем же условием и говорим о нём прямо,
     иначе после перехода в реестр число строк не сойдётся с блоком. */
  const soon2h = soon.filter((r) => r.controlDelta <= 2 * 3600 * 1000);
  /* По всем объектам, а не только по зоне: ссылка ведёт в реестр, а реестр
     зоной не ограничен. Если там ноль — ссылку не показываем вовсе, пустой
     реестр после клика хуже, чем отсутствие ссылки. */
  const soon2hAll = DATA.filter((r) => r.controlKind === 'waiting'
    && r.controlDelta <= 2 * 3600 * 1000).length;
  const approved = my.filter((r) => r.status === 'approved').sort(byOldestAnswer);
  /* Сортировка по дате закрытия, а не по дате фиксации: единственное действие,
     которое здесь ещё возможно, — возразить по дате реализации, и возможно оно
     только пока окно открыто. Значит сверху то, что закроется раньше. */
  const windows = my.filter((r) => r.status === 'windowOpen')
    .sort((a, b) => toDate(a.windowCloseAt) - toDate(b.windowCloseAt));

  const blocks = [
    {
      id: 'b-overdue', tone: 'hot', act: true, rows: overdue,
      title: 'Просрочен ответ — разобрать в первую очередь',
      why: `Норматив ответа истёк, время считается рабочими часами. Быстрых кнопок
            «принять» и «отклонить» здесь нет намеренно: решение принимается в карточке,
            после технологического обоснования, — но дорога до неё в один клик.
            Ссылка справа ведёт в реестр по тому же условию, но без ограничения
            зоной: реестр зону ответственности пока не фильтрует.`,
      deep: 'index.html?alert=overdue',
      deepLabel: 'просроченные в реестре, по всем объектам',
      when: (r) => `передано ${fmt(r.sentAt)}`,
      showExecutor: true,
      extra: (r) => `срок был ${fmt(r.dueAt)} · ${r.status === 'review'
        ? `карточку открыли ${fmt(r.openedAt)}, решения нет`
        : 'карточка ещё не открыта'}`,
    },
    {
      id: 'b-soon', tone: 'warn', act: true, rows: soon,
      title: 'Срок идёт — ответить сегодня',
      why: `Норматив ещё не истёк. Остаток считается рабочими часами, пн–пт 09:00–24:00:
            календарные сутки и сутки норматива — разные величины, и сейчас, до 09:00,
            он вообще не идёт. ${soon2h.length
              ? `${soon2h.length} из них истекает в ближайшие два рабочих часа.`
              : 'В ближайшие два рабочих часа не истекает ни одна.'}`,
      deep: soon2hAll ? 'index.html?alert=soon' : null,
      deepLabel: 'истекающие в реестре, по всем объектам',
      when: (r) => `передано ${fmt(r.sentAt)}`,
      showExecutor: true,
      extra: (r) => `ответить до ${fmt(r.dueAt)}`,
    },
    {
      id: 'b-approved', tone: 'calm', rows: approved,
      title: 'Согласовано — работы не начаты',
      why: `Решение принято, но по телеметрии режим на скважине прежний. Исполнитель
            ждёт смены режима, чтобы зафиксировать реализацию: пока её нет, окно
            подтверждения эффекта не открывается и эффект не считается.`,
      when: (r) => `решение ${fmt(r.repliedAt, false)}`,
      showExecutor: true,
      extra: (r) => `${sut(daysSince(r.repliedAt))} без изменения режима`,
      deep: `index.html?tile=approved&field=${encodeURIComponent(role.zone.join('|'))}`,
      deepLabel: 'согласованные по вашей зоне, в реестре',
    },
    {
      id: 'b-window', tone: 'calm', rows: windows, limit: 3,
      title: 'Окна подтверждения эффекта в вашей зоне',
      why: `Дату реализации определил Исполнитель по телеметрии. Не согласны — возразить
            можно, пока окно не закрыто: после закрытия эффект финализирован и дата
            не пересматривается.`,
      href: (r) => `card.html?id=${r.id}&tab=impl`,
      when: (r) => `дата реализации ${fmt(r.factDate, false)}`,
      showExecutor: true,
      extra: (r) => `окно до ${fmt(r.windowCloseAt, false)} · осталось ${sut(daysTo(r.windowCloseAt))}`,
    },
  ];

  const tiles = [
    { n: overdue.length, l: 'Просрочено', href: '#b-overdue' },
    { n: soon.length, l: 'Срок идёт', href: '#b-soon' },
    { n: approved.length, l: 'Согласовано, работ нет', href: '#b-approved' },
    { n: windows.length, l: 'Окна эффекта открыты', href: '#b-window' },
  ];

  return { tiles, blocks };
}

/* ------------------------------ инбокс руководителя Заказчика ------------------------------ */

function buildCustomerLead() {
  const all = DATA;
  const overdue = all.filter((r) => r.controlKind === 'overdue').sort(byOverdue);
  const soon = all.filter((r) => r.controlKind === 'waiting');
  const approved = all.filter((r) => r.status === 'approved');
  const windows = all.filter((r) => r.status === 'windowOpen');
  const overdueI = overdue.filter((r) => r.priority === 'I');

  /* Свод по объектам, а не по людям: ответственный Заказчика в модуле
     появляется только после открытия карточки, а до открытия рекомендация уже
     висит на объекте и уже тратит норматив. Значит адресовать её можно только
     зоной ответственности. */
  const fields = [...new Set(all.map((r) => r.field))].map((f) => {
    const s = all.filter((r) => r.field === f);
    const cnt = (fn) => s.filter(fn).length;
    return [f,
      cnt((r) => r.status === 'sent' || r.status === 'review'),
      cnt((r) => r.controlKind === 'overdue'),
      cnt((r) => r.controlKind === 'overdue' && r.priority === 'I'),
      cnt((r) => r.status === 'approved'),
      cnt((r) => r.status === 'windowOpen')];
  });
  fields.sort((a, b) => b[2] - a[2] || b[1] - a[1]);
  fields.push(['<b>Итого</b>',
    ...[1, 2, 3, 4, 5].map((i) => `<b>${fields.reduce((s, r) => s + r[i], 0)}</b>`)]);

  const blocks = [
    {
      id: 'b-overdue', tone: 'hot', act: true, rows: overdue, count: overdue.length,
      /* «Самые давние просрочки» звучало разговорно, а этот блок руководитель
         Заказчика читает первым. Название взято из терминологии самого модуля:
         колонка «Контроль ответа» со значением «просрочено», плитка «Просрочен
         ответ». Порядок — от самой давней — остаётся, но живёт в сортировке,
         а не в заголовке. */
      title: 'Просроченные ответы',
      deep: 'index.html?alert=overdue',
      when: (r) => `передано ${fmt(r.sentAt)}`,
      showExecutor: true,
      extra: (r) => `срок был ${fmt(r.dueAt)} · ${r.status === 'review'
        ? `карточку открыли ${fmt(r.openedAt)}, решения нет`
        : 'карточка ещё не открыта'}`,
    },
    {
      id: 'b-fields', tone: 'calm', count: all.length,
      /* Пояснение убрано: оно рассказывало Заказчику про нерешённый вопрос 1.1
         и про устройство дерева ВМАП. То, что Южно-Ягунское стоит четырьмя
         строками, видно из самих строк — там написан цех. */
      title: 'Сводка по объектам',
      html: sumTable(
        ['Объект', 'Ждут решения', 'Просрочено', 'из них приоритет I',
          'Согласовано, работ нет', 'Окна открыты'],
        fields),
    },
  ];

  const tiles = [
    { n: overdue.length, l: 'Просрочен ответ', href: 'index.html?alert=overdue' },
    { n: overdueI.length, l: 'Из них приоритет I', href: '#b-overdue' },
    { n: soon.length, l: 'Срок ещё идёт', href: '#b-fields' },
    { n: approved.length, l: 'Согласовано, работ нет', href: '#b-fields' },
    { n: windows.length, l: 'Окна эффекта открыты', href: '#b-fields' },
  ];

  return { tiles, blocks };
}

/* ------------------------------ сборка экрана ------------------------------ */

/* «Сейчас» вынесено на экран намеренно: в макете время зафиксировано, и без
   этой строки непонятно, почему восемь рекомендаций стоят «ждут передачи».

   Окно названо просто рабочим, без стороны. По договору рабочее окно
   09:00–24:00 принадлежит Исполнителю (решение 66); решения 19 и 20 применили
   его же к передаче рекомендаций Заказчику — разумно, но договором это не
   обосновано и идёт в протокол согласования. Пока вопрос не закрыт, называть
   окно «окном Заказчика» на экране нельзя. */
function renderNow() {
  const openAt = new Date(NOW);
  openAt.setHours(9, 0, 0, 0);
  const before = NOW < openAt;
  $('#nowline').innerHTML = `<svg class="ic16"><use href="#i-clock"/></svg>
    ${fmt(NOW)} · рабочее окно ${before
      ? `откроется через ${fmtDur(openAt - NOW)}`
      : 'открыто до 24:00'}`;
}

function renderRoles() {
  $('#roleSeg').innerHTML = ROLES.map((r) =>
    `<button class="seg__b ${r.key === role.key ? 'is-on' : ''}" data-role="${r.key}">${r.label}</button>`).join('');
  $('#demoWho').innerHTML = `Задачи пользователя <b>${role.who}</b> · сторона: ${role.side}
    · зона: ${role.scope}`;
}

function render() {
  renderNow();
  renderRoles();

  const { tiles, blocks } = role.build();

  $('#tiles').innerHTML = tiles.map((t) =>
    `<a class="tile ${t.n ? '' : 'is-zero'}" href="${t.href}">
      <span class="tile__n">${t.n}</span><span class="tile__l">${t.l}</span></a>`).join('');

  /* Значок «Мои задачи» в боковом меню считает то, где ход за пользователем
     лично, — сумму блоков, помеченных как требующие действия. Наблюдательные
     блоки в него не входят: иначе значок показывал бы объём ведения, а не
     число дел на сегодня. Число на экране разложено по блокам, чтобы его
     можно было проверить глазами, а не принимать на веру. */
  const act = blocks.filter((b) => b.act);
  const total = act.reduce((s, b) => s + (b.count === undefined ? (b.rows || []).length : b.count), 0);
  $('#navBadge').textContent = total;
  $('#badgeNote').innerHTML = `Значок «${total}» у пункта «Мои задачи» считает то, где ход
    за вами лично: ${act.map((b) => `${b.title.toLowerCase()} — ${
      b.count === undefined ? (b.rows || []).length : b.count}`).join(', ')}.
    Остальные блоки — наблюдение, в значок не входят.`;

  $('#feed').innerHTML = blocks.map(renderBlock).join('');
}

/* ------------------------------ события ------------------------------ */

document.addEventListener('click', (e) => {
  const r = e.target.closest('[data-role]');
  if (r) {
    role = ROLES.find((x) => x.key === r.dataset.role);
    $('#feed').scrollTop = 0;
    render();
  }
});

render();
