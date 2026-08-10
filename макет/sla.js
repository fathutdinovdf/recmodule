/* Экран «Календарь и SLA» — настройка того, как модуль считает сроки.

   Экран маленький по данным и тяжёлый по последствиям: от этих настроек
   зависит, кто прав в споре о просрочке. Поэтому здесь всё, что влияет на
   расчёт, показано вместе с источником: договор, Форма 2 или наше
   предложение. Три источника имеют разный вес в разговоре с Заказчиком, и
   склеивать их в один экран «настроек» без пометок значило бы выдать
   собственный регламент за договорное обязательство (решения 64, 66, 67).

   Свой движок рабочего окна здесь заведён сознательно, а не скопирован из
   data.js. Отличия от data.js — три:
     1. Праздники и переносы. В data.js рабочим днём считается любой пн–пт;
        договор же говорит «за исключением выходных и нерабочих праздничных
        дней», то есть производственный календарь — не улучшение, а
        требование (решение 67).
     2. Предпраздничный день закрывает окно на час раньше (ст. 95 ТК).
     3. Границы окна и рабочие дни недели читаются из настроек, а не из
        констант: экран для того и нужен, чтобы их менять.
   На случаях без праздников и при настройках по умолчанию результат обязан
   совпадать с data.js посимвольно — это проверяется отдельным скриптом. */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Производственный календарь
     ------------------------------------------------------------------
     Хранятся только ИСКЛЮЧЕНИЯ из базового правила «рабочие дни недели».
     Полная роспись 365 дней человеком не проверяется, а список из полутора
     десятков дат — проверяется за минуту, и именно он подписывается
     протоколом. Обратная сторона: базовое правило обязано быть в настройке
     рядом, иначе список исключений нечитаем.

     Вид дня:
       holiday — нерабочий праздничный день (ст. 112 ТК). Показан даже когда
                 приходится на выходной: иначе непонятно, откуда взялся перенос.
       off     — перенесённый выходной. Рабочий по календарю день, объявленный
                 нерабочим.
       work    — наоборот, рабочий день на субботе или воскресенье.
       short   — предпраздничный: день рабочий, но окно закрывается на час
                 раньше.

     2026 год — по постановлению Правительства РФ о переносах выходных.
     2027 год — предварительно: постановление на 2027 год на дату макета не
     опубликовано, а договор действует до 30.12.2027, то есть без 2027 года
     календарь бесполезен. Все даты 2027 помечены как неподтверждённые, и это
     отдельный вопрос к Заказчику, а не техническая мелочь: сдвиг одного
     переноса сдвигает срок ответа по всем рекомендациям вокруг него. */

  const CAL_SEED = [
    /* ---- 2026 ---- */
    ['2026-01-01', 'holiday', 'Новогодние каникулы'],
    ['2026-01-02', 'holiday', 'Новогодние каникулы'],
    ['2026-01-03', 'holiday', 'Новогодние каникулы'],
    ['2026-01-04', 'holiday', 'Новогодние каникулы'],
    ['2026-01-05', 'holiday', 'Новогодние каникулы'],
    ['2026-01-06', 'holiday', 'Новогодние каникулы'],
    ['2026-01-07', 'holiday', 'Рождество Христово'],
    ['2026-01-08', 'holiday', 'Новогодние каникулы'],
    ['2026-01-09', 'off', 'Перенос выходного с субботы 3 января'],
    ['2026-02-23', 'holiday', 'День защитника Отечества'],
    ['2026-03-08', 'holiday', 'Международный женский день'],
    ['2026-03-09', 'off', 'Перенос выходного с воскресенья 8 марта'],
    ['2026-04-30', 'short', 'Предпраздничный день перед 1 мая'],
    ['2026-05-01', 'holiday', 'Праздник Весны и Труда'],
    ['2026-05-09', 'holiday', 'День Победы'],
    ['2026-05-11', 'off', 'Перенос выходного с субботы 9 мая'],
    ['2026-06-11', 'short', 'Предпраздничный день перед 12 июня'],
    ['2026-06-12', 'holiday', 'День России'],
    ['2026-11-03', 'short', 'Предпраздничный день перед 4 ноября'],
    ['2026-11-04', 'holiday', 'День народного единства'],
    ['2026-12-31', 'off', 'Перенос выходного с воскресенья 4 января'],

    /* ---- 2027, предварительно ---- */
    ['2027-01-01', 'holiday', 'Новогодние каникулы', 1],
    ['2027-01-02', 'holiday', 'Новогодние каникулы', 1],
    ['2027-01-03', 'holiday', 'Новогодние каникулы', 1],
    ['2027-01-04', 'holiday', 'Новогодние каникулы', 1],
    ['2027-01-05', 'holiday', 'Новогодние каникулы', 1],
    ['2027-01-06', 'holiday', 'Новогодние каникулы', 1],
    ['2027-01-07', 'holiday', 'Рождество Христово', 1],
    ['2027-01-08', 'holiday', 'Новогодние каникулы', 1],
    ['2027-02-22', 'off', 'Перенос выходного с субботы 2 января', 1],
    ['2027-02-23', 'holiday', 'День защитника Отечества', 1],
    ['2027-03-08', 'holiday', 'Международный женский день', 1],
    ['2027-04-30', 'short', 'Предпраздничный день перед 1 мая', 1],
    ['2027-05-01', 'holiday', 'Праздник Весны и Труда', 1],
    ['2027-05-03', 'off', 'Перенос выходного с субботы 1 мая', 1],
    ['2027-05-09', 'holiday', 'День Победы', 1],
    ['2027-05-10', 'off', 'Перенос выходного с воскресенья 9 мая', 1],
    ['2027-06-11', 'short', 'Предпраздничный день перед 12 июня', 1],
    ['2027-06-12', 'holiday', 'День России', 1],
    ['2027-06-14', 'off', 'Перенос выходного с субботы 12 июня', 1],
    ['2027-11-03', 'short', 'Предпраздничный день перед 4 ноября', 1],
    ['2027-11-04', 'holiday', 'День народного единства', 1],
    ['2027-11-05', 'off', 'Перенос выходного с воскресенья 3 января', 1],
    ['2027-12-31', 'short', 'Предпраздничный день перед 1 января 2028', 1],
  ];

  const KINDS = {
    holiday: { label: 'Нерабочий праздничный день', cls: 'k-hol' },
    off: { label: 'Перенесённый выходной', cls: 'k-off' },
    work: { label: 'Рабочий день (перенос)', cls: 'k-work' },
    short: { label: 'Предпраздничный, окно короче на час', cls: 'k-short' },
  };

  /* Срок действия услуг по договору. Дни вне периода в календаре гасятся:
     настраивать их можно, но смысла в этом нет, а показывать одинаково с
     рабочими — значит приглашать спорить о днях, которых договор не касается. */
  const CONTRACT_FROM = new Date('2026-07-01T00:00:00');
  const CONTRACT_TO = new Date('2027-12-30T23:59:59');

  /* Часовые пояса. Расчётный пояс — Когалым, он не выбирается: два экземпляра
     одного отчёта, снятые в Москве и в Когалыме, обязаны совпадать. Выбор
     влияет только на то, что человек видит рядом с когалымским временем. */
  const TZS = [
    { id: 'kgl', label: 'Когалым, Сургут, Тюмень — UTC+5', off: 5 },
    { id: 'msk', label: 'Москва, Санкт-Петербург — UTC+3', off: 3 },
    { id: 'kgd', label: 'Калининград — UTC+2', off: 2 },
    { id: 'sam', label: 'Самара, Ижевск — UTC+4', off: 4 },
    { id: 'oms', label: 'Омск — UTC+6', off: 6 },
    { id: 'krs', label: 'Красноярск, Новосибирск — UTC+7', off: 7 },
  ];
  const TZ_CALC = 5;

  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  /* ------------------------------------------------------------------
     Состояние
     ------------------------------------------------------------------ */

  function seedCal() {
    const m = {};
    CAL_SEED.forEach(([d, kind, name, draft]) => { m[d] = { kind, name, draft: !!draft }; });
    return m;
  }

  function defaults() {
    return {
      days: [1, 2, 3, 4, 5],          // дни недели базового правила
      from: 9,
      to: 24,
      shortOn: true,
      sla: { I: 4, II: 8, III: 24 },
      /* Обращения Заказчика получили те же уровни SL, что и рекомендации:
         приоритет присваивает Заказчик, отвечает Исполнитель. Прежняя настройка
         «1 рабочий день» этого не описывает и заменена тремя сроками. */
      claimSla: { I: 4, II: 8, III: 24 },
      tz: 'kgl',
      cal: seedCal(),
    };
  }

  let S = defaults();
  let SAVED = JSON.parse(JSON.stringify(S));
  let calYear = 2026;
  let calcPrio = 'II';
  /* Пятница 22:40 — самый показательный вход: и вне окна, и перед выходными.
     Дефолт выбран так, чтобы экран сразу отвечал на главный вопрос, а не
     показывал пустой калькулятор. */
  let calcAt = '2026-08-07T22:40';
  const LOG = [
    { d: '05.08.2026 08:12', who: 'Фатхутдинов Д.Ф.', t: 'Загружен производственный календарь на 2026 год' },
    { d: '05.08.2026 08:12', who: 'Фатхутдинов Д.Ф.', t: 'Календарь на 2027 год заполнен предварительно, до публикации постановления' },
  ];

  /* ------------------------------------------------------------------
     Утилиты дат
     ------------------------------------------------------------------ */

  const p2 = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const fmtD = (d) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
  const fmtT = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const fmtDT = (d) => `${WD[d.getDay()]} ${fmtD(d)} ${fmtT(d)}`;
  const local16 = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;

  /** Длительность словами. «8 ч» без минут читается быстрее, чем «8 ч 00 мин». */
  function fmtH(h) {
    const mins = Math.round(h * 60);
    const H = Math.floor(mins / 60);
    const M = mins % 60;
    if (!H) return `${M} мин`;
    return M ? `${H} ч ${M} мин` : `${H} ч`;
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------------------------------------------
     Движок рабочего окна
     ------------------------------------------------------------------ */

  function ex(d) { return S.cal[key(d)] || null; }

  function isWorkday(d) {
    const e = ex(d);
    if (e) {
      if (e.kind === 'work') return true;
      if (e.kind === 'holiday' || e.kind === 'off') return false;
    }
    return S.days.indexOf(d.getDay()) >= 0;
  }

  /** Час закрытия окна в конкретный день: предпраздничный короче на час. */
  function closeAt(d) {
    const e = ex(d);
    return (S.shortOn && e && e.kind === 'short') ? S.to - 1 : S.to;
  }

  const hOf = (d) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

  /** Момент того же дня в заданный час. Час 24 намеренно перекатывается на
      00:00 следующих суток — так же ведёт себя setHours в data.js. */
  function atH(d, h) {
    const x = new Date(d);
    x.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    return x;
  }

  function inWindow(d) {
    if (!isWorkday(d)) return false;
    const h = hOf(d);
    return h >= S.from && h < closeAt(d);
  }

  /** Ближайший момент внутри окна: сам момент либо открытие ближайшего
      рабочего дня. Правило переноса из договора развёрнуто: там обращения
      Заказчика к Исполнителю переносятся на 09:00 следующего рабочего дня,
      здесь то же самое применено к передаче рекомендаций Заказчику. Это
      отступление, а не цитата (решение 66). */
  function toWindow(d) {
    let x = new Date(d);
    if (inWindow(x)) return x;
    if (isWorkday(x) && hOf(x) < S.from) return atH(x, S.from);
    let guard = 0;
    do {
      x.setDate(x.getDate() + 1);
      x = atH(x, S.from);
    } while (!isWorkday(x) && ++guard < 800);
    return x;
  }

  /** Прибавить рабочие часы. Возвращает и результат, и разбивку по дням:
      разбивка — половина ценности калькулятора, спорить с датой можно, с
      росписью по часам нечем. */
  function addWorkHours(from, hours) {
    let cur = toWindow(from);
    let left = hours;
    const steps = [];
    let guard = 0;
    while (left > 1e-9 && guard++ < 2000) {
      const end = atH(cur, closeAt(cur));
      const avail = (end - cur) / 3600000;
      if (left <= avail + 1e-9) {
        const fin = new Date(cur.getTime() + left * 3600000);
        steps.push({ from: cur, to: fin, h: left, full: false });
        return { at: fin, steps };
      }
      steps.push({ from: cur, to: end, h: avail, full: true });
      left -= avail;
      cur = toWindow(end);
    }
    return { at: cur, steps };
  }

  /* ------------------------------------------------------------------
     Статистика календаря
     ------------------------------------------------------------------ */

  function yearStats(y) {
    let work = 0; let hours = 0; let hol = 0; let off = 0; let short = 0; let extra = 0;
    const d = new Date(y, 0, 1);
    while (d.getFullYear() === y) {
      const e = ex(d);
      if (e) {
        if (e.kind === 'holiday') hol++;
        if (e.kind === 'off') off++;
        if (e.kind === 'short') short++;
        if (e.kind === 'work') extra++;
      }
      if (isWorkday(d)) { work++; hours += closeAt(d) - S.from; }
      d.setDate(d.getDate() + 1);
    }
    return { work, hours, hol, off, short, extra };
  }



  function verdict(deadline, replied, now) {
    if (replied) {
      return replied <= deadline
        ? { k: 'ok', t: 'В СРОК' }
        : { k: 'late', t: 'ПОЛУЧЕН С ПРОСРОЧКОЙ' };
    }
    if (now <= deadline) return { k: 'waiting', t: 'ОЖИДАНИЕ' };
    return { k: 'overdue', t: 'ПРОСРОЧЕНО' };
  }

  /* ------------------------------------------------------------------
     Рендер: рабочее окно
     ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);

  function renderWindow() {
    const wrap = $('workdays');
    wrap.innerHTML = [1, 2, 3, 4, 5, 6, 0].map((w) =>
      `<button class="chip${S.days.indexOf(w) >= 0 ? ' is-on' : ''}" data-wd="${w}">${WD[w]}</button>`).join('');

    const opts = (sel, lo, hi) => {
      let h = '';
      for (let i = lo; i <= hi; i++) h += `<option value="${i}"${i === sel ? ' selected' : ''}>${p2(i === 24 ? 0 : i)}:00${i === 24 ? ' (полночь)' : ''}</option>`;
      return h;
    };
    $('wFrom').innerHTML = opts(S.from, 0, 12);
    $('wTo').innerHTML = opts(S.to, 13, 24);
    $('shortOn').checked = S.shortOn;

    const st26 = yearStats(2026);
    const st27 = yearStats(2027);
    const perDay = S.to - S.from;
    const perWeek = S.days.length * perDay;
    $('winStats').innerHTML = [
      ['Часов в окне за день', perDay, 'без предпраздничных'],
      ['Часов в окне за неделю', perWeek, `${S.days.length} рабочих дня`],
      ['Рабочих часов в 2026', st26.hours.toLocaleString('ru-RU'), `${st26.work} рабочих дней`],
      ['Рабочих часов в 2027', st27.hours.toLocaleString('ru-RU'), `${st27.work} рабочих дней`],
    ].map(([k, v, s]) => `<div class="kpi"><div class="kpi__k">${k}</div><div class="kpi__v">${v}</div><div class="kpi__k">${s}</div></div>`).join('');
  }

  /* ------------------------------------------------------------------
     Рендер: нормативы
     ------------------------------------------------------------------ */

  /* Нормативов два набора, и путать их нельзя: по рекомендации срок держит
     Заказчик, по обращению — Исполнитель. Сроки одинаковые, 4 / 8 / 24, но
     это разные обязательства разных сторон, поэтому и настройки раздельные. */
  function slaRows(набор, ключ, событие) {
    return PRIORITIES.map((p) => {
      const часов = набор[p.code];
      const res = addWorkHours(new Date('2026-08-07T22:40'), часов);
      return `<div class="slarow">
        <span class="prio prio--${p.code}">${p.code}<i>приоритет</i></span>
        <div class="slarow__in">
          <input type="number" class="inp inp--num" data-${ключ}="${p.code}" value="${часов}" min="1" max="120" step="1">
          <span class="slarow__u">рабочих часов</span>
        </div>
        <div class="slarow__ex">пример: ${событие} пт 22:40 → истекает ${fmtDT(res.at)}</div>
      </div>`;
    }).join('');
  }

  function renderSla() {
    $('slaTbl').innerHTML = slaRows(S.sla, 'sla', 'передано');
    $('claimTbl').innerHTML = slaRows(S.claimSla, 'claim', 'обращение зарегистрировано');
  }

  /* ------------------------------------------------------------------
     Рендер: часовой пояс
     ------------------------------------------------------------------ */

  function renderTz() {
    $('tzSelect').innerHTML = TZS.map((t) =>
      `<option value="${t.id}"${t.id === S.tz ? ' selected' : ''}>${t.label}</option>`).join('');

    /* Примеры «Сейчас» и «Срок из калькулятора» убраны: карточка отвечает на
       вопрос «в каком поясе считает модуль», а не показывает часы. Разница
       поясов остаётся — но только когда она есть и, значит, о чём-то говорит. */
    const tz = TZS.find((t) => t.id === S.tz);
    const shift = tz.off - TZ_CALC;
    $('tzEx').innerHTML = shift
      ? `<div class="form__hint">Ваш пояс отличается от расчётного на ${shift > 0 ? '+' : ''}${shift} ч.
         В выгрузках, печатных формах и уведомлениях время всегда когалымское — иначе два экземпляра
         одного отчёта разойдутся, и спор перейдёт с существа на часовые пояса.</div>`
      : '<div class="form__hint">Ваш пояс совпадает с расчётным.</div>';
  }

  /* ------------------------------------------------------------------
     Рендер: календарь
     ------------------------------------------------------------------ */

  function renderCal() {
    $('yearTabs').innerHTML = [2026, 2027].map((y) =>
      `<button class="ytab${y === calYear ? ' is-on' : ''}" data-year="${y}">${y}</button>`).join('');

    const st = yearStats(calYear);
    $('calStats').innerHTML =
      `<b>${st.work}</b> рабочих дней · <b>${st.hours.toLocaleString('ru-RU')}</b> часов в окне ·
       праздничных <b>${st.hol}</b> · переносов <b>${st.off + st.extra}</b> · предпраздничных <b>${st.short}</b>`;

    $('legend').innerHTML = [
      ['k-hol', 'Нерабочий праздничный'],
      ['k-off', 'Перенесённый выходной'],
      ['k-work', 'Рабочий день (перенос)'],
      ['k-short', 'Предпраздничный — окно короче на час'],
      ['k-we', 'Выходной по базовому правилу'],
    ].map(([c, l]) => `<span class="leg"><i class="leg__d ${c}"></i>${l}</span>`).join('')
      + '<span class="leg leg__hint">Клик по дню — изменить</span>';

    const draft = calYear === 2027;
    $('calWarn').hidden = !draft;

    let html = '';
    for (let m = 0; m < 12; m++) {
      const first = new Date(calYear, m, 1);
      const lead = (first.getDay() + 6) % 7;           // неделя с понедельника
      const days = new Date(calYear, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<i class="cd cd--pad"></i>';
      for (let dn = 1; dn <= days; dn++) {
        const d = new Date(calYear, m, dn);
        const e = ex(d);
        const cls = ['cd'];
        if (e) cls.push(KINDS[e.kind].cls);
        else if (!isWorkday(d)) cls.push('k-we');
        if (e && e.draft) cls.push('is-draft');
        if (d < CONTRACT_FROM || d > CONTRACT_TO) cls.push('is-out');
        if (key(d) === key(NOW)) cls.push('is-now');
        const tip = e ? `${e.name} — ${KINDS[e.kind].label}` : (isWorkday(d) ? 'Рабочий день' : 'Выходной');
        cells += `<button class="${cls.join(' ')}" data-day="${key(d)}" title="${esc(fmtD(d))} — ${esc(tip)}">${dn}</button>`;
      }
      html += `<div class="calm"><div class="calm__h">${MONTHS[m]}</div>
        <div class="calm__w">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => `<i>${w}</i>`).join('')}</div>
        <div class="calm__g">${cells}</div></div>`;
    }
    $('calGrid').innerHTML = html;

    const list = Object.keys(S.cal).filter((k) => k.slice(0, 4) === String(calYear)).sort();
    $('calList').innerHTML = list.map((k) => {
      const e = S.cal[k];
      const d = new Date(k + 'T00:00:00');
      return `<div class="exi ${KINDS[e.kind].cls}">
        <span class="exi__d">${p2(d.getDate())}.${p2(d.getMonth() + 1)} <i>${WD[d.getDay()]}</i></span>
        <span class="exi__t">${esc(e.name)}${e.draft ? '<em>предварительно</em>' : ''}</span></div>`;
    }).join('') || '<div class="form__hint">Исключений нет — считается по базовому правилу.</div>';

    $('calLog').innerHTML = LOG.map((l) =>
      `<div class="log2__i"><div class="log2__d">${l.d}</div><div class="log2__t">${esc(l.t)}<span class="log2__w">${l.who}</span></div></div>`).join('');
  }

  /* ------------------------------------------------------------------
     Рендер: калькулятор
     ------------------------------------------------------------------ */

  const PRESETS = [
    ['Пятница 22:40, норматив 8 ч', '2026-08-07T22:40', 'II'],
    ['Суббота', '2026-08-08T12:00', 'II'],
    ['23:50, норматив 4 ч', '2026-08-06T23:50', 'I'],
    ['Перед праздником', '2026-11-03T22:30', 'II'],
    ['24 ч через выходные', '2026-08-07T15:00', 'III'],
    ['Новогодние каникулы', '2026-12-30T18:00', 'III'],
    ['Внутри окна', '2026-08-04T10:20', 'I'],
  ];

  function renderCalc() {
    $('calcAt').value = calcAt;
    $('calcPrio').innerHTML = PRIORITIES.map((p) =>
      `<button class="chip${p.code === calcPrio ? ' is-on' : ''}" data-prio="${p.code}">${p.code} — ${S.sla[p.code]} ч</button>`).join('');
    $('calcPresets').innerHTML = PRESETS.map(([l, v, pr], i) =>
      `<button class="chip${v === calcAt && pr === calcPrio ? ' is-on' : ''}" data-preset="${i}">${l}</button>`).join('');

    const sent = new Date(calcAt);
    if (isNaN(sent)) { $('calcVerdict').innerHTML = '<div class="form__err">Укажите момент передачи.</div>'; $('calcTrace').innerHTML = ''; return; }

    const norm = S.sla[calcPrio];
    const start = toWindow(sent);
    const r = addWorkHours(sent, norm);
    const moved = start.getTime() !== sent.getTime();
    const calHours = (r.at - sent) / 3600000;

    const e0 = ex(sent);
    const why = !isWorkday(sent)
      ? (e0 ? `${e0.name} — ${KINDS[e0.kind].label.toLowerCase()}` : 'выходной по базовому правилу')
      : (hOf(sent) < S.from ? `окно открывается в ${p2(S.from)}:00` : `окно закрылось в ${p2(closeAt(sent) === 24 ? 0 : closeAt(sent))}:00${closeAt(sent) !== S.to ? ' — предпраздничный день' : ''}`);

    $('calcVerdict').innerHTML = `
      <div class="verdict__k">Срок ответа истекает</div>
      <div class="verdict__v">${fmtDT(r.at)}</div>
      <div class="verdict__s">${fmtH(norm)} рабочих · ${fmtH(calHours)} календарных от момента передачи</div>`;

    const rows = [];
    rows.push(['1', 'Передано Заказчику', fmtDT(sent),
      moved ? `<span class="tr__no">вне рабочего окна: ${why}</span>` : 'внутри рабочего окна']);
    if (moved) {
      rows.push(['2', 'Перенос', fmtDT(start),
        `отсчёт начинается с открытия ближайшего рабочего дня — ожидание ${fmtH((start - sent) / 3600000)}`]);
    }
    rows.push([moved ? '3' : '2', 'Норматив', `${fmtH(norm)}`,
      `приоритет ${calcPrio} · рабочими часами, а не календарными`]);

    let n = moved ? 4 : 3;
    r.steps.forEach((s) => {
      const cl = closeAt(s.from);
      rows.push([String(n++), `${WD[s.from.getDay()]} ${fmtD(s.from)}`,
        `${fmtT(s.from)} → ${s.to.getHours() === 0 && s.to.getDate() !== s.from.getDate() ? '24:00' : fmtT(s.to)}`,
        `${fmtH(s.h)}${s.full ? ' — окно закрылось' + (cl !== S.to ? ' на час раньше, предпраздничный день' : '') : ' — норматив выбран'}`]);
    });
    rows.push([String(n), 'Истекает', fmtDT(r.at), 'после этого момента ответ считается полученным за пределами норматива']);

    let html = rows.map(([i, a, b, c]) =>
      `<div class="tr"><span class="tr__n">${i}</span><span class="tr__a">${a}</span><b class="tr__b">${b}</b><span class="tr__c">${c}</span></div>`).join('');

    $('calcTrace').innerHTML = html;
  }

  /* ------------------------------------------------------------------
     Рендер: сверка с Формой 2
     ------------------------------------------------------------------ */


  /* ------------------------------------------------------------------
     Сохранение
     ------------------------------------------------------------------ */

  function dirty() { return JSON.stringify(S) !== JSON.stringify(SAVED); }

  function renderDirty() {
    const d = dirty();
    $('dirtyNote').textContent = d ? 'Есть несохранённые изменения' : 'Изменений нет';
    $('dirtyNote').classList.toggle('is-dirty', d);
    $('btnRevert').disabled = !d;
    $('btnSave').disabled = !d;
  }

  function renderAll() {
    renderWindow(); renderSla(); renderTz(); renderCal(); renderCalc(); renderDirty();
  }

  /* ------------------------------------------------------------------
     События
     ------------------------------------------------------------------ */

  function bind() {
    $('workdays').addEventListener('click', (e) => {
      const b = e.target.closest('[data-wd]'); if (!b) return;
      const w = +b.dataset.wd;
      const i = S.days.indexOf(w);
      if (i >= 0) { if (S.days.length > 1) S.days.splice(i, 1); } else S.days.push(w);
      S.days.sort();
      renderAll();
    });

    $('wFrom').addEventListener('change', (e) => { S.from = +e.target.value; if (S.to <= S.from) S.to = S.from + 1; renderAll(); });
    $('wTo').addEventListener('change', (e) => { S.to = +e.target.value; renderAll(); });
    $('shortOn').addEventListener('change', (e) => { S.shortOn = e.target.checked; renderAll(); });

    const правкаНорматива = (e) => {
      const t = e.target;
      if (t.dataset.sla) S.sla[t.dataset.sla] = Math.max(1, +t.value || 1);
      if (t.dataset.claim) S.claimSla[t.dataset.claim] = Math.max(1, +t.value || 1);
      renderAll();
    };
    $('slaTbl').addEventListener('change', правкаНорматива);
    $('claimTbl').addEventListener('change', правкаНорматива);

    $('tzSelect').addEventListener('change', (e) => { S.tz = e.target.value; renderTz(); renderDirty(); });

    $('yearTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-year]'); if (!b) return;
      calYear = +b.dataset.year; renderCal();
    });

    $('calGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-day]'); if (!b) return;
      openDayPopover(b, b.dataset.day);
    });

    $('calcAt').addEventListener('input', (e) => { calcAt = e.target.value; renderCalc(); renderTz(); });
    $('calcPrio').addEventListener('click', (e) => {
      const b = e.target.closest('[data-prio]'); if (!b) return;
      calcPrio = b.dataset.prio; renderCalc(); renderTz();
    });
    $('calcPresets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]'); if (!b) return;
      const [, v, pr] = PRESETS[+b.dataset.preset];
      calcAt = v; calcPrio = pr; renderCalc(); renderTz();
    });

    $('btnRevert').addEventListener('click', () => { S = JSON.parse(JSON.stringify(SAVED)); renderAll(); });
    $('btnSave').addEventListener('click', () => {
      SAVED = JSON.parse(JSON.stringify(S));
      LOG.unshift({ d: `${fmtD(NOW)} ${fmtT(NOW)}`, who: 'Фатхутдинов Д.Ф.', t: 'Настройки сроков сохранены' });
      renderAll();
    });
  }

  /* Правка дня — поповер, а не перебор состояний по клику: состояний пять,
     перебирать их вслепую человек не станет, а промахнувшись — не заметит. */
  function openDayPopover(btn, k) {
    const pop = $('popover');
    const cur = S.cal[k] || null;
    const d = new Date(k + 'T00:00:00');
    const base = S.days.indexOf(d.getDay()) >= 0 ? 'рабочий' : 'выходной';
    const opts = [['', `По базовому правилу (${base})`]]
      .concat(Object.keys(KINDS).map((kk) => [kk, KINDS[kk].label]));

    pop.innerHTML = `<div class="popover__h">${fmtD(d)}, ${WD[d.getDay()]}</div>
      <div class="popover__list">${opts.map(([v, l]) =>
        `<label class="popover__row"><input type="radio" name="k" value="${v}"${(cur ? cur.kind : '') === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <input class="inp" id="popName" placeholder="Основание" value="${cur ? esc(cur.name) : ''}">
      <div class="popover__foot"><button class="btn" data-x="cancel">Отмена</button><button class="btn btn--accent" data-x="ok">Применить</button></div>`;
    pop.hidden = false;

    const r = btn.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 300) + 'px';
    pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';

    pop.onclick = (e) => {
      const x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'ok') {
        const kind = pop.querySelector('input[name=k]:checked').value;
        const name = $('popName').value.trim();
        if (!kind) delete S.cal[k];
        else S.cal[k] = { kind, name: name || KINDS[kind].label, draft: false };
        LOG.unshift({
          d: `${fmtD(NOW)} ${fmtT(NOW)}`, who: 'Фатхутдинов Д.Ф.',
          t: `${fmtD(d)} — ${kind ? KINDS[kind].label.toLowerCase() : 'снято исключение'}`,
        });
        renderAll();
      }
      pop.hidden = true; pop.onclick = null;
    };
  }

  /* Экспорт движка. Нужен ровно для одного: независимый node-скрипт грузит
     этот файл и data.js и сверяет два расчёта минута в минуту на случаях без
     праздников. Расхождение там означает ошибку здесь, а не «другую версию
     правил» — правило одно, реализации две. */
  const ENGINE = {
    toWindow, addWorkHours, isWorkday, inWindow, closeAt, yearStats, defaults,
    state: () => S,
    setState: (o) => { S = o; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;

  /* Разметка может отсутствовать: под node этот же файл грузится ради движка. */
  if (typeof document === 'undefined' || !document.getElementById('slaTbl')) return;

  window.SLA_ENGINE = ENGINE;

  document.addEventListener('click', (e) => {
    const pop = $('popover');
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-day]')) pop.hidden = true;
  }, true);

  bind();
  renderAll();
})();
