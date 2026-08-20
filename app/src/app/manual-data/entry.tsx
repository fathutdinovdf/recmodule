'use client';

/* Форма ввода суточного факта за месяц.
 *
 * Клиентская из-за трёх вещей: выбор скважины и месяца двигает адрес,
 * счётчик заполненных суток пересчитывается по мере ввода, и отправка идёт
 * через useActionState ради состояния «сохраняется». Сами поля
 * неуправляемые — тридцать одна пара чисел в состоянии React ничего не даёт,
 * кроме перерисовок на каждую нажатую клавишу; значения собирает браузер, а
 * сервер разбирает их по именам «q-14»/«w-14».
 *
 * Оформление — shadcn поверх классов макета: рамка и заголовок берутся у
 * `.panel` и `.pagehead`, чтобы экран не выглядел чужим рядом с реестром, а
 * поля, кнопки и пустое состояние — у общих компонентов.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Gauge, Droplets, CircleAlert } from 'lucide-react';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Hint } from '@/components/ui/Hint';
import { сохранитьФакт, type SaveFactsState } from './actions';
import type { DayFact } from '@/db/daily-facts';
import type { RegistrationVmapWell } from '@/db/wells-data';

const МЕСЯЦЫ = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль',
  'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const ДНИ = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const мес = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const число = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));

export function ФормаСуток({ скважины, скважина, year, month, сутки, ручнойРежим }: {
  скважины: RegistrationVmapWell[];
  скважина: RegistrationVmapWell | null;
  year: number;
  month: number;
  сутки: DayFact[];
  ручнойРежим: boolean;
}) {
  const router = useRouter();
  const [состояние, отправить] = React.useActionState<SaveFactsState, FormData>(
    сохранитьФакт, {},
  );

  const [месторождение, setМесторождение] = React.useState(
    скважина ? String(скважина.fieldId) : '',
  );

  /* Заполненность считается по введённым в поля значениям, а не по тому, что
     пришло с сервера: человек видит, как счётчик растёт по ходу ввода, ещё до
     сохранения. */
  const [заполнено, setЗаполнено] = React.useState(0);
  const форма = React.useRef<HTMLFormElement>(null);

  const пересчитать = React.useCallback(() => {
    const f = форма.current;
    if (!f) return;
    let n = 0;
    for (const сутки of f.querySelectorAll<HTMLInputElement>('input[name^="q-"]')) {
      if (сутки.value.trim()) n++;
    }
    setЗаполнено(n);
  }, []);

  /* Ключ формы завязан на скважину, месяц и число сохранений: поля
     неуправляемые, и без пересоздания браузер оставил бы в них старые
     значения при смене периода или после успешной записи. */
  const ключ = `${скважина?.wellId ?? 0}:${year}-${month}:${состояние.saved ?? ''}`;
  React.useEffect(пересчитать, [ключ, пересчитать]);

  const месторождения = React.useMemo(() => {
    const карта = new Map<number, string>();
    for (const w of скважины) карта.set(w.fieldId, w.fieldName);
    return [...карта].map(([id, name]) => ({ value: String(id), label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [скважины]);

  const скважиныПоля = React.useMemo(
    () => скважины.filter((w) => String(w.fieldId) === месторождение),
    [скважины, месторождение],
  );

  const перейти = (wellId: string, y = year, m = month) => {
    router.push(wellId ? `/manual-data?well=${wellId}&month=${мес(y, m)}` : '/manual-data');
  };

  const сдвиг = (шаг: number) => {
    const d = new Date(year, month - 1 + шаг, 1);
    перейти(скважина ? String(скважина.wellId) : '', d.getFullYear(), d.getMonth() + 1);
  };

  const сегодня = new Date();
  const текущийМесяц = year === сегодня.getFullYear() && month === сегодня.getMonth() + 1;
  const будущее = new Date(year, month, 1) > new Date(сегодня.getFullYear(), сегодня.getMonth(), 1);
  /* Сутки вперёд заполнять нечем: факта за них ещё нет. Ограничение видимое —
     поле выключено, — а не молчаливое отбрасывание при сохранении. */
  const доступныхСуток = текущийМесяц ? сегодня.getDate() : сутки.length;
  const доля = доступныхСуток ? Math.round((заполнено / доступныхСуток) * 100) : 0;

  return (
    <main className="content">
      <div className="pagehead">
        <h1>Суточные данные</h1>
        <span className="pagehead__zone">
          {скважина
            ? `скважина ${скважина.number}, ${МЕСЯЦЫ[month - 1]} ${year}`
            : 'скважина не выбрана'}
        </span>
        <div className="pagehead__actions">
          <Badge variant={ручнойРежим ? 'default' : 'outline'}>
            {ручнойРежим ? 'Ручной источник данных' : 'Источник данных — ВМАП'}
          </Badge>
        </div>
      </div>

      {/* Экран доступен и при работе от стенда: так данные можно подготовить
          заранее, до переключения. Но молчать об этом нельзя — иначе введённые
          числа выглядят действующими, а расчёт идёт мимо них. */}
      {!ручнойРежим && (
        <section className="panel" style={{ padding: 'var(--section-padding)' }}>
          <div className="flex items-start gap-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" aria-hidden />
            <p className="text-[var(--text-secondary)]">
              Сейчас модуль берёт замеры со стенда ВМАП, и введённые здесь числа
              в расчёт не идут. Они сохранятся и заработают, когда источником
              станет своя база — <code>DATA_SOURCE=manual</code>.
            </p>
          </div>
        </section>
      )}

      <section className="panel" style={{ padding: 'var(--section-padding)' }}>
        <div className="flex flex-wrap items-end gap-4">
          <Field className="w-[280px]">
            <FieldLabel htmlFor="md-field">Месторождение</FieldLabel>
            <Combobox id="md-field" name="fieldPicker" value={месторождение}
              onValueChange={(v) => { setМесторождение(v); перейти(''); }}
              options={месторождения} searchable
              placeholder="Выберите месторождение" />
          </Field>

          <Field className="w-[220px]">
            <FieldLabel htmlFor="md-well">Скважина</FieldLabel>
            <Combobox id="md-well" name="wellPicker"
              value={скважина ? String(скважина.wellId) : ''}
              onValueChange={(v) => перейти(v)}
              disabled={!месторождение}
              options={скважиныПоля.map((w) => ({
                value: String(w.wellId), label: w.number, note: `куст ${w.kust}`,
              }))}
              searchable placeholder="Выберите скважину" />
          </Field>

          <Field className="w-auto">
            <FieldLabel>Период</FieldLabel>
            <div className="flex items-center gap-1">
              <Hint text="Предыдущий месяц">
                <Button type="button" variant="outline" size="icon"
                  onClick={() => сдвиг(-1)} aria-label="Предыдущий месяц">
                  <ChevronLeft className="size-4" />
                </Button>
              </Hint>
              <span className="min-w-[150px] text-center text-sm font-medium tabular-nums">
                {МЕСЯЦЫ[month - 1]} {year}
              </span>
              <Hint text={будущее ? 'Следующий месяц ещё не наступил' : 'Следующий месяц'}>
                <Button type="button" variant="outline" size="icon" disabled={текущийМесяц}
                  onClick={() => сдвиг(1)} aria-label="Следующий месяц">
                  <ChevronRight className="size-4" />
                </Button>
              </Hint>
            </div>
          </Field>

          {скважина && (
            <div className="ml-auto min-w-[220px]">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-xs text-[var(--text-tertiary)]">Заполнено суток</span>
                <span className="text-sm font-medium tabular-nums">
                  {заполнено} из {доступныхСуток}
                </span>
              </div>
              <Progress value={доля} />
            </div>
          )}
        </div>
      </section>

      {!скважина ? (
        <section className="panel" style={{ padding: 'var(--section-padding)' }}>
          <Empty className="border border-dashed border-[var(--border-divider)]">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Gauge /></EmptyMedia>
              <EmptyTitle>Выберите скважину</EmptyTitle>
              <EmptyDescription>
                Дебит жидкости и обводнённость вводятся по одной скважине за
                календарный месяц. Расчёт базы берёт трое суток перед
                регистрацией рекомендации, поэтому факт стоит вводить, не
                откладывая.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </section>
      ) : (
        <form key={ключ} ref={форма} action={отправить} onInput={пересчитать}>
          <input type="hidden" name="wellId" value={скважина.wellId} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />

          <section className="panel">
            <div className="tablewrap">
              <table className="tbl" style={{ width: 640 }}>
                <colgroup>
                  <col style={{ width: 140 }} />
                  <col style={{ width: 250 }} />
                  <col style={{ width: 250 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th><span className="th"><span className="th__t">Сутки</span></span></th>
                    <th>
                      <span className="th">
                        <span className="th__t">
                          <Gauge className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
                          Дебит жидкости, м³/сут
                        </span>
                      </span>
                    </th>
                    <th>
                      <span className="th">
                        <span className="th__t">
                          <Droplets className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
                          Обводнённость, %
                        </span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {сутки.map((с) => {
                    const дата = new Date(year, month - 1, с.day);
                    const впереди = текущийМесяц && с.day > сегодня.getDate();
                    const этоСегодня = текущийМесяц && с.day === сегодня.getDate();
                    const выходной = дата.getDay() === 0 || дата.getDay() === 6;
                    return (
                      <tr key={с.day} className={впереди ? 'row-muted' : ''}>
                        <td>
                          <span className="tabular-nums">
                            {String(с.day).padStart(2, '0')}.{String(month).padStart(2, '0')}
                          </span>
                          <span className={`ml-2 text-xs ${выходной
                            ? 'text-[var(--status-error)]' : 'text-[var(--text-tertiary)]'}`}>
                            {ДНИ[дата.getDay()]}
                          </span>
                          {этоСегодня && (
                            <Badge variant="secondary" className="ml-2">сегодня</Badge>
                          )}
                        </td>
                        <td>
                          <Input name={`q-${с.day}`} inputMode="decimal" className="text-right"
                            defaultValue={число(с.qzh)} disabled={впереди}
                            placeholder={впереди ? '' : '—'}
                            aria-label={`Дебит жидкости, ${с.day} число`} />
                        </td>
                        <td>
                          <Input name={`w-${с.day}`} inputMode="decimal" className="text-right"
                            defaultValue={число(с.watercut)} disabled={впереди}
                            placeholder={впереди ? '' : '—'}
                            aria-label={`Обводнённость, ${с.day} число`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 border-t border-[var(--border-divider-light)]
                            px-[var(--section-padding)] py-3">
              <SubmitButton pendingText="Сохраняем…">Сохранить</SubmitButton>
              {состояние.error && (
                <span className="text-sm text-[var(--status-error)]">{состояние.error}</span>
              )}
              {состояние.saved !== undefined && !состояние.error && (
                <span className="text-sm text-[var(--text-secondary)]">
                  {состояние.saved === 0
                    ? 'Изменений не было'
                    : `Сохранено значений: ${состояние.saved}`}
                </span>
              )}
              <span className="ml-auto text-xs text-[var(--text-tertiary)]">
                Пустое поле — «нет данных». Ноль означает остановленную скважину.
              </span>
            </div>
          </section>
        </form>
      )}
    </main>
  );
}
