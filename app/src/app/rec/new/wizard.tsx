'use client';

import * as React from 'react';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight,
  FileText, LockKeyhole, Paperclip, Save, X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Progress } from '@/components/ui/Progress';
import { Checkbox } from '@/components/ui/Checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import type {
  RegistrationDirection, RegistrationExecutor, RegistrationPriority,
} from '@/db/registration';
import { сохранитьРекомендацию, type RegistrationActionState } from './actions';

export interface RegistrationWell {
  wellId: number;
  number: string;
  kust: string;
  fieldId: number;
  fieldName: string;
}

interface BaselinePreview {
  baseQzh: number | null;
  baseQn: number | null;
  periodFrom: string;
  periodTo: string;
  usedDays: number;
  requestedDays: number;
}

interface Draft {
  wellId: string;
  directionId: string;
  priority: string;
  problem: string;
  action: string;
  rationale: string;
  expectQzh: string;
  expectQn: string;
  expectEe: string;
  resultNote: string;
  baselineSource: 'measured' | 'manual';
  baseQzh: string;
  baseQn: string;
  baseEe: string;
  baselineNote: string;
  executorId: string;
  comment: string;
}

const STEPS = [
  { title: 'Объект', hint: 'Скважина и контекст ВМАП' },
  { title: 'Проблема', hint: 'Направление и приоритет' },
  { title: 'Рекомендация', hint: 'Мероприятие и обоснование' },
  { title: 'Прогноз и база', hint: 'Ожидаемый результат' },
  { title: 'Передача', hint: 'Ответственный и проверка' },
];

const REQUIRED: Array<{ step: number; key: keyof Draft; label: string }> = [
  { step: 0, key: 'wellId', label: 'скважина' },
  { step: 1, key: 'directionId', label: 'направление' },
  { step: 1, key: 'problem', label: 'описание проблемы' },
  { step: 1, key: 'priority', label: 'приоритет' },
  { step: 2, key: 'action', label: 'мероприятие' },
  { step: 2, key: 'rationale', label: 'технологическое обоснование' },
  { step: 3, key: 'expectQzh', label: 'Δ Qж' },
  { step: 3, key: 'expectQn', label: 'Δ Qн' },
  { step: 3, key: 'expectEe', label: 'Δ ЭЭ' },
  { step: 4, key: 'executorId', label: 'ответственный Исполнителя' },
];

const initialState: RegistrationActionState = {};
const LOCAL_DRAFT_KEY = 'rec-registration-draft';

const дата = (value: string) => new Date(value).toLocaleDateString('ru-RU');

export function RegistrationWizard({
  wells, directions, priorities, executors, currentExecutorId,
}: {
  wells: RegistrationWell[];
  directions: RegistrationDirection[];
  priorities: RegistrationPriority[];
  executors: RegistrationExecutor[];
  currentExecutorId: number | null;
}) {
  const router = useRouter();
  const [actionState, formAction] = useActionState(сохранитьРекомендацию, initialState);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [attempted, setAttempted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [closeAsked, setCloseAsked] = useState(false);
  const [gate, setGate] = useState(false);
  const [duplicatesConfirmed, setDuplicatesConfirmed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [localNotice, setLocalNotice] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [baseline, setBaseline] = useState<BaselinePreview | null>(null);
  const [baselineStatus, setBaselineStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [draft, setDraft] = useState<Draft>({
    wellId: '', directionId: '', priority: '', problem: '', action: '', rationale: '',
    expectQzh: '', expectQn: '', expectEe: '', resultNote: '',
    baselineSource: 'measured', baseQzh: '', baseQn: '', baseEe: '', baselineNote: '',
    executorId: currentExecutorId ? String(currentExecutorId) : '', comment: '',
  });

  const selectedWell = wells.find((well) => String(well.wellId) === draft.wellId) ?? null;
  const fieldOptions = useMemo(() => {
    const fields = new Map<number, { name: string; count: number }>();
    for (const well of wells) {
      const current = fields.get(well.fieldId);
      fields.set(well.fieldId, { name: well.fieldName, count: (current?.count ?? 0) + 1 });
    }
    return [...fields].sort((a, b) => a[1].name.localeCompare(b[1].name, 'ru'));
  }, [wells]);
  const selectedFieldId = selectedWell?.fieldId ?? Number(fieldOptions[0]?.[0] ?? 0);
  const [fieldId, setFieldId] = useState(selectedFieldId ? String(selectedFieldId) : '');
  const wellOptions = wells.filter((well) => String(well.fieldId) === fieldId);

  const missing = REQUIRED.filter((item) => !String(draft[item.key] ?? '').trim());
  const invalidKeys = new Set(attempted ? missing.map((item) => item.key) : []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { draft?: Partial<Draft>; savedAt?: string };
      if (!parsed.draft) return;
      const restored = { ...draft, ...parsed.draft };
      setDraft(restored);
      const restoredWell = wells.find((well) => String(well.wellId) === restored.wellId);
      if (restoredWell) setFieldId(String(restoredWell.fieldId));
      setLocalNotice(`Локальный черновик восстановлен${parsed.savedAt ? ` · ${new Date(parsed.savedAt).toLocaleString('ru-RU')}` : ''}.`);
    } catch {
      localStorage.removeItem(LOCAL_DRAFT_KEY);
    }
    // Первичное состояние читается один раз: последующие изменения принадлежат форме.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (actionState.analogs?.length) {
      setGate(true);
      setStep(4);
    }
  }, [actionState]);

  useEffect(() => {
    if (!draft.wellId) {
      setBaseline(null);
      setBaselineStatus('idle');
      return;
    }
    const controller = new AbortController();
    setBaselineStatus('loading');
    fetch(`/api/registration/baseline?wellId=${draft.wellId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<BaselinePreview>;
      })
      .then((value) => { setBaseline(value); setBaselineStatus('ready'); })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setBaseline(null); setBaselineStatus('error');
      });
    return () => controller.abort();
  }, [draft.wellId]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setLocalNotice('');
    if (key === 'wellId' || key === 'directionId') {
      setDuplicatesConfirmed(false);
      setGate(false);
    }
  }

  function go(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
    setGate(false);
  }

  function validateRegistration(event: React.MouseEvent<HTMLButtonElement>) {
    if (!missing.length) {
      localStorage.removeItem(LOCAL_DRAFT_KEY);
      setDirty(false);
      return;
    }
    event.preventDefault();
    setAttempted(true);
    go(missing[0].step);
  }

  function saveDraft(event: React.MouseEvent<HTMLButtonElement>) {
    const можноВБазу = draft.wellId && draft.directionId && draft.problem.trim() && draft.action.trim()
      && (draft.baselineSource !== 'manual'
        || (draft.baseQzh && draft.baseQn && draft.baselineNote.trim()));
    if (можноВБазу) {
      localStorage.removeItem(LOCAL_DRAFT_KEY);
      setDirty(false);
      return;
    }
    event.preventDefault();
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ draft, savedAt: new Date().toISOString() }));
    setDirty(false);
    setLocalNotice('Черновик сохранён на этом рабочем месте. После заполнения объекта, направления, проблемы и мероприятия он появится в реестре. Вложения локально не сохраняются.');
  }

  function chooseField(value: string) {
    setFieldId(value);
    update('wellId', '');
  }

  function syncFiles(next: File[]) {
    const input = fileInput.current;
    if (!input) return;
    const transfer = new DataTransfer();
    next.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    setFiles(next);
    setDirty(true);
  }

  const summary = [
    selectedWell ? `${selectedWell.fieldName} · куст ${selectedWell.kust} · скважина ${selectedWell.number}` : 'Не выбран',
    directions.find((item) => String(item.id) === draft.directionId)?.name ?? 'Не выбрано',
    draft.action || 'Не заполнено',
    draft.expectQzh && draft.expectQn
      ? `Δ Qж ${draft.expectQzh} · Δ Qн ${draft.expectQn} · Δ ЭЭ ${draft.expectEe || '—'}` : 'Не заполнено',
    executors.find((item) => String(item.id) === draft.executorId)?.fullName ?? 'Не выбран',
  ];

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) setCloseAsked(true); }}>
        <DialogContent showCloseButton={false} className="wz-dialog">
          <form action={formAction} className="wz-form">
            {Object.entries(draft).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <input type="hidden" name="duplicatesConfirmed" value={duplicatesConfirmed ? 'yes' : 'no'} />
            <input type="hidden" name="duplicatesFingerprint" value={actionState.analogFingerprint ?? ''} />
            <input ref={fileInput} className="sr-only" type="file" name="attachments" multiple
              onChange={(event) => syncFiles(Array.from(event.target.files ?? []).slice(0, 5))} />

            <DialogHeader className="wz-head">
              <div className="wz-head__copy">
                <DialogTitle className="wz-title">Регистрация рекомендации</DialogTitle>
                <DialogDescription>
                  Черновик · {missing.length ? `не заполнено ${missing.length}` : 'все обязательные поля заполнены'}
                </DialogDescription>
              </div>
              <div className="wz-progress">
                <span>Шаг {step + 1} из {STEPS.length}</span>
                <Progress value={((step + 1) / STEPS.length) * 100} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Закрыть мастер"
                onClick={() => dirty ? setCloseAsked(true) : router.push('/')}>
                <X />
              </Button>
            </DialogHeader>

            <div className="wz-body">
              <nav className="wz-rail" aria-label="Шаги регистрации">
                {STEPS.map((item, index) => {
                  const stepMissing = missing.filter((field) => field.step === index).length;
                  const done = stepMissing === 0;
                  return (
                    <button key={item.title} type="button" onClick={() => go(index)}
                      className={`wz-step ${index === step ? 'is-current' : ''} ${done ? 'is-done' : ''}`}>
                      <span className="wz-step__mark">{done ? <Check /> : index + 1}</span>
                      <span className="wz-step__copy">
                        <b>{item.title}</b><small>{summary[index] || item.hint}</small>
                      </span>
                      {attempted && stepMissing > 0 && <span className="wz-step__error">{stepMissing}</span>}
                    </button>
                  );
                })}
              </nav>

              <main className="wz-pane">
                {gate && actionState.analogs?.length ? (
                  <AnalogGate analogs={actionState.analogs} checked={duplicatesConfirmed}
                    onCheckedChange={setDuplicatesConfirmed} error={actionState.error} />
                ) : (
                  <AnimatePresence mode="wait" initial={false} custom={direction}>
                    <motion.section key={step} custom={direction}
                      initial={{ opacity: 0, x: direction * 12, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, x: direction * -8, filter: 'blur(1px)' }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="wz-pane__motion">
                      <div className="wz-pane__kicker">Шаг {step + 1} · {STEPS[step].title}</div>
                      {step === 0 && (
                        <ObjectStep fieldOptions={fieldOptions} fieldId={fieldId} chooseField={chooseField}
                          wellOptions={wellOptions} draft={draft} update={update} selectedWell={selectedWell}
                          baseline={baseline} baselineStatus={baselineStatus} invalid={invalidKeys.has('wellId')} />
                      )}
                      {step === 1 && (
                        <ProblemStep directions={directions} priorities={priorities} draft={draft}
                          update={update} invalid={invalidKeys} />
                      )}
                      {step === 2 && (
                        <RecommendationStep draft={draft} update={update} invalid={invalidKeys}
                          files={files} addFiles={() => fileInput.current?.click()} removeFile={(index) =>
                            syncFiles(files.filter((_, fileIndex) => fileIndex !== index))} />
                      )}
                      {step === 3 && (
                        <ResultStep draft={draft} update={update} invalid={invalidKeys}
                          baseline={baseline} baselineStatus={baselineStatus} manualOpen={manualOpen}
                          setManualOpen={setManualOpen} />
                      )}
                      {step === 4 && (
                        <HandoverStep draft={draft} update={update} invalid={invalidKeys}
                          executors={executors} summary={summary} priorities={priorities} onGo={go} />
                      )}
                    </motion.section>
                  </AnimatePresence>
                )}
              </main>
            </div>

            {(actionState.error || (attempted && missing.length > 0) || localNotice) && !gate && (
              <div className={`wz-alert ${localNotice && !actionState.error ? 'is-success' : ''}`}
                role={localNotice && !actionState.error ? 'status' : 'alert'}>
                {localNotice && !actionState.error ? <Check /> : <AlertTriangle />}
                <div><b>{actionState.error || localNotice || `Не заполнено обязательных полей: ${missing.length}`}</b>
                  {attempted && missing.length > 0 && <p>{missing.map((item) => item.label).join(', ')}.</p>}</div>
              </div>
            )}

            <DialogFooter className="wz-foot">
              <div className="wz-foot__left">
                <SubmitControl name="intent" value="draft" variant="outline" onClick={saveDraft}>
                  <Save />Сохранить черновик
                </SubmitControl>
                <Button type="button" variant="ghost" onClick={() => dirty ? setCloseAsked(true) : router.push('/')}>Отмена</Button>
              </div>
              <div className="wz-foot__right">
                <Button type="button" variant="outline" disabled={step === 0 || gate} onClick={() => go(step - 1)}>
                  <ChevronLeft />Назад
                </Button>
                <Button type="button" variant="outline" disabled={step === STEPS.length - 1 || gate} onClick={() => go(step + 1)}>
                  Далее<ChevronRight />
                </Button>
                <SubmitControl name="intent" value="register" onClick={validateRegistration}
                  disabled={gate && !duplicatesConfirmed}>
                  Зарегистрировать
                </SubmitControl>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closeAsked} onOpenChange={setCloseAsked}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Закрыть мастер?</DialogTitle>
            <DialogDescription>Несохранённые изменения будут потеряны. Черновик создаётся только по кнопке.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={() => setCloseAsked(false)}>Продолжить заполнение</Button>
            <Button type="button" variant="destructive" onClick={() => router.push('/')}>Закрыть без сохранения</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SubmitControl({ children, ...props }:
React.ComponentProps<typeof Button> & { name: string; value: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending || props.disabled} {...props}>
    {pending && <Spinner />}{children}
  </Button>;
}

function ObjectStep({ fieldOptions, fieldId, chooseField, wellOptions, draft, update,
  selectedWell, baseline, baselineStatus, invalid }: {
  fieldOptions: Array<[number, { name: string; count: number }]>;
  fieldId: string; chooseField: (value: string) => void; wellOptions: RegistrationWell[];
  draft: Draft; update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  selectedWell: RegistrationWell | null; baseline: BaselinePreview | null;
  baselineStatus: string; invalid: boolean;
}) {
  return <div className="wz-columns">
    <div className="wz-fields">
      <Field>
        <FieldLabel htmlFor="registration-field">Месторождение</FieldLabel>
        <Combobox name="fieldPicker" value={fieldId} onValueChange={chooseField}
          id="registration-field"
          searchable searchPlaceholder="Найти месторождение…"
          options={fieldOptions.map(([id, field]) => ({ value: String(id), label: field.name, note: `${field.count} скв.` }))}
          placeholder="Выберите месторождение" />
      </Field>
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="registration-well">Скважина</FieldLabel>
        <Combobox name="wellPicker" value={draft.wellId} onValueChange={(value) => update('wellId', value)}
          id="registration-well" ariaDescribedBy={invalid ? 'registration-well-error' : undefined}
          searchable searchPlaceholder="Номер скважины…"
          options={wellOptions.map((well) => ({ value: String(well.wellId), label: well.number, note: `куст ${well.kust}` }))}
          placeholder="Найдите скважину" invalid={invalid} emptyText="В выбранном месторождении скважина не найдена" />
        <FieldDescription>Добывающие скважины ТПП «Когалымнефтегаз» (тип 1). Готовность замеров проверяется после выбора.</FieldDescription>
        {invalid && <FieldError id="registration-well-error">Выберите скважину.</FieldError>}
      </Field>
    </div>
    <aside className="wz-evidence">
      {!selectedWell ? <div className="wz-empty">Выберите скважину — здесь появятся её контекст и готовность данных.</div> : <>
        <div><span>Объект</span><b>Скважина {selectedWell.number}</b><small>{selectedWell.fieldName} · куст {selectedWell.kust}</small></div>
        <div><span>База по замерам</span>{baselineStatus === 'loading' ? <Spinner />
          : baseline ? <><b>{baseline.baseQzh?.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) ?? '—'} м³/сут</b>
            <small>нефть {baseline.baseQn?.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) ?? '—'} т/сут · {baseline.usedDays} из {baseline.requestedDays} суток</small></>
          : <small>Не удалось получить предварительный расчёт. При регистрации будет повторная попытка.</small>}</div>
      </>}
    </aside>
  </div>;
}

function ProblemStep({ directions, priorities, draft, update, invalid }: {
  directions: RegistrationDirection[]; priorities: RegistrationPriority[]; draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void; invalid: Set<keyof Draft>;
}) {
  return <div className="wz-fields">
    <Field data-invalid={invalid.has('directionId')}>
      <FieldLabel htmlFor="registration-direction">Направление</FieldLabel>
      <Combobox name="directionPicker" value={draft.directionId} onValueChange={(value) => update('directionId', value)}
        id="registration-direction" ariaDescribedBy={invalid.has('directionId') ? 'registration-direction-error' : undefined}
        options={directions.map((item) => ({ value: String(item.id), label: item.name }))}
        placeholder="Выберите направление" invalid={invalid.has('directionId')} />
      {invalid.has('directionId') && <FieldError id="registration-direction-error">Выберите направление.</FieldError>}
    </Field>
    <TextField label="Описание проблемы или отклонения" value={draft.problem}
      onChange={(value) => update('problem', value)} invalid={invalid.has('problem')} area rows={4}
      placeholder="Что изменилось в работе скважины и чем это подтверждается?" />
    <Field data-invalid={invalid.has('priority')}>
      <FieldLabel id="registration-priority-label">Приоритет</FieldLabel>
      <div className="wz-priorities" role="radiogroup" aria-labelledby="registration-priority-label"
        aria-describedby={invalid.has('priority') ? 'registration-priority-error' : undefined}>
        {priorities.map((item) => <button key={item.code} type="button"
          role="radio" aria-checked={draft.priority === item.code}
          className={draft.priority === item.code ? 'is-selected' : ''} onClick={() => update('priority', item.code)}>
          <span className={`prio prio--${item.code}`}>{item.code}</span>
          <b>{item.name.split('—')[1]?.trim() ?? item.name}</b><small>ответ {item.responseHours} рабочих ч</small>
        </button>)}
      </div>
      <FieldDescription>Норматив начинается с передачи Заказчику, а не с сохранения черновика.</FieldDescription>
      {invalid.has('priority') && <FieldError id="registration-priority-error">Выберите приоритет.</FieldError>}
    </Field>
  </div>;
}

function RecommendationStep({ draft, update, invalid, files, addFiles, removeFile }: {
  draft: Draft; update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  invalid: Set<keyof Draft>; files: File[]; addFiles: () => void; removeFile: (index: number) => void;
}) {
  return <div className="wz-fields">
    <TextField label="Рекомендуемое мероприятие" value={draft.action} onChange={(value) => update('action', value)}
      invalid={invalid.has('action')} area rows={4} placeholder="Режимы, частоты и последовательность действий." />
    <TextField label="Технологическое обоснование" value={draft.rationale} onChange={(value) => update('rationale', value)}
      invalid={invalid.has('rationale')} area rows={5} placeholder="Почему мероприятие устранит проблему и какими данными это подтверждается." />
    <Field>
      <FieldLabel>Вложения <span className="wz-optional">необязательно</span></FieldLabel>
      <div className="wz-files">
        {files.map((file, index) => <span key={`${file.name}-${file.size}`}><FileText />
          <span><b>{file.name}</b><small>{Math.ceil(file.size / 1024)} КБ</small></span>
          <button type="button" aria-label={`Убрать ${file.name}`} onClick={() => removeFile(index)}><X /></button></span>)}
        <Button type="button" variant="outline" onClick={addFiles} disabled={files.length >= 5}><Paperclip />Прикрепить файл</Button>
      </div>
      <FieldDescription>До пяти файлов, каждый не больше 10 МБ.</FieldDescription>
    </Field>
  </div>;
}

function ResultStep({ draft, update, invalid, baseline, baselineStatus, manualOpen, setManualOpen }: {
  draft: Draft; update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  invalid: Set<keyof Draft>; baseline: BaselinePreview | null; baselineStatus: string;
  manualOpen: boolean; setManualOpen: (value: boolean) => void;
}) {
  return <div className="wz-fields">
    <div className="wz-number-grid">
      <NumberField label="Δ Qж, м³/сут" value={draft.expectQzh} onChange={(value) => update('expectQzh', value)} invalid={invalid.has('expectQzh')} step="0.1" />
      <NumberField label="Δ Qн, т/сут" value={draft.expectQn} onChange={(value) => update('expectQn', value)} invalid={invalid.has('expectQn')} step="0.01" />
      <NumberField label="Δ ЭЭ, кВт·ч/сут" value={draft.expectEe} onChange={(value) => update('expectEe', value)} invalid={invalid.has('expectEe')} step="1" />
    </div>
    <TextField label="Пояснение к прогнозу" optional value={draft.resultNote}
      onChange={(value) => update('resultNote', value)} area rows={2}
      placeholder="Например: выход на режим ожидается на третьи сутки." />
    <div className="wz-baseline">
      <div className="wz-baseline__head"><div><b>Базовые значения</b><span>пересчитываются в момент регистрации</span></div>
        <span className="tag tag--default">{draft.baselineSource === 'manual' ? 'вручную' : 'по замерам'}</span></div>
      {baselineStatus === 'loading' ? <div className="wz-baseline__loading"><Spinner />Получаю замеры ВМАП…</div>
        : baseline ? <div className="wz-baseline__values">
          <div><span>Жидкость</span><b>{baseline.baseQzh?.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) ?? '—'} м³/сут</b></div>
          <div><span>Нефть</span><b>{baseline.baseQn?.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) ?? '—'} т/сут</b></div>
          <div><span>Период</span><b>{дата(baseline.periodFrom)} — {дата(baseline.periodTo)}</b><small>{baseline.usedDays} из {baseline.requestedDays} суток</small></div>
        </div> : <div className="wz-baseline__loading">Предварительный расчёт недоступен. Можно ввести обоснованную ручную базу.</div>}
      <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
        <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="wz-baseline__trigger">
          Заменить базу вручную<ChevronDown className={manualOpen ? 'rotate-180' : ''} />
        </Button></CollapsibleTrigger>
        <CollapsibleContent className="wz-manual">
          <div className="wz-number-grid">
            <NumberField label="База Qж" value={draft.baseQzh} onChange={(value) => { update('baseQzh', value); update('baselineSource', 'manual'); }} step="0.1" />
            <NumberField label="База Qн" value={draft.baseQn} onChange={(value) => { update('baseQn', value); update('baselineSource', 'manual'); }} step="0.01" />
            <NumberField label="База ЭЭ" value={draft.baseEe} onChange={(value) => { update('baseEe', value); update('baselineSource', 'manual'); }} step="1" />
          </div>
          <TextField label="Обоснование ручной базы" value={draft.baselineNote}
            onChange={(value) => { update('baselineNote', value); update('baselineSource', 'manual'); }} area rows={3}
            placeholder="Какие сутки или режим использованы и почему расчёт по замерам не подходит." />
          {draft.baselineSource === 'manual' && <Button type="button" variant="outline" onClick={() => update('baselineSource', 'measured')}>Вернуть расчёт по замерам</Button>}
        </CollapsibleContent>
      </Collapsible>
    </div>
    <div className="wz-fixed"><LockKeyhole /><div><b>Горизонт подтверждения — 90 суток</b><span>Отсчитывается от даты фактической реализации и не редактируется.</span></div></div>
  </div>;
}

function HandoverStep({ draft, update, invalid, executors, summary, priorities, onGo }: {
  draft: Draft; update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  invalid: Set<keyof Draft>; executors: RegistrationExecutor[]; summary: string[];
  priorities: RegistrationPriority[]; onGo: (step: number) => void;
}) {
  const selectedPriority = priorities.find((item) => item.code === draft.priority);
  return <div className="wz-fields">
    <Field data-invalid={invalid.has('executorId')}>
      <FieldLabel htmlFor="registration-executor">Ответственный Исполнителя</FieldLabel>
      <Combobox name="executorPicker" value={draft.executorId} onValueChange={(value) => update('executorId', value)}
        id="registration-executor" ariaDescribedBy={invalid.has('executorId') ? 'registration-executor-error' : undefined}
        options={executors.map((item) => ({ value: String(item.id), label: item.fullName, note: item.position ?? undefined }))}
        placeholder="Выберите ответственного" invalid={invalid.has('executorId')} />
      {invalid.has('executorId') && <FieldError id="registration-executor-error">Выберите ответственного.</FieldError>}
    </Field>
    <TextField label="Комментарий при передаче" optional value={draft.comment}
      onChange={(value) => update('comment', value)} area rows={3}
      placeholder="Договорённости с цехом, срочность или связанный контекст." />
    <div className="wz-summary"><h3>Проверка перед регистрацией</h3>
      {['Объект', 'Направление', 'Мероприятие', 'Ожидаемый результат', 'Ответственный'].map((label, index) =>
        <div key={label}><span>{label}</span><b className={summary[index].startsWith('Не ') ? 'is-missing' : ''}>{summary[index]}</b>
          <button type="button" onClick={() => onGo(index)}>изменить</button></div>)}
    </div>
    <div className="wz-handover"><Check /><div><b>Передача выполняется автоматически</b>
      <span>В рабочее окно рекомендация сразу уйдёт Заказчику. Вне окна получит номер и будет передана при его открытии; норматив ответа начнётся только тогда.</span>
      {selectedPriority && <small>Приоритет {selectedPriority.code} · норматив {selectedPriority.responseHours} рабочих часов</small>}</div></div>
  </div>;
}

function AnalogGate({ analogs, checked, onCheckedChange, error }: {
  analogs: NonNullable<RegistrationActionState['analogs']>; checked: boolean;
  onCheckedChange: (value: boolean) => void; error?: string;
}) {
  return <section className="wz-gate">
    <div className="wz-gate__title"><AlertTriangle /><div><h3>Найдены аналоги по скважине и направлению</h3>
      <p>Проверка выполнена заново непосредственно перед регистрацией.</p></div></div>
    <div className="wz-gate__list">{analogs.map((item) => <Link key={item.id} href={`/rec/${item.id}/summary`} target="_blank">
      <b>{item.number}</b><span>{item.statusName}</span><time>{дата(item.registeredAt)}</time><p>{item.problem}</p>
    </Link>)}</div>
    <label className="wz-gate__confirm"><Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span>Ознакомился со списком. Это отдельное мероприятие, дублирования нет.</span></label>
    {error && <FieldError>{error}</FieldError>}
  </section>;
}

function TextField({ label, optional, value, onChange, invalid, area, rows, placeholder }: {
  label: string; optional?: boolean; value: string; onChange: (value: string) => void;
  invalid?: boolean; area?: boolean; rows?: number; placeholder?: string;
}) {
  const id = React.useId();
  const errorId = `${id}-error`;
  return <Field data-invalid={invalid}>
    <FieldLabel htmlFor={id}>{label}{optional && <span className="wz-optional">необязательно</span>}</FieldLabel>
    {area ? <Textarea id={id} value={value} rows={rows} placeholder={placeholder} aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
      onChange={(event) => onChange(event.target.value)} />
      : <Input id={id} value={value} placeholder={placeholder} aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined} onChange={(event) => onChange(event.target.value)} />}
    {invalid && <FieldError id={errorId}>Заполните поле.</FieldError>}
  </Field>;
}

function NumberField({ label, value, onChange, invalid, step }: {
  label: string; value: string; onChange: (value: string) => void; invalid?: boolean; step: string;
}) {
  const id = React.useId();
  const errorId = `${id}-error`;
  return <Field data-invalid={invalid}><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input id={id} type="number" inputMode="decimal" step={step} value={value} aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
      className="text-right tabular-nums" onChange={(event) => onChange(event.target.value)} />
    {invalid && <FieldError id={errorId}>Введите число.</FieldError>}
  </Field>;
}
