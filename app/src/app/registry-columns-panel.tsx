'use client';

/* Кнопка «Настройка колонок» в шапке реестра — чек-лист видимости, разбитый
 * на смысловые группы (плоский список на тридцать строк без разбивки не
 * читается). Видимость хранится в cookie, а не в URL: это личная настройка
 * наблюдения за таблицей, а не часть отфильтрованной выборки — не должна
 * попадать в ссылку, которой делятся ради самого отбора реестра.
 *
 * Применяется явной кнопкой, а не по каждому клику. Первая версия писала
 * cookie и звала router.refresh() на каждый toggle — таблица иногда не
 * успевала обновиться: refresh() на том же URL иногда обгонялся чужим
 * префетчем соседней ссылки (плитки, строки — их в реестре много), и
 * устаревший ответ откатывал только что применённую видимость назад.
 * «Применить» делает полную перезагрузку страницы — дороже одного refresh,
 * но для редкого действия настройки колонок это надёжнее гонки с кэшем
 * роутера, а не быстрее её. */

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { Hint } from '@/components/ui/Hint';
import { Icon } from '@/components/Icons';
import type { ColDef } from './registry-columns';
import { ВИДИМЫЕ_КОЛОНКИ_COOKIE } from './registry-columns-cookie';

export function ColumnsPanel({ groups, all, visible }: {
  groups: { label: string; keys: string[] }[];
  all: ColDef[];
  visible: Set<string>;
}) {
  const [open, setOpen] = React.useState(false);
  /* Черновик — меняется кликами по чекбоксам, но не покидает попап и не
     трогает таблицу, пока не нажали «Применить». */
  const [checked, setChecked] = React.useState<Set<string>>(visible);

  const onOpenChange = (next: boolean) => {
    if (next) setChecked(new Set(visible));
    setOpen(next);
  };

  const label = (key: string) => all.find((c) => c.key === key)?.label ?? key;

  const toggle = (key: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const применить = () => {
    document.cookie = `${ВИДИМЫЕ_КОЛОНКИ_COOKIE}=${[...checked].join(',')}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  };

  const отменить = () => {
    setChecked(new Set(visible));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Hint text="Настройка колонок">
        <PopoverTrigger asChild>
          <button className="iconbtn iconbtn--lg" type="button" aria-label="Настройка колонок">
            <Icon id="cols" size={20} />
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        className="flex min-w-[280px] max-w-[320px] flex-col gap-[var(--group-gap-s)] p-[var(--group-padding-s)]"
        align="end"
      >
        <div className="popover__list" style={{ maxHeight: 360 }}>
          {groups.map((g) => (
            <React.Fragment key={g.label}>
              <div style={{
                padding: 'var(--item-padding-vertical-xs) var(--item-padding-horizontal-xs)',
                color: 'var(--text-quaternary)',
                font: `var(--font-weight-text) var(--font-size-text-small) / var(--line-height-text-small) var(--font-family-text)`,
              }}
              >
                {g.label}
              </div>
              {g.keys.map((key) => (
                <label key={key} className="popover__row">
                  <Checkbox checked={checked.has(key)} onCheckedChange={() => toggle(key)} />
                  <span>{label(key)}</span>
                </label>
              ))}
            </React.Fragment>
          ))}
        </div>

        <div className="popover__foot">
          <Button size="sm" className="flex-1" onClick={применить}>Применить</Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={отменить}>Отменить</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
