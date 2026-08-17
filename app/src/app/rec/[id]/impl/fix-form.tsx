'use client';

/* Форма фиксации реализации.
 *
 * Клиентская из-за двух вещей: поле «что не выполнено» показывается только
 * при частичной реализации, и его же пустоту при отправке проверяем здесь —
 * подсветкой рамки, без текста под полем (см. `проверить` ниже). Остальное —
 * обычная форма обычного POST, серверная проверка в actions.ts остаётся
 * подстраховкой на случай отправки в обход этой формы.
 *
 * Показывается окном действия, поэтому своего заголовка и рамки у неё нет:
 * и то, и другое даёт окно. Подвал — DialogFooter, чтобы «Отмена» закрывала
 * окно средствами Radix, заодно с Esc и кликом мимо.
 */

import * as React from 'react';
import { startOfToday, subYears } from 'date-fns';
import { motion } from 'motion/react';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Textarea } from '@/components/ui/Textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, Required } from '@/components/ui/field';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent,
  AttachmentDescription, AttachmentMedia, AttachmentTitle,
} from '@/components/ui/attachment';
import { ИконкаФайла, типФайла } from '../log/file-icon';
import { размер } from '../log/format';

const МАКС_ФАЙЛОВ = 5;
const МАКС_РАЗМЕР = 10 * 1024 * 1024;

export function ФормаФиксации({ action, ошибка, полнота: выбранная }: {
  action: (form: FormData) => void | Promise<void>;
  ошибка?: string;
  /** Полнота, выбранная до неудачной отправки: возвращается в адресе. */
  полнота?: string;
}) {
  const [полнота, setПолнота] = React.useState(выбранная === 'partial' ? 'partial' : 'full');
  const [заметкаНевалидна, setЗаметкаНевалидна] = React.useState(false);
  const [файлы, setФайлы] = React.useState<File[]>([]);
  const выбор = React.useRef<HTMLInputElement>(null);
  const сегодня = startOfToday();

  /* Файл едет обычным полем формы, без отдельной заливки: у фиксации нет
     прогресс-бара реплики, форма и так уходит одним POST-ом. Показ списка —
     дело этого состояния, а что реально уйдёт на сервер — дело `input.files`;
     `DataTransfer` держит их в согласии при добавлении и снятии файла. */
  function синхронизировать(next: File[]) {
    const input = выбор.current;
    if (!input) return;
    const transfer = new DataTransfer();
    next.forEach((f) => transfer.items.add(f));
    input.files = transfer.files;
    setФайлы(next);
  }

  function добавитьФайлы(список: FileList | null) {
    if (!список) return;
    const годные = [...список].filter((f) => f.size <= МАКС_РАЗМЕР);
    синхронизировать([...файлы, ...годные].slice(0, МАКС_ФАЙЛОВ));
  }

  /* «Что не выполнено» при частичной реализации проверяется на клиенте, до
     обращения к серверу: без этого форма после неудачной попытки откатывала
     полноту обратно к «Полностью» (значение приходило из адреса, а не из
     этого состояния) и подпись под полем задваивала то, что уже видно по
     красной рамке. Серверная проверка в actions.ts остаётся — это лишь
     ускоряет обратную связь и убирает лишний текст. */
  const проверить = (event: React.FormEvent<HTMLFormElement>) => {
    if (полнота !== 'partial') return;
    const форма = new FormData(event.currentTarget);
    if (!String(форма.get('completeness_note') ?? '').trim()) {
      event.preventDefault();
      setЗаметкаНевалидна(true);
    }
  };

  return (
    /* Класс `form` не нужен: форма живёт в окне действия, у которого свои
       отступы, а `form` добавляет собственную рамку и фон. */
    <form action={action} onSubmit={проверить}>
      <FieldGroup>
        {/* Строка из двух равных полей, как `.form__row` в макете: поля делят
            ширину поровну и переносятся на узком экране. */}
        <Field orientation="horizontal" className="flex-wrap items-start gap-[var(--block-gap-default)]">
          <Field className="flex-1 basis-[220px]">
            <FieldLabel htmlFor="fact-date">Дата фактической реализации</FieldLabel>
            <DatePicker
              id="fact-date"
              name="fact_date"
              label="Дата фактической реализации"
              defaultValue={сегодня}
              disabled={{ after: сегодня }}
              startMonth={subYears(сегодня, 2)}
              endMonth={сегодня}
            />
          </Field>

          <Field className="flex-1 basis-[220px]">
            <FieldLabel>Полнота реализации</FieldLabel>
            <RadioGroup
              name="completeness"
              value={полнота}
              onValueChange={(next) => { setПолнота(next); if (next !== 'partial') setЗаметкаНевалидна(false); }}
              className="grid-flow-col justify-start gap-[var(--group-gap-m)] pt-2"
            >
              <FieldLabel htmlFor="compl-full" className="font-normal">
                <RadioGroupItem id="compl-full" value="full" />
                Полностью
              </FieldLabel>
              <FieldLabel htmlFor="compl-partial" className="font-normal">
                <RadioGroupItem id="compl-partial" value="partial" />
                Частично
              </FieldLabel>
            </RadioGroup>
          </Field>
        </Field>

        {/* Не через AnimatePresence: она убирает узел из DOM по завершении
            анимации, а зазор `gap` у FieldGroup стоит по обе стороны узла
            независимо от его высоты — в момент удаления он схлопывался разом,
            и в конце анимации был заметный рывок. Поле остаётся смонтированным
            всегда, схлопывается высотой до нуля — зазор при этом не meняется
            и рывка нет. */}
        <motion.div
          initial={false}
          animate={{ height: полнота === 'partial' ? 'auto' : 0, opacity: полнота === 'partial' ? 1 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
          aria-hidden={полнота !== 'partial'}
        >
          <Field data-invalid={заметкаНевалидна}>
            <FieldLabel htmlFor="compl-note">
              Что не выполнено <Required />
            </FieldLabel>
            <Textarea id="compl-note" name="completeness_note" rows={3} aria-invalid={заметкаНевалидна}
                      tabIndex={полнота === 'partial' ? undefined : -1}
                      onChange={() => setЗаметкаНевалидна(false)}
                      placeholder="Например: частота выведена не до рекомендованной, ревизия устьевой арматуры не проводилась." />
          </Field>
        </motion.div>

        <Field>
          <FieldLabel>Вложения</FieldLabel>
          <div className="flex flex-col items-start gap-1.5">
            <input ref={выбор} className="sr-only" type="file" name="attachments" multiple
                   onChange={(e) => добавитьФайлы(e.target.files)} />

            {файлы.map((f, i) => (
              <Attachment
                key={`${f.name}-${i}`}
                size="sm"
                className="max-w-full flex-nowrap border-[var(--border-divider-light)] animate-in fade-in-0 zoom-in-95"
                style={{ animationDuration: 'var(--motion-base)', animationTimingFunction: 'var(--ease-out)' }}
              >
                <AttachmentMedia><ИконкаФайла имя={f.name} /></AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{f.name}</AttachmentTitle>
                  <AttachmentDescription>{типФайла(f.name)} · {размер(f.size)}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction aria-label="Убрать файл"
                                    className="border-transparent bg-transparent text-muted-foreground hover:text-foreground"
                                    onClick={() => синхронизировать(файлы.filter((_, j) => j !== i))}>
                    <X />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}

            <Button type="button" variant="outline" size="sm"
                    onClick={() => выбор.current?.click()} disabled={файлы.length >= МАКС_ФАЙЛОВ}>
              <Paperclip className="size-3.5" />Прикрепить файл
            </Button>
          </div>
          <FieldDescription>
            Выгрузка тренда, наряд-задание, скриншот — до пяти файлов, каждый не больше 10 МБ.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="fact-note">Комментарий</FieldLabel>
          <Textarea id="fact-note" name="note" rows={2}
                    placeholder="Что изменилось в режиме и почему дата именно такая." />
        </Field>
      </FieldGroup>

      {ошибка && <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>}

      <DialogFooter className="mt-4">
        <SubmitButton pendingText="Фиксирую…">Зафиксировать реализацию</SubmitButton>
        <DialogClose asChild>
          <Button type="button" variant="outline">Отмена</Button>
        </DialogClose>
      </DialogFooter>
    </form>
  );
}
