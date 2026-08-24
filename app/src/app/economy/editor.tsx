'use client';

/* Редактор экономической модели.
 *
 * Три решения, каждое расходится с макетом сознательно.
 *
 * 1. Просмотр и правка — разные режимы. В макете каждая числовая ячейка всегда
 *    была полем ввода. Экран из сотни полей читается как форма, а не как
 *    справка, и случайная правка четвёртого знака после запятой ничем не
 *    отличается от чтения. Здесь по умолчанию числа набраны числами, а вход в
 *    правку — отдельный жест: это граница ответственности, а не лишний клик.
 *    Ускоритель для тех, кто пришёл править: двойной клик по ячейке.
 *
 * 2. Пласты живут внутри строки месторождения, а не в своей вкладке. Пластовая
 *    ставка — подробность объекта; разводить их по вкладкам значит заставлять
 *    человека держать связь в голове.
 *
 * 3. Публикация — окно, а не выезжающая панель. Панель делила бы правый край с
 *    историей, а публикация атомарна и её нельзя делать краем глаза. В сводке
 *    показан и относительный сдвиг: скачок ставки в разы виден до публикации,
 *    а не в акте через месяц.
 *
 * Черновик живёт только здесь, в состоянии. Ничего не уходит на сервер до
 * публикации: применённая наполовину модель даёт сумму, которой не было ни в
 * одной редакции, и выглядит она правдоподобно.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronRightIcon, HistoryIcon, DownloadIcon, LockIcon, PencilLineIcon,
  CheckIcon, TriangleAlertIcon,
} from 'lucide-react';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import type { EconModel, EconField, EconChange } from '@/db/economy';
import { опубликовать, type Правка, type ОбластьПравки } from './actions';

/* ------------------------------ числа ------------------------------ */

/* Показываем ровно столько знаков, сколько есть: 12 480 остаётся «12 480», а
   1 030,25 — «1 030,25». Дописывать нули до четырёх знаков значит утверждать
   точность, которой в источнике нет. */
const показать = (v: number | null): string =>
  v === null ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 4 });

const вВвод = (v: number | null): string => (v === null ? '' : String(v).replace('.', ','));

/* Журнал хранит число строкой в машинном виде. Показывать его как есть значит
   ставить рядом «27885.7246» и «29 500,5» — одно и то же число двумя разными
   записями, и спор по акту начинается с вопроса, какая из них настоящая. */
const показатьЗапись = (s: string | null): string => {
  if (s === null || s === '') return '—';
  const n = Number(s);
  return Number.isFinite(n) ? показать(n) : s;
};

interface Разбор { value: number | null; error: string }

function разобрать(raw: string, nullable: boolean): Разбор {
  const текст = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (текст === '') {
    return nullable
      ? { value: null, error: '' }
      /* Пустое здесь — не «ставки нет», а «поле не заполнили»: цена нефти и
         ставка НДПИ участвуют в каждом расчёте. */
      : { value: null, error: 'Поле не может быть пустым.' };
  }
  const число = Number(текст);
  if (!Number.isFinite(число)) return { value: null, error: 'Введите число.' };
  if (число < 0) return { value: число, error: 'Значение не может быть отрицательным.' };
  return { value: число, error: '' };
}

const одинаковы = (a: number | null, b: number | null) => a === b;

/* ------------------------------ описание полей ------------------------------ */

interface СпецПоля { field: string; label: string; unit: string; full: string; nullable: boolean }

const СТАТЬИ: СпецПоля[] = [
  { field: 'eeLiquid', label: 'ЭЭ жидкость', unit: 'руб/т ж', full: 'Электроэнергия на подъём жидкости, руб/т жидкости', nullable: true },
  { field: 'eeOil', label: 'ЭЭ нефть', unit: 'руб/т н', full: 'Электроэнергия на нефть, руб/т нефти', nullable: true },
  { field: 'chem', label: 'Деэмульгаторы', unit: 'руб/т н', full: 'Деэмульгаторы, руб/т нефти', nullable: true },
];

const ключ = (scope: ОбластьПравки, id: number, field: string) => `${scope}:${id}:${field}`;

/* ------------------------------ состояние объекта ------------------------------ */

type Состояние = 'ready' | 'gaps' | 'noPlast' | 'outside';

function состояние(f: EconField): Состояние {
  if (!f.sourceName) return 'outside';
  if (f.eeLiquid === null || f.eeOil === null || f.chem === null) return 'gaps';
  if (!f.plasts.length) return 'noPlast';
  return 'ready';
}

const ПОДПИСЬ: Record<Состояние, string> = {
  ready: 'Готово к расчёту',
  gaps: 'Не все ставки заведены',
  noPlast: 'Нет ставок НДПИ',
  outside: 'Нет в модели Заказчика',
};

/* ------------------------------ склонения ------------------------------ */

function склонение(n: number, формы: [string, string, string]) {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return формы[2];
  if (b > 1 && b < 5) return формы[1];
  if (b === 1) return формы[0];
  return формы[2];
}

/* Счётчики здесь набраны обычным числом, а не пружинным `CountingNumber`.
   Пружина проезжает промежуточные значения, а склоняемое слово рядом считается
   по конечному — и полсекунды на экране висит «1 изменения». Анимированное
   число уместно там, где за ним не идёт согласуемое слово: так оно и стоит в
   плитках реестра. */
const датаВремя = (iso: string) => new Date(iso).toLocaleString('ru-RU',
  { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ------------------------------ типы пропсов ------------------------------ */

export interface ВерсияПропс {
  id: number;
  version: string;
  at: string;
  effectiveFrom: string;
  actorName: string;
  reason: string;
  changes: EconChange[];
}

interface Изменение {
  k: string;
  scope: ОбластьПравки;
  id: number;
  field: string;
  поле: string;
  объект: string;
  было: number | null;
  стало: number | null;
  ошибка: string;
}

/* ========================================================================== */

export function Редактор({
  модель, версии, можноПравить,
}: {
  модель: EconModel;
  версии: ВерсияПропс[];
  можноПравить: boolean;
}) {
  const router = useRouter();
  const [режим, setРежим] = React.useState<'view' | 'edit'>('view');
  const [черновик, setЧерновик] = React.useState<Record<string, string>>({});
  const [отбор, setОтбор] = React.useState<Состояние | null>(null);
  const [раскрыты, setРаскрыты] = React.useState<Record<number, boolean>>({});
  const [окноПубликации, setОкноПубликации] = React.useState(false);
  const [историяОткрыта, setИсторияОткрыта] = React.useState(false);
  const [причина, setПричина] = React.useState('');
  const [отказ, setОтказ] = React.useState('');
  const [свежие, setСвежие] = React.useState<Set<string>>(new Set());
  const [идёт, начать] = React.useTransition();

  /* Куда вернуть фокус после входа в режим правки двойным кликом: без этого
     двойной клик переключал режим, а курсор оставался нигде. */
  const фокусНа = React.useRef<string | null>(null);
  const полосаRef = React.useRef<HTMLDivElement>(null);

  const исходное = React.useCallback((scope: ОбластьПравки, id: number, field: string): number | null => {
    if (scope === 'global') return модель.oilPrice;
    if (scope === 'field') {
      const f = модель.fields.find((x) => x.fieldId === id);
      return (f?.[field as 'eeLiquid' | 'eeOil' | 'chem'] ?? null) as number | null;
    }
    for (const f of модель.fields) {
      const p = f.plasts.find((x) => x.id === id);
      if (p) return p.rate;
    }
    return null;
  }, [модель]);

  const изменения = React.useMemo<Изменение[]>(() => {
    const список: Изменение[] = [];
    for (const [k, raw] of Object.entries(черновик)) {
      const [scope, sid, field] = k.split(':') as [ОбластьПравки, string, string];
      const id = Number(sid);
      const nullable = scope === 'field';
      const { value, error } = разобрать(raw, nullable);
      const было = исходное(scope, id, field);
      if (!error && одинаковы(value, было)) continue;

      let объект = 'Общие параметры';
      let поле = 'Цена нефти';
      if (scope === 'field') {
        объект = модель.fields.find((x) => x.fieldId === id)?.fieldName ?? '—';
        поле = СТАТЬИ.find((s) => s.field === field)?.label ?? field;
      } else if (scope === 'ndpi') {
        for (const f of модель.fields) {
          const p = f.plasts.find((x) => x.id === id);
          if (p) { объект = `${f.fieldName} — ${p.plast}`; поле = 'Ставка НДПИ'; break; }
        }
      }
      список.push({ k, scope, id, field, поле, объект, было, стало: value, ошибка: error });
    }
    return список;
  }, [черновик, исходное, модель]);

  const ошибок = изменения.filter((и) => и.ошибка).length;
  const очищаемые = изменения.filter((и) => !и.ошибка && и.стало === null);

  /* Готовность считается по тем же правилам, что и расчёт: объект годен,
     когда он есть в модели Заказчика, все три статьи заведены и у него есть
     пластовая ставка. Считать «сколько строк в таблице» бессмысленно — строки
     есть всегда, а деньги считаются не по всем. */
  const группы = React.useMemo(() => {
    const счёт: Record<Состояние, number> = { ready: 0, gaps: 0, noPlast: 0, outside: 0 };
    for (const f of модель.fields) счёт[состояние(f)] += 1;
    return счёт;
  }, [модель]);

  const строки = отбор ? модель.fields.filter((f) => состояние(f) === отбор) : модель.fields;

  /* ---------------------------- жесты ---------------------------- */

  function править(k?: string) {
    if (!можноПравить) return;
    if (k) фокусНа.current = k;
    setРежим('edit');
  }

  React.useEffect(() => {
    if (режим !== 'edit' || !фокусНа.current) return;
    const поле = document.querySelector<HTMLInputElement>(`[data-k="${CSS.escape(фокусНа.current)}"]`);
    фокусНа.current = null;
    поле?.focus();
    поле?.select();
  }, [режим]);

  function правка(k: string, raw: string) {
    setЧерновик((ч) => ({ ...ч, [k]: raw }));
  }

  function отменитьВсё() {
    setЧерновик({}); setОтказ('');
  }

  function выйти() {
    if (изменения.length) {
      полосаRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    setЧерновик({}); setРежим('view');
  }

  function публиковать() {
    setОтказ('');
    const пакет: Правка[] = изменения.map((и) => ({
      scope: и.scope, id: и.id, field: и.field, value: и.стало,
    }));
    const ключи = new Set(изменения.map((и) => и.k));
    начать(async () => {
      const итог = await опубликовать(пакет, причина);
      if (итог.error) { setОтказ(итог.error); return; }
      setОкноПубликации(false);
      setПричина('');
      setЧерновик({});
      setРежим('view');
      setСвежие(ключи);
      router.refresh();
      /* Подтверждение цветом живёт меньше секунды: оно говорит «эти числа
         только что изменились», а не подсвечивает их навсегда. */
      setTimeout(() => setСвежие(new Set()), 1400);
    });
  }

  function выгрузить() {
    const строкиCSV = [['Месторождение', 'В модели Заказчика', 'ЭЭ жидкость', 'ЭЭ нефть', 'Деэмульгаторы', 'Пласт', 'Ставка НДПИ']];
    for (const f of модель.fields) {
      const общее = [f.fieldName, f.sourceName ?? '', показать(f.eeLiquid), показать(f.eeOil), показать(f.chem)];
      if (!f.plasts.length) строкиCSV.push([...общее, '', '']);
      for (const p of f.plasts) строкиCSV.push([...общее, p.plast, показать(p.rate)]);
    }
    строкиCSV.push([]);
    строкиCSV.push(['Цена нефти, руб/т', показать(модель.oilPrice)]);
    const текст = строкиCSV.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    /* BOM — чтобы Excel открыл кириллицу, а не «Ð—Ð°Ð¿Ð°Ð´Ð½Ð¾». */
    const blob = new Blob([`﻿${текст}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `экономическая-модель-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const действующая = версии[0];

  /* ---------------------------- разметка ---------------------------- */

  return (
    <main className="content econ" data-edit={режим === 'edit' ? 'on' : undefined}>
      <div className="pagehead">
        <h1>Экономическая модель</h1>
        <div className="pagehead__actions">
          <button type="button" className="btn" onClick={() => setИсторияОткрыта(true)}>
            <HistoryIcon size={16} />История
          </button>
          <button type="button" className="btn" onClick={выгрузить} title="Выгрузить модель в CSV для протокола">
            <DownloadIcon size={16} />Выгрузить
          </button>
          {можноПравить ? (
            режим === 'view'
              ? (
                <button type="button" className="btn btn--accent" onClick={() => править()}>
                  <PencilLineIcon size={16} />Править
                </button>
              )
              : (
                <button
                  type="button" className="btn" onClick={выйти}
                  title={изменения.length ? 'Есть неопубликованные правки — опубликуйте или отмените их внизу' : undefined}
                >
                  <CheckIcon size={16} />Готово
                </button>
              )
          ) : (
            <span className="econlock" title="Право выдаёт администратор модуля в разделе «Пользователи и роли»">
              <LockIcon size={14} />Только просмотр
            </span>
          )}
        </div>
      </div>

      <div className="econtop">
        <section className="panel eprice" aria-labelledby="econPriceTitle">
          <h2 id="econPriceTitle" className="eprice__t">Цена нефти</h2>
          <Ячейка
            k={ключ('global', 0, 'oilPrice')}
            значение={черновик[ключ('global', 0, 'oilPrice')]}
            исходное={модель.oilPrice}
            nullable={false}
            режим={режим}
            можно={можноПравить}
            свежая={свежие.has(ключ('global', 0, 'oilPrice'))}
            подпись="Цена нефти, руб/т"
            крупно
            onEdit={править}
            onChange={правка}
          />
          <p className="eprice__u">руб / т нефти</p>
          <p className="eprice__n">
            Единая на весь горизонт договора. Умножается на всю добытую нефть, поэтому
            входит в каждую сумму эффекта.
          </p>
        </section>

        <section className="panel eready" aria-labelledby="econReadyTitle">
          <div className="eready__main">
          <h2 id="econReadyTitle" className="eready__t">Готовность модели</h2>
          <p className="eready__l">
            Расчёт возможен по{' '}
            <b>{группы.ready}</b>
            {' '}{склонение(группы.ready, ['месторождению', 'месторождениям', 'месторождениям'])}
            {' из '}{модель.fields.length}
          </p>
          <div className="eready__chips">
            {(['ready', 'gaps', 'noPlast', 'outside'] as Состояние[])
              .filter((с) => группы[с] > 0)
              .map((с) => (
                <button
                  key={с} type="button"
                  className={`echip echip--${с}${отбор === с ? ' is-on' : ''}`}
                  aria-pressed={отбор === с}
                  onClick={() => setОтбор((т) => (т === с ? null : с))}
                >
                  <span className="echip__n">{группы[с]}</span>
                  {ПОДПИСЬ[с]}
                </button>
              ))}
          </div>
          {/* Скважины — не строка таблицы, отобрать по ним нечего. Поэтому это
              фраза, а не чип: чип рядом с настоящими фильтрами обещал бы отбор,
              которого не произойдёт. */}
          {модель.wellsUnbound > 0 && (
            <p className="eready__wells">
              Кроме того, <b>{модель.wellsUnbound}</b>{' '}
              {склонение(модель.wellsUnbound, ['скважина', 'скважины', 'скважин'])}{' '}
              {склонение(модель.wellsUnbound, ['с рекомендациями не привязана', 'с рекомендациями не привязаны', 'с рекомендациями не привязаны'])}
              {' '}к пластовой ставке — расчёт эффекта по ним остановится.
            </p>
          )}
          {отбор && (
            <button type="button" className="eready__reset" onClick={() => setОтбор(null)}>
              Показать все месторождения
            </button>
          )}
          </div>

          {/* Действующая редакция стоит здесь, а не строкой под заголовком
              страницы. «По чему считаем» и «какой редакцией» — один вопрос, и
              мелкая подпись под названием экрана на него не отвечала: её никто
              не читал. Номер открывает историю: он же и есть вход в неё. */}
          <div className="eready__ver">
            <h2 className="eready__t">Действующая редакция</h2>
            {действующая ? (
              <>
                <button
                  type="button" className="econver econver--btn"
                  onClick={() => setИсторияОткрыта(true)}
                >
                  {действующая.version}
                </button>
                <p className="eready__vm">
                  {датаВремя(действующая.effectiveFrom)}
                  <br />{действующая.actorName}
                </p>
                <p className="eready__vr" title={действующая.reason}>{действующая.reason}</p>
              </>
            ) : (
              <p className="eready__vm">
                Не опубликована.<br />Значения загружены при развёртывании.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="panel etable" aria-label="Ставки по месторождениям">
        <div className="erow erow--head" role="row">
          <div className="ecol ecol--name">Месторождение</div>
          {СТАТЬИ.map((с) => (
            <div key={с.field} className="ecol ecol--num" title={с.full}>
              {с.label}<span className="ecol__u">{с.unit}</span>
            </div>
          ))}
          <div className="ecol ecol--ndpi" title="Ставка НДПИ + НДД, руб/т нефти. Задаётся по паре «месторождение + пласт».">
            НДПИ<span className="ecol__u">руб/т н</span>
          </div>
          <div className="ecol ecol--st" />
        </div>

        {строки.map((f, i) => (
          <Строка
            key={f.fieldId}
            поле={f}
            индекс={i}
            режим={режим}
            можно={можноПравить}
            черновик={черновик}
            свежие={свежие}
            открыта={!!раскрыты[f.fieldId]}
            onToggle={() => setРаскрыты((р) => ({ ...р, [f.fieldId]: !р[f.fieldId] }))}
            onEdit={править}
            onChange={правка}
          />
        ))}

        {!строки.length && (
          <p className="etable__empty">В этой группе месторождений нет.</p>
        )}
      </section>

      {/* -------------------------- полоса черновика -------------------------- */}
      <AnimatePresence>
        {режим === 'edit' && изменения.length > 0 && (
          <motion.div
            ref={полосаRef}
            className="ebar"
            initial={{ y: 72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 72, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, bounce: 0 }}
          >
            <div className="ebar__l">
              <b>{изменения.length}</b>{' '}
              {склонение(изменения.length, ['изменение', 'изменения', 'изменений'])} в черновике
              {ошибок > 0 && (
                <span className="ebar__err">
                  <TriangleAlertIcon size={14} />
                  {ошибок}{' '}
                  {склонение(ошибок, ['значение не принято', 'значения не приняты', 'значений не приняты'])}
                </span>
              )}
            </div>
            <div className="ebar__r">
              <button type="button" className="btn btn--ghost" onClick={отменитьВсё}>Отменить всё</button>
              <button
                type="button" className="btn btn--accent"
                onClick={() => {
                  if (ошибок) {
                    const первая = изменения.find((и) => и.ошибка)!;
                    document.querySelector<HTMLInputElement>(`[data-k="${CSS.escape(первая.k)}"]`)?.focus();
                    return;
                  }
                  setОкноПубликации(true);
                }}
              >
                Опубликовать редакцию
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* -------------------------- окно публикации -------------------------- */}
      <ActionDialog
        title="Публикация редакции"
        className="econpub"
        open={окноПубликации}
        onOpenChange={(o) => { setОкноПубликации(o); if (!o) setОтказ(''); }}
      >
        <div className="pub">
          <p className="pub__sum">
            {изменения.length}{' '}
            {склонение(изменения.length, ['изменение', 'изменения', 'изменений'])}
            {' в '}{new Set(изменения.map((и) => и.объект)).size}{' '}
            {склонение(new Set(изменения.map((и) => и.объект)).size, ['объекте', 'объектах', 'объектах'])}.
            Редакция вступает в силу сразу; расчёты, уже сделанные по прежним параметрам,
            не пересчитываются.
          </p>

          {/* Очистка ставки в общем списке выглядит такой же будничной правкой,
              как смена числа, — а это перевод месторождения в «не считается».
              Разница видна только тому, кто помнит, что пустая статья
              останавливает расчёт; предупреждение говорит это вслух. */}
          {очищаемые.length > 0 && (
            <p className="pub__warn">
              <TriangleAlertIcon size={16} />
              <span>
                {очищаемые.length}{' '}
                {склонение(очищаемые.length, ['статья очищается', 'статьи очищаются', 'статей очищается'])}:
                расчёт эффекта по{' '}
                {склонение(new Set(очищаемые.map((и) => и.объект)).size, ['этому месторождению остановится', 'этим месторождениям остановится', 'этим месторождениям остановится'])}.
              </span>
            </p>
          )}

          <ul className="pub__list">
            {изменения.map((и) => (
              <li key={и.k} className={`pub__row${и.стало === null ? ' pub__row--clear' : ''}`}>
                <span className="pub__obj">{и.объект}</span>
                <span className="pub__f">{и.поле}</span>
                <span className="pub__v">
                  <span className="pub__old">{показать(и.было)}</span>
                  <span className="pub__arr">→</span>
                  <span className="pub__new">{и.стало === null ? 'не задано' : показать(и.стало)}</span>
                  {и.было !== null && и.было !== 0 && и.стало !== null && (
                    <span className={`pub__d${и.стало >= и.было ? ' pub__d--up' : ' pub__d--down'}`}>
                      {и.стало >= и.было ? '+' : '−'}
                      {(Math.abs(и.стало - и.было) / и.было * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <label className="pub__reason">
            <span>Причина изменения</span>
            <textarea
              value={причина}
              onChange={(e) => setПричина(e.target.value)}
              placeholder="Например: актуализация ставок по письму Заказчика от 20.08.2026"
              rows={3}
            />
          </label>

          {отказ && <p className="pub__error">{отказ}</p>}

          <div className="pub__act">
            <button
              type="button" className="btn btn--accent" onClick={публиковать} disabled={идёт}
            >
              {идёт ? 'Публикуем…' : 'Опубликовать'}
            </button>
            <button type="button" className="btn" onClick={() => setОкноПубликации(false)}>Вернуться</button>
          </div>
        </div>
      </ActionDialog>

      {/* -------------------------- история -------------------------- */}
      <Sheet open={историяОткрыта} onOpenChange={setИсторияОткрыта}>
        <SheetContent side="right" className="econhistory">
          <SheetHeader>
            <SheetTitle>История редакций</SheetTitle>
            <SheetDescription>
              Каждая редакция — один пакет правок с причиной. Расчёт эффекта запоминает
              редакцию, по которой сделан.
            </SheetDescription>
          </SheetHeader>
          <div className="ehist">
            {версии.map((v) => (
              <article key={v.id} className="ehist__v">
                <header className="ehist__h">
                  <span className="econver">{v.version}</span>
                  <span className="ehist__at">{датаВремя(v.at)}</span>
                </header>
                <p className="ehist__r">{v.reason}</p>
                <p className="ehist__a">{v.actorName}</p>
                {v.changes.length > 0 && (
                  <ul className="ehist__list">
                    {v.changes.map((c, i) => (
                      <li key={i}>
                        <span className="pub__obj">{c.object}</span>
                        <span className="pub__f">{c.field}</span>
                        <span className="pub__v">
                          <span className="pub__old">{показатьЗапись(c.old)}</span>
                          <span className="pub__arr">→</span>
                          <span className="pub__new">{показатьЗапись(c.new)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
            {!версии.length && (
              <p className="ehist__empty">
                Редакций пока нет. Первая появится после первой публикации правок.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}

/* ------------------------------ строка объекта ------------------------------ */

function Строка({
  поле, индекс, режим, можно, черновик, свежие, открыта, onToggle, onEdit, onChange,
}: {
  поле: EconField;
  индекс: number;
  режим: 'view' | 'edit';
  можно: boolean;
  черновик: Record<string, string>;
  свежие: Set<string>;
  открыта: boolean;
  onToggle: () => void;
  onEdit: (k?: string) => void;
  onChange: (k: string, raw: string) => void;
}) {
  const сост = состояние(поле);
  const многоПластов = поле.plasts.length > 1;
  const одинПласт = поле.plasts.length === 1 ? поле.plasts[0] : null;

  /* Каскад при входе в правку: подложки ячеек проявляются построчно, чтобы
     смена режима была замечена глазом. Задержка через переменную, а не через
     JS-таймеры: анимация из ста ячеек в таймерах — потерянные кадры. */
  const стиль = { '--i': индекс } as React.CSSProperties;

  const сводкаНДПИ = многоПластов
    ? `${поле.plasts.length} ${склонение(поле.plasts.length, ['пласт', 'пласта', 'пластов'])} · ${показать(Math.min(...поле.plasts.map((p) => p.rate)))} – ${показать(Math.max(...поле.plasts.map((p) => p.rate)))}`
    : null;

  const шапка = (
    <div className={`erow erow--field${открыта ? ' is-open' : ''}`} data-state={сост} style={стиль}>
      <div className="ecol ecol--name">
        {многоПластов ? (
          <CollapsibleTrigger asChild>
            <button type="button" className="ename ename--btn">
              <ChevronRightIcon size={14} className="ename__c" />
              <span className="ename__t">{поле.fieldName}</span>
            </button>
          </CollapsibleTrigger>
        ) : (
          <span className="ename"><span className="ename__t">{поле.fieldName}</span></span>
        )}
      </div>

      {СТАТЬИ.map((с) => {
        const k = ключ('field', поле.fieldId, с.field);
        return (
          <Ячейка
            key={с.field} k={k}
            значение={черновик[k]}
            исходное={поле[с.field as 'eeLiquid' | 'eeOil' | 'chem']}
            nullable
            режим={поле.sourceName ? режим : 'view'}
            можно={можно && !!поле.sourceName}
            свежая={свежие.has(k)}
            подпись={`${поле.fieldName} — ${с.full}`}
            onEdit={onEdit} onChange={onChange}
          />
        );
      })}

      <div className="ecol ecol--ndpi">
        {одинПласт ? (
          <span className="endpi">
            {/* Пласт стоит слева от ставки, а не справа: справа он сдвигал бы
                число внутрь, и в одном столбце оказывались бы два правых края —
                у месторождений с одним пластом и у всех остальных. */}
            <span className="endpi__p" title={одинПласт.plast}>{одинПласт.plast}</span>
            <Ячейка
              k={ключ('ndpi', одинПласт.id, 'rate')}
              значение={черновик[ключ('ndpi', одинПласт.id, 'rate')]}
              исходное={одинПласт.rate}
              nullable={false}
              режим={режим}
              можно={можно}
              свежая={свежие.has(ключ('ndpi', одинПласт.id, 'rate'))}
              подпись={`${поле.fieldName} — ставка НДПИ по пласту ${одинПласт.plast}`}
              голая
              onEdit={onEdit} onChange={onChange}
            />
          </span>
        ) : сводкаНДПИ ? (
          <span className="endpi__sum" title={сводкаНДПИ}>{сводкаНДПИ}</span>
        ) : (
          <span className="enone">—</span>
        )}
      </div>

      <div className="ecol ecol--st">
        <span className={`emark emark--${сост}`} title={ПОДПИСЬ[сост]} aria-label={ПОДПИСЬ[сост]} />
      </div>
    </div>
  );

  if (!многоПластов) return шапка;

  return (
    <Collapsible open={открыта} onOpenChange={onToggle}>
      {шапка}
      <CollapsibleContent>
        <div className="eplasts">
          {поле.plasts.map((p) => {
            const k = ключ('ndpi', p.id, 'rate');
            return (
              <div key={p.id} className="erow erow--plast" style={стиль}>
                <div className="ecol ecol--name"><span className="eplast__n" title={p.plast}>{p.plast}</span></div>
                <div className="ecol ecol--num" />
                <div className="ecol ecol--num" />
                <div className="ecol ecol--num" />
                <div className="ecol ecol--ndpi">
                  <Ячейка
                    k={k} значение={черновик[k]} исходное={p.rate} nullable={false}
                    режим={режим} можно={можно} свежая={свежие.has(k)}
                    подпись={`${поле.fieldName} — ставка НДПИ по пласту ${p.plast}`}
                    голая
                    onEdit={onEdit} onChange={onChange}
                  />
                </div>
                <div className="ecol ecol--st" />
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------ числовая ячейка ------------------------------ */

function Ячейка({
  k, значение, исходное, nullable, режим, можно, свежая, подпись, крупно, голая,
  onEdit, onChange,
}: {
  k: string;
  значение: string | undefined;
  исходное: number | null;
  nullable: boolean;
  режим: 'view' | 'edit';
  можно: boolean;
  свежая: boolean;
  подпись: string;
  крупно?: boolean;
  голая?: boolean;
  onEdit: (k?: string) => void;
  onChange: (k: string, raw: string) => void;
}) {
  const правится = значение !== undefined;
  const разбор = правится ? разобрать(значение, nullable) : null;
  const изменено = правится && !разбор!.error && !одинаковы(разбор!.value, исходное);
  const ошибка = разбор?.error ?? '';

  const классы = [
    голая || крупно ? 'ecellbox' : 'ecol ecol--num ecellbox',
    крупно ? 'ecellbox--big' : '',
    /* Подложка ставится по самой ячейке, а не по режиму страницы: у объекта
       вне модели Заказчика править нечего, и «взведённый» вид обещал бы
       правку, которой не будет. */
    режим === 'edit' ? 'is-armed' : '',
    изменено ? 'is-dirty' : '',
    ошибка ? 'has-error' : '',
    свежая ? 'is-fresh' : '',
  ].filter(Boolean).join(' ');

  if (режим === 'view') {
    return (
      <div
        className={классы}
        title={ошибка || подпись}
        onDoubleClick={() => можно && onEdit(k)}
      >
        <span className={`enum${исходное === null ? ' enum--none' : ''}`}>{показать(исходное)}</span>
      </div>
    );
  }

  return (
    <div className={классы} title={ошибка || подпись}>
      <input
        className="enum enum--in"
        data-k={k}
        value={значение ?? вВвод(исходное)}
        onChange={(e) => onChange(k, e.target.value)}
        inputMode="decimal"
        placeholder={nullable ? 'не задано' : '—'}
        aria-label={подпись}
        aria-invalid={!!ошибка}
        readOnly={!можно}
      />
      {ошибка && <span className="ecellbox__e">{ошибка}</span>}
    </div>
  );
}
