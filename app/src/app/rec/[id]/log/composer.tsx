'use client';

/* Строка ввода реплики: текст, упоминание через @ и вложения.
 *
 * Поле — одна строка, растущая по содержимому: пустая коробка на три строки
 * внизу длинной ленты перетягивает внимание на себя. Кнопка — иконка справа
 * от поля, потому что подпись «Отправить» повторяет то, что и так очевидно
 * из места и стрелки.
 *
 * Enter отправляет, Shift+Enter переносит строку — как в любом чате. Форма
 * при этом настоящая: без JavaScript она уходит серверным действием, только
 * без вложений и упоминаний.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, SendHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Hint } from '@/components/ui/Hint';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent,
  AttachmentDescription, AttachmentMedia, AttachmentTitle,
} from '@/components/ui/attachment';
import { ИконкаФайла, типФайла } from './file-icon';
import { размер } from './format';

export interface Собеседник {
  id: number;
  fullName: string;
  position: string | null;
  side: 'executor' | 'customer';
}

export interface Черновик {
  текст: string;
  упомянуты: number[];
  файлы: File[];
}

const МАКС_ФАЙЛОВ = 5;
const МАКС_РАЗМЕР = 10 * 1024 * 1024;

export function Композер({ люди, отправить, ошибка }: {
  люди: Собеседник[];
  отправить: (ч: Черновик) => void;
  ошибка?: string | null;
}) {
  const [текст, setТекст] = useState('');
  const [файлы, setФайлы] = useState<File[]>([]);
  const [подсказка, setПодсказка] = useState<{ запрос: string; от: number } | null>(null);
  const [выбран, setВыбран] = useState(0);
  const поле = useRef<HTMLTextAreaElement>(null);
  const выбор = useRef<HTMLInputElement>(null);

  /* Поле растёт по содержимому. Через scrollHeight, а не CSS field-sizing:
     тот поддержан не везде, а вкладка обязана работать в браузере Заказчика. */
  useEffect(() => {
    const el = поле.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [текст]);

  const кандидаты = useMemo(() => {
    if (!подсказка) return [];
    const q = подсказка.запрос.toLowerCase();
    return люди.filter((u) => u.fullName.toLowerCase().includes(q)).slice(0, 6);
  }, [подсказка, люди]);

  /* Кого упомянули — вычисляем из готового текста, а не копим по кликам:
     человек мог стереть «@Сафин Р.М.» руками, и упоминание должно исчезнуть
     вместе с ним. */
  const упомянуты = useMemo(
    () => люди.filter((u) => текст.includes(`@${u.fullName}`)).map((u) => u.id),
    [текст, люди],
  );

  const пусто = !текст.trim() && !файлы.length;

  function приВводе(v: string, позиция: number) {
    setТекст(v);
    /* Подсказка открывается на «@» и живёт, пока идёт слово: пробел внутри
       фамилии допустим («Сафин Р»), два подряд — уже не поиск человека. */
    const до = v.slice(0, позиция);
    const m = /@([^@\n]{0,30})$/.exec(до);
    if (m && !m[1].includes('  ')) {
      setПодсказка({ запрос: m[1], от: позиция - m[1].length - 1 });
      setВыбран(0);
    } else {
      setПодсказка(null);
    }
  }

  function подставить(u: Собеседник) {
    if (!подсказка) return;
    const до = текст.slice(0, подсказка.от);
    const после = текст.slice(подсказка.от + подсказка.запрос.length + 1);
    const новый = `${до}@${u.fullName} ${после}`;
    setТекст(новый);
    setПодсказка(null);
    requestAnimationFrame(() => {
      const каретка = (до + `@${u.fullName} `).length;
      поле.current?.focus();
      поле.current?.setSelectionRange(каретка, каретка);
    });
  }

  function добавитьФайлы(список: FileList | null) {
    if (!список) return;
    const годные = [...список].filter((f) => f.size <= МАКС_РАЗМЕР);
    setФайлы((было) => [...было, ...годные].slice(0, МАКС_ФАЙЛОВ));
    /* Тот же файл, выбранный дважды подряд, не даёт события change, пока
       значение поля не сброшено. */
    if (выбор.current) выбор.current.value = '';
  }

  function послать() {
    if (пусто) return;
    отправить({ текст: текст.trim(), упомянуты, файлы });
    setТекст('');
    setФайлы([]);
    setПодсказка(null);
  }

  return (
    <div className="relative mt-3 border-t border-border pt-3">
      {подсказка && (
        /* Тот же список, что у выпадающих полей карточки: cmdk в оболочке
           `combo__*`. Своя вёрстка тут выглядела чужой — список упоминаний
           это ровно такой же выбор из справочника людей, только вызванный
           «собакой», а не кликом по полю. `data-state` ставим руками: меню не
           радиксовое, а анимацию раскрытия хочется общую с остальными. */
        <div data-state="open"
             className="combo__menu combo__menu--up absolute bottom-full left-0 z-40 mb-1.5 w-80">
          <Command shouldFilter={false} className="bg-transparent"
                   /* Подсветка одна на мышь и клавиатуру: cmdk сообщает о
                      наведении, а ведём мы её своим `выбран` — стрелки жмут в
                      поле ввода, фокус из него не уходит. */
                   value={String(кандидаты[выбран]?.id ?? '')}
                   onValueChange={(v) => {
                     const i = кандидаты.findIndex((u) => String(u.id) === v);
                     if (i >= 0) setВыбран(i);
                   }}>
            <CommandList className="max-h-56">
              {кандидаты.length === 0
                ? <div className="combo__empty">Никого не нашли</div>
                : кандидаты.map((u) => (
                  /* mousedown, а не click: click приходит после blur, поле
                     ввода успело бы потерять каретку вместе с позицией «@». */
                  <CommandItem key={u.id} value={String(u.id)}
                               onMouseDown={(ev) => { ev.preventDefault(); подставить(u); }}
                               onSelect={() => подставить(u)}>
                    <span className="combo__txt">{u.fullName}</span>
                    <span className="combo__note">
                      {u.side === 'executor' ? 'Исполнитель' : 'Заказчик'}
                    </span>
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
        </div>
      )}

      {файлы.length > 0 && (
        /* Колонкой: файл к реплике прикладывают по одному-двум, горизонтальная
           лента прятала бы второй за краем. Ширина ограничена — растянутая на
           всю панель карточка под имя файла выглядит плакатом. */
        <div className="mb-2 flex flex-col items-start gap-1.5">
          {файлы.map((f, i) => (
            <Attachment
              key={`${f.name}-${i}`}
              size="sm"
              /* Ширина по содержимому: карточка на всю колонку оставляет справа
                 пустое поле, а имя файла короткое. Рамка светлее обычной —
                 вложение это спутник реплики, а не отдельный блок.
                 `flex-nowrap` обязателен: базовый `flex-wrap` при узкой
                 карточке сбрасывает имя файла на строку выше иконки. */
              className="max-w-full flex-nowrap border-[var(--border-divider-light)] animate-in fade-in-0 zoom-in-95"
              style={{ animationDuration: 'var(--motion-base)', animationTimingFunction: 'var(--ease-out)' }}
            >
              <AttachmentMedia><ИконкаФайла имя={f.name} /></AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{f.name}</AttachmentTitle>
                <AttachmentDescription>{типФайла(f.name)} · {размер(f.size)}</AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                {/* Кнопка ВМАП несёт рамку в базовых классах — на карточке
                    вложения крестик из-за неё выглядит отдельной клавишей. */}
                <AttachmentAction aria-label="Убрать файл"
                                  className="border-transparent bg-transparent text-muted-foreground hover:text-foreground"
                                  onClick={() => setФайлы((б) => б.filter((_, j) => j !== i))}>
                  <X />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input ref={выбор} type="file" name="files" multiple hidden
               onChange={(e) => добавитьФайлы(e.target.files)} />

        <Hint text="Прикрепить файл">
          {/* Без preflight нативная кнопка несёт свой серый фон — снимаем
              только его, рамка и цвет иконки остаются как в базовом ghost. */}
          <Button type="button" variant="ghost" size="icon" aria-label="Прикрепить файл"
                  className="bg-transparent"
                  onClick={() => выбор.current?.click()}>
            <Paperclip className="size-4" />
          </Button>
        </Hint>

        <Textarea
          ref={поле}
          name="text"
          rows={1}
          value={текст}
          placeholder="Комментарий по рекомендации…"
          onChange={(e) => приВводе(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={(e) => {
            if (подсказка && кандидаты.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setВыбран((i) => (i + 1) % кандидаты.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setВыбран((i) => (i - 1 + кандидаты.length) % кандидаты.length); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); подставить(кандидаты[выбран]); return; }
              if (e.key === 'Escape') { setПодсказка(null); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); послать(); }
          }}
          /* Высоту ведёт свой обработчик, поэтому `field-sizing` компонента
             отключён: два механизма роста дали бы прыжок на первой же строке. */
          className="field-sizing-fixed min-h-9 flex-1 resize-none py-1.5 text-sm shadow-none"
          style={{ transitionDuration: 'var(--motion-fast)', transitionTimingFunction: 'var(--ease-out)' }}
        />

        <Hint text="Отправить (Enter)">
          <Button type="button" size="icon" aria-label="Отправить"
                  onClick={послать} disabled={пусто}
                  style={{ transitionDuration: 'var(--motion-fast)' }}>
            <SendHorizontal className="size-4" />
          </Button>
        </Hint>
      </div>

      {ошибка && (
        <div className="mt-1.5 text-xs" style={{ color: 'var(--status-error-text)' }}>{ошибка}</div>
      )}
    </div>
  );
}
