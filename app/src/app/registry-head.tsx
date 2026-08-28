'use client';

/* Шапка реестра — сортировка, поиск, фильтры и период, перенесённые из
 * макета (см. openFilterPopover / openTextPopover / openPeriodPopover в
 * app.js) на URL-параметры вместо клиентского состояния: отбор считает
 * сервер, а не браузер, ссылка на отфильтрованный реестр остаётся рабочей
 * сама по себе. Анимации — animate-ui поверх тех же классов и токенов,
 * что в registry.css: скользящая подсветка строк чек-листа (Highlight) и
 * пружинный поворот стрелки сортировки вместо CSS-transform.
 */

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Checkbox } from '@/components/ui/Checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight';
import { Hint } from '@/components/ui/Hint';
import { firstDir, type ColDef } from './registry-columns';
import type { FacetOption } from '@/db/recommendations';

export interface HeadState {
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  period: string;
  colFilters: Record<string, string[]>;
  text: Record<string, string>;
}

/* Общее место для мутации адреса: любое изменение отбора сбрасывает
 * страницу пагинации на первую — иначе после фильтра можно провалиться на
 * несуществующую страницу за пределами нового набора. */
function useОтбор() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  return React.useCallback((mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(sp.toString());
    next.delete('page');
    mutate(next);
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }, [router, pathname, sp]);
}

/* Минимальная ширина колонки при перетаскивании — как в макете (MIN_COL_W). */
const MIN_COL_W = 56;

/* Перетаскивание границы колонки: перенесено из макета (app.js: startResize /
   mousemove / mouseup), но там колонки жили в px без авто-растяжения, а тут
   <col> держат проценты от суммы, чтобы таблица тянулась на всю ширину
   контейнера (решение из "Реестр: таблица растягивается..."). Ширина самой
   <table> не трогается (остаётся 100% из разметки) — меняются только доли
   колонок и min-width; иначе таблица зафиксировалась бы в px и переставала
   бы тянуться на всю ширину контейнера при следующем изменении окна. */
function useColumnResize(theadRef: React.RefObject<HTMLTableSectionElement | null>) {
  const dragRef = React.useRef<{ key: string; startX: number; cols: { key: string; px: number }[] } | null>(null);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const rz = target.closest('[data-resize]') as HTMLElement | null;
      if (!rz) return;
      const table = theadRef.current?.closest('table');
      if (!table) return;
      const key = rz.dataset.resize!;
      const ths = Array.from(table.querySelectorAll('thead th[data-col]')) as HTMLElement[];
      const cols = ths.map((th) => ({ key: th.dataset.col!, px: th.getBoundingClientRect().width }));
      dragRef.current = { key, startX: e.clientX, cols };
      document.body.classList.add('is-resizing');
      e.preventDefault();
    };

    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const table = theadRef.current?.closest('table') as HTMLTableElement | null;
      if (!table) return;
      const delta = e.clientX - drag.startX;
      const widths = drag.cols.map((c) => (c.key === drag.key ? Math.max(MIN_COL_W, c.px + delta) : c.px));
      const total = widths.reduce((s, w) => s + w, 0);
      const colEls = Array.from(table.querySelectorAll('colgroup col')) as HTMLTableColElement[];
      colEls.forEach((col, i) => { if (widths[i] != null) col.style.width = `${(widths[i] / total) * 100}%`; });
      table.style.minWidth = `${total}px`;
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.classList.remove('is-resizing');
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [theadRef]);
}

export function RegistryHead({ state, columns }: { state: HeadState; columns: ColDef[] }) {
  const отбор = useОтбор();
  const theadRef = React.useRef<HTMLTableSectionElement>(null);
  useColumnResize(theadRef);

  const onSort = (key: string) => отбор((p) => {
    const first = firstDir(key);
    const cur = state.sort;
    if (!cur || cur.key !== key) p.set('sort', `${key}:${first}`);
    else if (cur.dir === first) p.set('sort', `${key}:${first === 'asc' ? 'desc' : 'asc'}`);
    else p.delete('sort');
  });

  return (
    <thead ref={theadRef}>
      <tr>
        {columns.map((c) => {
          const isSort = state.sort?.key === c.key;
          const dir = isSort ? state.sort!.dir : firstDir(c.key);
          const hint = !isSort ? `${c.label} — сортировать`
            : dir === firstDir(c.key) ? `${c.label} — сменить направление` : `${c.label} — отключить сортировку`;
          const filterOn = c.kind === 'filter'
            ? Boolean(state.colFilters[c.key]?.length)
            : c.kind === 'text'
              ? Boolean(state.text[c.key])
              : c.kind === 'search'
                ? Boolean(state.text[c.key])
                : c.kind === 'period' && Boolean(state.period);

          return (
            <th key={c.key} data-col={c.key}>
              <span className="th">
                <Hint text={hint}>
                  <span
                    className={`th__t ${isSort ? 'is-sorted' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSort(c.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSort(c.key); }}
                  >
                    <span className="th__label">{c.label}</span>
                    {isSort && (
                      <motion.svg
                        className="ic-th th__arrow"
                        initial={false}
                        animate={{ rotate: dir === 'asc' ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      >
                        <use href="#i-sort" />
                      </motion.svg>
                    )}
                  </span>
                </Hint>

                {c.kind === 'search' && (
                  <TextPopover col={c} filterOn={filterOn} value={state.text[c.key] ?? ''}
                    отбор={отбор} title="Поиск по номеру" placeholder="Номер рекомендации…" />
                )}
                {c.kind === 'text' && (
                  <TextPopover col={c} filterOn={filterOn} value={state.text[c.key] ?? ''}
                    отбор={отбор} title="Поиск по тексту" placeholder="Поиск по тексту…" />
                )}
                {c.kind === 'filter' && (
                  <FilterPopover col={c} filterOn={filterOn} selected={state.colFilters[c.key] ?? []} отбор={отбор} />
                )}
                {c.kind === 'period' && (
                  <PeriodPopover filterOn={filterOn} value={state.period} отбор={отбор} />
                )}
              </span>
              <span className="resizer" data-resize={c.key} />
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/* ------------------------------ текстовый поиск ------------------------------ */

function TextPopover({
  col, filterOn, value, отбор, title, placeholder,
}: {
  col: ColDef; filterOn: boolean; value: string;
  отбор: (m: (p: URLSearchParams) => void) => void;
  title: string; placeholder: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState(value);
  const [suggestions, setSuggestions] = React.useState<FacetOption[]>([]);
  const [ищем, setИщем] = React.useState(false);
  React.useEffect(() => { if (open) setQ(value); }, [open, value]);

  /* Подсказки — по введённой строке, с задержкой, чтобы не долбить сервер
     на каждый символ; пустое поле подсказок не показывает — их пока не по
     чему строить. Пока запрос не ответил, список подсказок молча не менялся —
     набор из пары букв, для которых ничего не нашлось, было не отличить от
     ещё не пришедшего ответа. */
  React.useEffect(() => {
    if (!open || !q.trim()) { setSuggestions([]); setИщем(false); return; }
    let live = true;
    setИщем(true);
    const t = setTimeout(() => {
      fetch(`/api/registry/facet?col=${col.key}&q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((data) => { if (live) { setSuggestions(data.options ?? []); setИщем(false); } });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [open, q, col.key]);

  const apply = (v: string = q) => {
    отбор((p) => { const vv = v.trim(); if (vv) p.set(col.key, vv); else p.delete(col.key); });
    setOpen(false);
  };
  const reset = () => {
    отбор((p) => p.delete(col.key));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint text={title}>
        <PopoverTrigger asChild>
          <span className={`th__i ${filterOn ? 'is-on' : ''}`} role="button" tabIndex={0}>
            <svg className="ic-th"><use href="#i-search" /></svg>
          </span>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="flex min-w-[240px] max-w-[320px] flex-col gap-[var(--group-gap-s)] p-[var(--group-padding-s)]" align="start">
        <label className="field">
          {ищем
            ? <Spinner className="ic16 field__icon" />
            : <svg className="ic16 field__icon"><use href="#i-search" /></svg>}
          <input
            autoFocus
            type="search"
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
          />
        </label>

        {q.trim() && suggestions.length > 0 && (
          <div className="popover__list popover__list--suggest">
            {suggestions.map((o) => (
              <button
                key={o.value}
                type="button"
                className="popover__row popover__row--btn"
                onClick={() => apply(o.value)}
              >
                <span>{o.label}</span>
                <small>{o.count}</small>
              </button>
            ))}
          </div>
        )}

        <div className="popover__foot">
          <button type="button" className="btn btn--accent" onClick={() => apply()}>Применить</button>
          <button type="button" className="btn" onClick={reset}>Сбросить</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------ период ------------------------------ */

const ПЕРИОДЫ: [string, string][] = [
  ['', 'весь период'], ['7', 'последние 7 дней'], ['30', 'последние 30 дней'], ['month', 'текущий месяц'],
];

function PeriodPopover({ filterOn, value, отбор }: {
  filterOn: boolean; value: string; отбор: (m: (p: URLSearchParams) => void) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const choose = (v: string) => {
    отбор((p) => { if (v) p.set('period', v); else p.delete('period'); });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint text="Выбрать период">
        <PopoverTrigger asChild>
          <span className={`th__i ${filterOn ? 'is-on' : ''}`} role="button" tabIndex={0}>
            <svg className="ic-th"><use href="#i-funnel" /></svg>
          </span>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="flex min-w-[240px] max-w-[320px] flex-col gap-[var(--group-gap-s)] p-[var(--group-padding-s)]" align="start">
        <Highlight
          as="div"
          mode="parent"
          controlledItems
          value={value}
          containerClassName="popover__list"
          style={{ background: 'var(--state-hover)', borderRadius: 6 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        >
          {ПЕРИОДЫ.map(([v, l]) => (
            <HighlightItem key={v} value={v} asChild>
              <label className="popover__row" onClick={() => choose(v)}>
                <input type="radio" name="per" readOnly checked={value === v} />
                <span>{l}</span>
              </label>
            </HighlightItem>
          ))}
        </Highlight>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------ чек-лист значений ------------------------------ */

function FilterPopover({ col, filterOn, selected, отбор }: {
  col: ColDef; filterOn: boolean; selected: string[];
  отбор: (m: (p: URLSearchParams) => void) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<FacetOption[] | null>(null);
  const [q, setQ] = React.useState('');
  const [checked, setChecked] = React.useState<Set<string>>(new Set(selected));

  React.useEffect(() => {
    if (!open) return;
    setChecked(new Set(selected));
    setQ('');
    if (options) return;
    let live = true;
    fetch(`/api/registry/facet?col=${col.key}`)
      .then((r) => r.json())
      .then((data) => { if (live) setOptions(data.options ?? []); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visible = React.useMemo(() => {
    if (!options) return [];
    const qq = q.trim().toLowerCase();
    return qq ? options.filter((o) => o.label.toLowerCase().includes(qq)) : options;
  }, [options, q]);

  const toggle = (v: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  });

  const apply = () => {
    отбор((p) => {
      if (checked.size) p.set(col.key, [...checked].join('|'));
      else p.delete(col.key);
    });
    setOpen(false);
  };
  const reset = () => {
    отбор((p) => p.delete(col.key));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint text="Фильтр">
        <PopoverTrigger asChild>
          <span className={`th__i ${filterOn ? 'is-on' : ''}`} role="button" tabIndex={0}>
            <svg className="ic-th"><use href="#i-funnel" /></svg>
          </span>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="flex min-w-[240px] max-w-[320px] flex-col gap-[var(--group-gap-s)] p-[var(--group-padding-s)]" align="start">
        <label className="field">
          <svg className="ic16 field__icon"><use href="#i-search" /></svg>
          <input type="search" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </label>

        <div className="popover__list">
          {options === null && Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="popover__row" aria-hidden>
              <Skeleton className="size-4 shrink-0 rounded-[4px]" />
              <Skeleton className={`h-3.5 ${i % 2 ? 'w-20' : 'w-32'}`} />
            </div>
          ))}
          {options !== null && visible.length === 0 && (
            <div className="popover__row mark">Ничего не найдено</div>
          )}
          {visible.map((o) => (
            <label key={o.value} className="popover__row">
              <Checkbox checked={checked.has(o.value)} onCheckedChange={() => toggle(o.value)} />
              <span>{o.label || '—'}</span>
              <small>{o.count}</small>
            </label>
          ))}
        </div>

        <div className="popover__foot">
          <button type="button" className="btn btn--accent" onClick={apply}>Применить</button>
          <button type="button" className="btn" onClick={reset}>Сбросить</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
