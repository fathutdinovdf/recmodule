/* Вкладка «Сводка»: содержание рекомендации и решение Заказчика.
 *
 * Решение 98 пересобрало верх вкладки: проблема и обоснование идут спокойным
 * текстовым потоком, рекомендация выделена Item, горизонт подтверждения здесь
 * не дублируется. Блок решения остаётся внизу намеренно — до действия человек
 * должен прочитать обоснование; кнопок решения в шапке нет по той же причине.
 *
 * Ожидаемый результат сюда не дублируется: он вынесен полосой прогноза под
 * шапку, где виден всегда и не уезжает за прокрутку.
 *
 * Форма решения раскрывается не состоянием, а параметром адреса `form`, и
 * ошибка возвращается параметром `err`: подтверждение переживает перезагрузку,
 * а ссылку на него можно переслать.
 *
 * Сама форма — окно поверх карточки, как действия из меню и разбор спора о
 * базе. Решение Заказчика необратимо (отменить принятие из интерфейса нельзя),
 * и между «нажал» и «сделано» должен стоять экран с последствиями. Заодно
 * кнопки остаются на месте: раньше форма занимала их место, и после её
 * открытия было не видно, от чего отказываешься. Цена — форма требует
 * JavaScript; тот же размен уже принят для остальных окон действий.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCard, type Card } from '@/db/card';
import { getRejectReasons } from '@/db/refs';
import { currentUser, type SessionUser } from '@/lib/session';
import { control, fmtDur } from '@/domain/workhours';
import { дата } from '@/lib/format';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { PlannedDatePicker } from '@/components/ui/PlannedDatePicker';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { окно } from '../form-meta';
import { решить, отметитьОткрытие } from '../actions';
import { ФормаДействия, ЖИЗНЕННЫЕ_ФОРМЫ, type ЖизненнаяФорма } from './lifecycle-forms';

export const dynamic = 'force-dynamic';

type Форма = 'accept' | 'reject' | 'clarify';

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ form?: string; err?: string }>;
}) {
  const { id } = await params;
  const { form, err } = await searchParams;
  const card = await getCard(Number(id));
  if (!card) notFound();

  /* Отметка об открытии до чтения пользователя не нужна, а вот сама карточка
     уже прочитана: getCard в cache(), оболочка взяла ту же строку. */
  await отметитьОткрытие(card.id, card.status);

  const [user, причины] = await Promise.all([currentUser(), getRejectReasons()]);
  const открытая: Форма | null = form === 'accept' || form === 'reject' || form === 'clarify'
    ? form : null;

  /* Форма действия из меню шапки показывается только Исполнителю: все эти
     операции — его. Заказчику меню и не отдаётся, но адрес можно ввести руками. */
  const действие = user?.side === 'executor'
    && ЖИЗНЕННЫЕ_ФОРМЫ.includes(form as ЖизненнаяФорма)
    ? form as ЖизненнаяФорма : null;

  return (
    <>
      {действие && <ФормаДействия card={card} вид={действие} ошибка={err} />}
      <div className="mb-[var(--section-gap-default)] flex flex-col gap-4">
        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 text-sm font-medium text-muted-foreground">Проблема / отклонение</h2>
          <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{card.problem}</p>
        </section>

        <Separator className="bg-border/50" />

        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 text-sm font-medium text-muted-foreground">Технологическое обоснование</h2>
          <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {card.rationale ?? 'Обоснование не заполнено.'}
          </p>
        </section>

        <Separator className="bg-border/50" />

        <Item variant="muted" size="sm" className="border-border">
          <ItemContent>
            <ItemTitle className="text-muted-foreground">Рекомендуемое мероприятие</ItemTitle>
            <ItemDescription className="whitespace-pre-wrap text-foreground">
              {card.action}
            </ItemDescription>
          </ItemContent>
        </Item>
      </div>

      <БлокРешения card={card} user={user} открытая={открытая} ошибка={err} причины={причины} />
    </>
  );
}

/* ------------------------------ блок решения ------------------------------ */

const ВИД_РЕШЕНИЯ: Record<string, { label: string; tag: string }> = {
  accept: { label: 'Принята', tag: 'ok' },
  reject: { label: 'Отклонена', tag: 'late' },
  clarify: { label: 'Требует уточнения', tag: 'warning' },
};

const ПОДПИСЬ_КОНТРОЛЯ: Record<string, string> = {
  ok: 'ответ в срок',
  late: 'ответ с опозданием на',
  overdue: 'просрочено на',
  waiting: 'до конца норматива осталось',
  pending: 'норматив ещё не пошёл',
  none: 'срок ответа не задан',
};

function БлокРешения({ card, user, открытая, ошибка, причины }: {
  card: Card;
  user: SessionUser | null;
  открытая: Форма | null;
  ошибка?: string;
  причины: { id: number; name: string }[];
}) {
  if (card.status === 'draft' || card.status === 'registered') {
    return (
      <div className="decision decision--done">
        <div className="decision__h">Решение Заказчика</div>
        <div className="decision__hint">
          Рекомендация ещё не передана Заказчику
          {card.status === 'registered' && card.sentAt
            ? `. Передача произойдёт ${дата(card.sentAt, true)}, с открытием рабочего дня.` : '.'}
        </div>
      </div>
    );
  }

  /* Отменённая рекомендация решения не получит никогда: её отменил Исполнитель
     до передачи, Заказчик её не видел. Без этой ветки блок доходил бы до
     кнопок «Принять / Отклонить», а они там бессмысленны. */
  if (card.status === 'cancelled') {
    return (
      <div className="decision decision--done">
        <div className="decision__h">Решение Заказчика</div>
        <div className="decision__hint">
          Рекомендация отменена Исполнителем до передачи — решения по ней нет и не будет.
        </div>
      </div>
    );
  }

  if (card.decision) return <ПринятоеРешение card={card} />;

  const c = control({
    status: card.status, sentAt: card.sentAt, dueAt: card.dueAt, repliedAt: card.repliedAt,
  });
  const срок = `${ПОДПИСЬ_КОНТРОЛЯ[c.kind] ?? ''}${
    c.kind === 'ok' || c.kind === 'none' || c.kind === 'pending' ? '' : ` ${fmtDur(c.hours)}`}`;

  /* Пользователь Заказчика без права решения видит ту же карточку целиком, но
     без кнопок: скрывать от него обоснование и срок незачем — по этой
     рекомендации ему работать, — а решение принимает уполномоченный сотрудник
     (решение 89). Исполнитель видит то же самое: рекомендация у Заказчика, и
     ответить за него он не может. */
  if (!user || user.side !== 'customer' || !user.canDecide) {
    return (
      <div className="decision decision--done">
        <div className="decision__h">Решение по рекомендации</div>
        <div className="decision__hint">
          Норматив ответа — {card.slaHours ?? '—'} рабочих часов с момента передачи, {срок}.
          {user?.side === 'executor'
            ? ' Рекомендация у Заказчика: ответ даёт он.'
            : ' Решение принимает уполномоченный сотрудник Заказчика; у вашей учётной записи права решения нет.'}
        </div>
      </div>
    );
  }

  return (
    <div className="decision">
      <div className="decision__h">Решение по рекомендации</div>
      <div className="decision__hint">
        При отклонении и запросе уточнения обоснование обязательно.
        Норматив ответа — {card.slaHours ?? '—'} рабочих часов с момента передачи, {срок}.
      </div>

      {/* Кнопки не прячутся под открытой формой: окно портируется наружу, и
          из-под него видно, по какой рекомендации принимается решение. */}
      <div className="decision__btns">
        <Button variant="success" asChild><Link href="?form=accept">Принять</Link></Button>
        <Button variant="destructive" asChild><Link href="?form=reject">Отклонить</Link></Button>
        <Button variant="warning" asChild><Link href="?form=clarify">Требует уточнения</Link></Button>
      </div>

      {открытая && <ОкноРешения card={card} вид={открытая} ошибка={ошибка} причины={причины} />}
    </div>
  );
}

function ПринятоеРешение({ card }: { card: Card }) {
  const d = card.decision!;
  const вид = ВИД_РЕШЕНИЯ[d.kind];
  const c = control({
    status: card.status, sentAt: card.sentAt, dueAt: card.dueAt, repliedAt: card.repliedAt,
  });

  return (
    <div className="decision decision--done">
      <div className="decision__h">Решение Заказчика</div>
      <div className="block__b"><span className={`tag tag--${вид.tag}`}>{вид.label}</span></div>

      <div className="decision__hint" style={{ marginTop: 'var(--item-gap-vertical-s)' }}>
        {card.openedAt
          ? `Карточку открыли ${дата(card.openedAt, true)}, ответ дан ${дата(d.at, true)}`
          : `Ответ дан ${дата(d.at, true)}`}
        {' — '}{ПОДПИСЬ_КОНТРОЛЯ[c.kind] ?? ''}
        {c.kind === 'ok' || c.kind === 'none' || c.kind === 'pending' ? '' : ` ${fmtDur(c.hours)}`}.
        {' '}Ответственный Заказчика: {d.actorName}.
        {d.plannedAt && ` Плановая дата работ — ${дата(d.plannedAt)}.`}
      </div>

      {/* Поле одно, но читается по-разному: при отказе это обоснование, при
          запросе уточнения — вопрос Исполнителю. Один заголовок на два случая
          сбивал: «Обоснование Заказчика: не ясно, требуется ли остановка». */}
      {d.comment && (
        <>
          <div className="block__h" style={{ marginTop: 'var(--group-gap-m)' }}>
            {d.kind === 'clarify' ? 'Что требуется уточнить'
              : `Обоснование Заказчика${d.reasonText ? ` · ${d.reasonText}` : ''}`}
          </div>
          <div className="block__b">{d.comment}</div>
        </>
      )}

      {/* Остаток норматива виден именно здесь: это первое, что спросит эксперт,
          получив рекомендацию назад, — сколько времени у Заказчика останется
          после того, как он допишет и передаст снова. */}
      {d.kind === 'clarify' && card.slaHoursLeft !== null && (
        <div className="decision__hint" style={{ marginTop: 'var(--group-gap-m)' }}>
          Норматив ответа приостановлен: из {card.slaHours} ч израсходовано
          {' '}{fmtDur(d.slaSpent ?? 0)}, после повторной передачи останется
          {' '}<b>{fmtDur(card.slaHoursLeft)}</b>.
        </div>
      )}
    </div>
  );
}

/* ------------------------------ формы ------------------------------ */

function ОкноРешения({ card, вид, ошибка, причины }: {
  card: Card;
  вид: Форма;
  ошибка?: string;
  причины: { id: number; name: string }[];
}) {
  const ошибкаПричины = вид === 'reject' && ошибка?.startsWith('Выберите причину') ? ошибка : undefined;
  const ошибкаТекста = ошибка && !ошибкаПричины ? ошибка : undefined;

  return (
    <ActionDialog {...окно(вид)}>
    <form action={решить.bind(null, вид, card.id)}>
      {вид === 'accept' && (
        <>
          <FieldGroup>
            <Field>
              <FieldLabel>Плановая дата работ <span className="text-muted-foreground">необязательно</span></FieldLabel>
              <PlannedDatePicker />
            </Field>
            <Field>
              <FieldLabel htmlFor="decision-comment">Комментарий <span className="text-muted-foreground">необязательно</span></FieldLabel>
              <Textarea id="decision-comment" name="text" rows={3}
                        placeholder="Например: работы включены в план на неделю, ответственный — мастер по добыче." />
            </Field>
          </FieldGroup>
        </>
      )}

      {вид === 'reject' && (
        <>
          <FieldGroup>
            <Field data-invalid={Boolean(ошибкаПричины)}>
              <FieldLabel htmlFor="reject-reason-kind">Причина</FieldLabel>
              <Combobox id="reject-reason-kind" name="reason" required invalid={Boolean(ошибкаПричины)}
                        placeholder="Выберите причину"
                        options={причины.map((r) => ({ value: r.name, label: r.name }))} />
              <FieldError>{ошибкаПричины}</FieldError>
            </Field>
            <Field data-invalid={Boolean(ошибкаТекста)}>
              <FieldLabel htmlFor="reject-reason">Обоснование <span className="text-muted-foreground">обязательно</span></FieldLabel>
              <Textarea id="reject-reason" name="text" rows={4}
                        aria-invalid={Boolean(ошибкаТекста)}
                        placeholder="Что сделано или планируется вместо рекомендованного, почему рекомендация не принимается." />
              <FieldError>{ошибкаТекста}</FieldError>
            </Field>
          </FieldGroup>
          <div className="form__hint">
            В реестре обоснование попадёт в колонку «Обоснование при отклонении».
          </div>
        </>
      )}

      {вид === 'clarify' && (
        <>
          <Field data-invalid={Boolean(ошибкаТекста)}>
            <FieldLabel htmlFor="clarify-request">Что требуется уточнить <span className="text-muted-foreground">обязательно</span></FieldLabel>
            <Textarea id="clarify-request" name="text" rows={4}
                      aria-invalid={Boolean(ошибкаТекста)}
                      placeholder="Какого расчёта, замера или пояснения не хватает для решения." />
            <FieldError>{ошибкаТекста}</FieldError>
          </Field>
          <div className="form__hint">
            Вся цепочка кругов уточнения сохраняется в истории.
          </div>
        </>
      )}

      <DialogFooter className="mt-4">
        <SubmitButton variant={КНОПКА[вид].вариант} pendingText="Отправляю…">
          {КНОПКА[вид].текст}
        </SubmitButton>
        {/* Отмена — штатное закрытие окна: так одинаково работают кнопка, Esc
            и клик мимо окна. */}
        <DialogClose asChild>
          <Button type="button" variant="outline">Отмена</Button>
        </DialogClose>
      </DialogFooter>
    </form>
    </ActionDialog>
  );
}

const КНОПКА: Record<Форма, { текст: string; вариант: 'success' | 'destructive' | 'warning' }> = {
  accept: { текст: 'Подтвердить решение', вариант: 'success' },
  reject: { текст: 'Отклонить', вариант: 'destructive' },
  clarify: { текст: 'Отправить запрос', вариант: 'warning' },
};
