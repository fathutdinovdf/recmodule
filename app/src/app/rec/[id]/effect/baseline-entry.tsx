'use client';

/* Окно внесения базовых значений.
 *
 * Отдельно от baseline-forms.tsx (там спор о базе) по объёму: здесь не три
 * числа, а число плюс основание — договорный способ, условие его применимости,
 * согласование Заказчика и документ. Держать это в одном файле со спором
 * значило бы получить восемьсот строк, где две несвязанные формы делят
 * помощники.
 *
 * Форма меняется от выбранного способа, и меняется анимированно: блок условия
 * выезжает по высоте через общий Collapsible, а сам выбор — animate-ui
 * radio-group с едущей отметкой. Причина не в украшательстве: при мгновенной
 * подмене блока человек не замечает, что под переключателем появилось
 * обязательное поле, и упирается в отказ валидации, не поняв почему.
 *
 * Все поля УПРАВЛЯЕМЫЕ, и это не стилистика. React 19 сбрасывает форму с
 * `action` после каждой отправки, в том числе неудачной: неуправляемые поля
 * возвращаются к defaultValue, и человек, споткнувшись о проверку, обнаруживал
 * пустые дебиты и сброшенный на первый пункт способ. Состояние переживает
 * сброс, поэтому после отказа в форме остаётся ровно то, что набрали.
 */

import * as React from 'react';
import { useActionState } from 'react';
import { Paperclip, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Collapsible, CollapsibleContent } from '@/components/ui/Collapsible';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, Required } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent,
  AttachmentDescription, AttachmentMedia, AttachmentTitle,
} from '@/components/ui/attachment';
import { окно } from '../form-meta';
import { useОкноДействия } from '../use-dialog-state';
import { внестиБазу, type ОтветФормы } from './actions';

const МАКС_ФАЙЛОВ = 5;
const МАКС_РАЗМЕР = 10 * 1024 * 1024;

/* Формулировки способов — из Приложения № 2. Пересказывать их своими словами
   нельзя: эксперт выбирает способ, на который потом ссылается в споре, и текст
   на экране должен совпадать с текстом договора. */
const СПОСОБЫ = [
  {
    value: 'techregime',
    label: 'Утверждённый технологический режим',
    hint: 'Основной способ. Значения режима, действующего в месяце выдачи рекомендации. Применим, только если режим с момента утверждения не менялся.',
  },
  {
    value: 'threeDays',
    label: 'Средневзвешенные за трое суток до регистрации',
    hint: 'Применяется, если до регистрации произошло изменение режима эксплуатации либо режим не соответствует фактическим условиям. Договор помечает способ как применяемый по согласованию с Заказчиком.',
  },
  {
    value: 'agreedPeriod',
    label: 'Иной репрезентативный период',
    hint: 'Когда кондиционных данных за трое суток не набралось. Только по взаимному письменному соглашению Сторон.',
  },
] as const;

/* Перечень изменений режима — дословно из договора, пункт 3.3.1. Он здесь не
   для красоты: эксперт подтверждает отсутствие именно этих изменений, и по
   памяти список не воспроизводится. */
const ИЗМЕНЕНИЯ_РЕЖИМА = [
  'изменение частоты вращения электродвигателя',
  'изменение режима эксплуатации периодической скважины',
  'ухудшение работы ГНО',
  'изменение притока продукции пласта',
  'технологические операции, повлиявшие на режим эксплуатации',
  'иные изменения, влияющие на дебит скважины или производительность ГНО',
];

const СПОСОБЫ_ЭЭ = [
  { value: 'factual', label: 'По фактическим данным информационных систем' },
  { value: 'threeDays', label: 'Средневзвешенное за тот же расчётный период' },
  { value: 'design', label: 'Расчётом в КИС ВМАП, модуль Design' },
] as const;

const текстОшибки = (ответ: ОтветФормы) => (ответ && 'ошибка' in ответ ? ответ.ошибка : undefined);
const размер = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} КБ` : `${(b / 1048576).toFixed(1)} МБ`);

export function ОкноБазы({
  recId, значения, окноИдёт, естьФайлы, стартОткрыто, подпись,
}: {
  recId: number;
  /** Действующие значения — форма правки заполняется ими, а не пустая. */
  значения: { qzh: string; qn: string; ee: string; method: string; methodEe: string; agreementRef: string };
  /** Окно эффекта уже открыто: договор пускает сюда только исправление ошибки. */
  окноИдёт: boolean;
  /** К прежней версии базы уже приложен документ — новый прикладывать необязательно. */
  естьФайлы: boolean;
  стартОткрыто: boolean;
  подпись: string;
}) {
  const [ответ, отправить] = useActionState(внестиБазу.bind(null, recId), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));

  const [способ, setСпособ] = React.useState(значения.method || 'techregime');
  const [способЭэ, setСпособЭэ] = React.useState(значения.methodEe || 'factual');
  const [qzh, setQzh] = React.useState(значения.qzh);
  const [qn, setQn] = React.useState(значения.qn);
  const [ээ, setЭэ] = React.useState(значения.ee);
  const [безИзменений, setБезИзменений] = React.useState(значения.method === 'techregime');
  const [реквизиты, setРеквизиты] = React.useState(значения.agreementRef);
  const [пояснение, setПояснение] = React.useState('');
  const [файлы, setФайлы] = React.useState<File[]>([]);
  const выбор = React.useRef<HTMLInputElement>(null);

  const ошибка = текстОшибки(ответ);
  const ключ = окноИдёт ? 'baseFix' : 'baseEnter';

  /* Список файлов показывает состояние, а уходит на сервер `input.files` —
     DataTransfer держит их в согласии при добавлении и снятии. Тот же приём,
     что в форме фиксации реализации. */
  function синхронизировать(next: File[]) {
    const input = выбор.current;
    if (!input) return;
    const transfer = new DataTransfer();
    next.forEach((f) => transfer.items.add(f));
    input.files = transfer.files;
    setФайлы(next);
  }

  return (
    <ActionDialog
      {...окно(ключ)}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant={окноИдёт ? 'outline' : 'default'}>{подпись}</Button>}
    >
      <form action={отправить}>
        <FieldGroup>
          {окноИдёт && (
            <div className="rounded-md border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/8 px-3 py-2 text-sm">
              Окно эффекта уже идёт. Договор допускает изменение базы только при
              выявлении ошибки в исходных данных либо по соглашению Сторон —
              основание обязательно и останется в истории карточки.
            </div>
          )}

          <div className="flex flex-wrap items-end gap-[var(--block-gap-default)]">
            <ПолеЧисла id="be-qzh" name="base_qzh" подпись="Дебит жидкости" ед="м³/сут"
                       значение={qzh} onChange={setQzh} обязательно />
            <ПолеЧисла id="be-qn" name="base_qn" подпись="Дебит нефти" ед="т/сут"
                       значение={qn} onChange={setQn} обязательно />
            <ПолеЧисла id="be-ee" name="base_ee" подпись="Энергопотребление" ед="кВт·ч/сут"
                       значение={ээ} onChange={setЭэ} />
          </div>

          <Field>
            <FieldLabel>Способ определения по договору <Required /></FieldLabel>
            <RadioGroup name="method" value={способ} onValueChange={setСпособ} className="gap-2">
              {СПОСОБЫ.map((s) => (
                <label key={s.value}
                       className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border
                                  px-3 py-2 transition-colors has-[button[data-state=checked]]:border-primary
                                  has-[button[data-state=checked]]:bg-primary/5">
                  <RadioGroupItem value={s.value} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]">{s.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Field>

          {/* Условие применимости основного способа. Выезжает по высоте, а не
              подменяется мгновенно: иначе появление обязательной галочки
              проходит мимо глаз. */}
          <Collapsible open={способ === 'techregime'}>
            <CollapsibleContent>
              <div className="rounded-md border border-border bg-[var(--surface-sunken)] px-3 py-2.5">
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox name="no_regime_changes" className="mt-0.5"
                            checked={безИзменений}
                            onCheckedChange={(v) => setБезИзменений(v === true)} />
                  <span>
                    Подтверждаю: с момента утверждения технологического режима до
                    регистрации рекомендации изменений режима эксплуатации,
                    способных повлиять на производственные показатели, не было.
                  </span>
                </label>
                <ul className="mt-2 pl-7 text-xs text-[var(--text-tertiary)]">
                  {ИЗМЕНЕНИЯ_РЕЖИМА.map((и) => <li key={и}>— {и}</li>)}
                </ul>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Согласование Заказчика. Для трёхсуточного способа договор говорит
              «(по согласованию с Заказчиком)», для иного периода — «по
              взаимному письменному соглашению»: там реквизиты обязательны. */}
          <Collapsible open={способ === 'threeDays' || способ === 'agreedPeriod'}>
            <CollapsibleContent>
              <Field>
                <FieldLabel htmlFor="be-agreement">
                  Реквизиты согласования Заказчика
                  {способ === 'agreedPeriod' && <Required />}
                </FieldLabel>
                <Input id="be-agreement" name="agreement_ref" value={реквизиты}
                       onChange={(e) => setРеквизиты(e.target.value)}
                       placeholder="Например: протокол совещания от 12.08.2026 или письмо № 14-1128" />
                <FieldDescription>
                  {способ === 'agreedPeriod'
                    ? 'Иной расчётный период применяется только по письменному соглашению Сторон.'
                    : 'Если согласование ещё не получено, оставьте пустым — в карточке останется видимый признак.'}
                </FieldDescription>
              </Field>
            </CollapsibleContent>
          </Collapsible>

          {/* Способ для энергии спрашивается, только если её вообще внесли:
              из технологического режима её взять нельзя никогда, поэтому
              общий выбор способа на неё не распространяется. */}
          <Collapsible open={ээ.trim() !== ''}>
            <CollapsibleContent>
              <Field>
                <FieldLabel>Как определено базовое энергопотребление <Required /></FieldLabel>
                <RadioGroup name="method_ee" value={способЭэ} onValueChange={setСпособЭэ} className="gap-1.5">
                  {СПОСОБЫ_ЭЭ.map((s) => (
                    <label key={s.value} className="flex cursor-pointer items-center gap-2.5 text-sm">
                      <RadioGroupItem value={s.value} />
                      {s.label}
                    </label>
                  ))}
                </RadioGroup>
                <FieldDescription>
                  Технологический режим значения энергопотребления не содержит, поэтому
                  способ для него всегда отдельный.
                </FieldDescription>
              </Field>
            </CollapsibleContent>
          </Collapsible>

          <Field>
            <FieldLabel htmlFor="be-note">
              {окноИдёт ? <>Основание исправления <Required /></> : 'Пояснение'}
            </FieldLabel>
            <Textarea id="be-note" name="note" rows={окноИдёт ? 3 : 2}
                      value={пояснение} onChange={(e) => setПояснение(e.target.value)}
                      placeholder={окноИдёт
                        ? 'Какая ошибка в исходных данных выявлена либо реквизиты соглашения Сторон.'
                        : 'Откуда взяты значения: документ режима, период суток, расчёт.'} />
          </Field>

          <Field>
            <FieldLabel>
              Файл-обоснование {!естьФайлы && <Required />}
            </FieldLabel>
            <input ref={выбор} type="file" name="files" multiple hidden
                   onChange={(e) => синхронизировать([
                     ...файлы, ...Array.from(e.target.files ?? []),
                   ].slice(0, МАКС_ФАЙЛОВ))} />
            {файлы.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {файлы.map((f, i) => (
                  <Attachment key={`${f.name}-${i}`}>
                    <AttachmentMedia><FileText className="size-4" /></AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{f.name}</AttachmentTitle>
                      <AttachmentDescription>
                        {размер(f.size)}
                        {f.size > МАКС_РАЗМЕР && ' — больше 10 МБ'}
                      </AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentActions>
                      <AttachmentAction onClick={() => синхронизировать(файлы.filter((_, j) => j !== i))}
                                        aria-label="Убрать файл">
                        <X className="size-3.5" />
                      </AttachmentAction>
                    </AttachmentActions>
                  </Attachment>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm"
                    onClick={() => выбор.current?.click()}
                    disabled={файлы.length >= МАКС_ФАЙЛОВ}>
              <Paperclip className="size-3.5" />Прикрепить файл
            </Button>
            <FieldDescription>
              {естьФайлы
                ? 'К базе уже приложен документ — заново прикладывать не нужно.'
                : 'Документ утверждённого режима, выгрузка замеров или соглашение Сторон. До пяти файлов, каждый не больше 10 МБ.'}
            </FieldDescription>
          </Field>
        </FieldGroup>

        {ошибка && <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>}

        <DialogFooter className="mt-4">
          <SubmitButton pendingText="Сохраняю…">
            {окноИдёт ? 'Исправить базу' : 'Сохранить базу'}
          </SubmitButton>
          <DialogClose asChild>
            <Button type="button" variant="outline">Отмена</Button>
          </DialogClose>
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

/* Единица измерения внутри поля, а не в подписи: подпись остаётся названием
   величины, а единица оказывается там, где на неё смотрят — рядом с числом.
   Тот же приём и та же геометрия, что в форме возражения по базе. */
function ПолеЧисла({ id, name, подпись, ед, значение, обязательно, onChange }: {
  id: string; name: string; подпись: string; ед: string; значение: string;
  обязательно?: boolean; onChange: (v: string) => void;
}) {
  return (
    <Field className="min-w-0 flex-1 basis-[130px]">
      <FieldLabel htmlFor={id}>{подпись}{обязательно && <Required />}</FieldLabel>
      <div className="relative">
        <Input id={id} name={name} inputMode="decimal" value={значение}
               onChange={(e) => onChange(e.target.value)}
               className="text-right [font-variant-numeric:tabular-nums]"
               style={{ paddingRight: `calc(${ед.length}ch + var(--item-gap-horizontal-m))` }} />
        <span aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--text-quaternary)]">
          {ед}
        </span>
      </div>
    </Field>
  );
}
