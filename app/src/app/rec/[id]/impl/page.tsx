/* Вкладка «Реализация»: факт, окно эффекта и спор о дате.
 *
 * Три состояния, а не одно с ветвлениями внутри: до согласования показывать
 * нечего, после согласования вкладка — это одна кнопка Исполнителя, после
 * фиксации — карточка факта плюс разбирательство о дате. Промежуточных
 * состояний у реализации нет: она либо зафиксирована, либо нет (решение 12,
 * полнота — поле, а не статус).
 *
 * Кто что делает: факт и дату определяет Исполнитель по телеметрии, Заказчик
 * вправе дату оспорить, пока окно не закрыто. Обе стороны видят вкладку
 * целиком — скрывать от Заказчика то, по чему ему потом принимать эффект,
 * незачем; различаются только кнопки.
 *
 * Формы раскрываются параметром адреса `form`, ошибка возвращается в `err` —
 * тот же приём, что на сводке: вкладка переживает перезагрузку и работает без
 * JavaScript.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCard, type Card, type CardDispute } from '@/db/card';
import { currentUser, type SessionUser } from '@/lib/session';
import { WINDOW_DAYS, getEffect } from '@/services/effect-store';
import { дата, рубли, сутки } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Textarea } from '@/components/ui/Textarea';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { ФормаФиксации } from './fix-form';
import { зафиксировать, оспоритьДату, принятьДату, отклонитьВозражение } from './actions';
import { закрытьОкноДосрочно } from '../lifecycle';

export const dynamic = 'force-dynamic';

/* Почему вкладка пуста — по статусу. Общее «реализация ещё не начиналась»
   ничего не объясняет: на «Отклонено» её не будет никогда, а на «Передано»
   она ждёт ответа Заказчика, и это разные новости. */
const ПОЧЕМУ_ПУСТО: Record<string, string> = {
  draft: 'Черновик ещё не зарегистрирован — реализовывать нечего.',
  registered: 'Рекомендация зарегистрирована, но не передана Заказчику: решения по ней пока нет.',
  sent: 'Рекомендация у Заказчика. Реализация начинается после согласования.',
  review: 'Рекомендация на рассмотрении у Заказчика. Реализация начинается после согласования.',
  clarify: 'Рекомендация вернулась Исполнителю на уточнение. До ответа Заказчика реализации нет.',
  rejected: 'Рекомендация отклонена Заказчиком — реализации по ней не будет.',
  cancelled: 'Рекомендация отменена Исполнителем — реализации по ней не будет.',
};

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ form?: string; err?: string; compl?: string }>;
}) {
  const { id } = await params;
  const { form, err, compl } = await searchParams;
  const card = await getCard(Number(id));
  if (!card) notFound();

  const user = await currentUser();
  const исполнитель = user?.side === 'executor';

  if (card.status === 'approved') {
    return (
      <ФактНеЗафиксирован card={card} исполнитель={исполнитель}
                         форма={form === 'fact'} ошибка={err} полнота={compl} />
    );
  }

  if (!card.implementation) {
    return <div className="empty-pane">{ПОЧЕМУ_ПУСТО[card.status] ?? 'Реализация ещё не начиналась.'}</div>;
  }

  const impl = card.implementation;
  const закрыто = impl.closedAt !== null || new Date() >= impl.windowCloseAt;
  const осталось = Math.ceil((impl.windowCloseAt.getTime() - Date.now()) / 86400000);
  const спор = card.disputes.find((d) => d.subject === 'fact_date') ?? null;

  return (
    <>
      <div className="block">
        <div className="block__h">Фактическая реализация</div>
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__k">Дата реализации</span>
            <span className="kpi__v">{дата(impl.factDate)}</span>
          </div>
          <div className="kpi">
            <span className="kpi__k">Полнота</span>
            <span className="kpi__v">
              {card.completeness === 'partial' ? 'Частично'
                : card.completeness === 'full' ? 'Полностью' : '—'}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi__k">Окно открыто</span>
            <span className="kpi__v">{дата(impl.windowOpenAt)}</span>
          </div>
          <div className="kpi">
            <span className="kpi__k">{impl.closedAt ? 'Окно закрыто' : 'Окно закрывается'}</span>
            <span className="kpi__v">
              {дата(impl.closedAt ?? impl.windowCloseAt)}
              {impl.closedAt
                ? <small> {impl.closedEarly ? 'досрочно' : 'по сроку'}</small>
                : !закрыто && <small> {осталось > 0 ? `осталось ${сутки(осталось)}` : 'сегодня'}</small>}
            </span>
          </div>
        </div>

        <div className="form__hint" style={{ marginTop: 'var(--item-gap-vertical-s)' }}>
          Зафиксировал {impl.fixedByName}, {дата(impl.fixedAt, true)}. Окно в {WINDOW_DAYS} суток
          отсчитывается от даты реализации, а не от момента фиксации.
        </div>

        {/* Что не выполнено — под фактом, а не в отдельном блоке: при частичной
            реализации это часть самого факта, и от неё зависит, чего ждать от
            эффекта. */}
        {card.completeness === 'partial' && card.completenessNote && (
          <>
            <div className="block__h" style={{ marginTop: 'var(--group-gap-m)' }}>Что не выполнено</div>
            <div className="block__b">{card.completenessNote}</div>
          </>
        )}

        {impl.note && <div className="block__b" style={{ marginTop: 'var(--item-gap-vertical-s)' }}>{impl.note}</div>}
      </div>

      {/* Досрочное закрытие приходит из меню шапки и раскрывается здесь: окно
          живёт на этой вкладке, и решение о его закрытии принимают, глядя на
          даты окна, а не на пункт меню. */}
      {form === 'close' && исполнитель && !закрыто && (
        <ФормаЗакрытия card={card} ошибка={err} />
      )}

      <БлокСпора card={card} спор={спор} исполнитель={исполнитель} user={user}
                 закрыто={закрыто} форма={form} ошибка={err} />
    </>
  );
}

/* ------------------------------ до фиксации ------------------------------ */

function ФактНеЗафиксирован({ card, исполнитель, форма, ошибка, полнота }: {
  card: Card;
  исполнитель: boolean;
  форма: boolean;
  ошибка?: string;
  полнота?: string;
}) {
  return (
    <div className="block">
      <div className="block__h">Факт реализации</div>
      <div className="block__b">
        Факт и дату реализации определяет Исполнитель. Эксперт ведёт скважину по телеметрии
        в ВМАП; смена режима или параметров — частоты, давления на приёме, загрузки ПЭД,
        программы периодического режима — означает, что рекомендованное мероприятие выполнено.
        Увидев изменение, эксперт фиксирует реализацию здесь, и этим же действием открывается
        окно подтверждения эффекта на {WINDOW_DAYS} суток.
      </div>

      {форма && исполнитель
        ? <ФормаФиксации action={зафиксировать.bind(null, card.id)} ошибка={ошибка} полнота={полнота} />
        : исполнитель ? (
          <div className="form__btns" style={{ marginTop: 'var(--group-gap-m)' }}>
            <Button asChild><Link href="?form=fact">Зафиксировать реализацию</Link></Button>
            <span className="form__note">Действие Исполнителя</span>
          </div>
        ) : (
          <div className="form__hint" style={{ marginTop: 'var(--group-gap-m)' }}>
            {card.decision?.plannedAt
              ? `Работы запланированы на ${дата(card.decision.plannedAt)}. `
              : ''}
            Фиксацию делает Исполнитель, когда увидит изменение режима в телеметрии.
          </div>
        )}
    </div>
  );
}

/* ------------------------------ досрочное закрытие ------------------------------ */

async function ФормаЗакрытия({ card, ошибка }: { card: Card; ошибка?: string }) {
  const impl = card.implementation!;

  /* Накопленный итог показывается в самом окне: закрывая окно досрочно,
     человек отказывается от остальных суток, и решение принимают, глядя на
     то, сколько уже насчитано и сколько суток отбрасывается. Расчёт ходит на
     стенд ВМАП и может не ответить — тогда окно остаётся с датами. */
  const eff = await getEffect(card).catch(() => null);

  return (
    <ActionDialog
      tone="danger"
      title="Закрыть окно досрочно"
      description="Сутки после закрытия в расчёт не войдут, итог станет окончательным. Открыть окно заново будет нельзя."
      facts={(
        <>
          Окно открыто {дата(impl.windowOpenAt)}, прошло {eff ? eff.elapsedDays : '—'} из {WINDOW_DAYS} суток.
          {eff && eff.days.some((d) => d.money !== null)
            && <> Итог на сейчас: {рубли(eff.total.total)} руб.</>}
        </>
      )}
    >
      <form action={закрытьОкноДосрочно.bind(null, card.id)}>
        <Field data-invalid={Boolean(ошибка)}>
          <FieldLabel htmlFor="close-reason">
            Причина <span className="text-muted-foreground">обязательно</span>
          </FieldLabel>
          <Textarea id="close-reason" name="text" rows={3} aria-invalid={Boolean(ошибка)}
                    placeholder="Скважина остановлена в ремонт" />
          {ошибка && <FieldError>{ошибка}</FieldError>}
        </Field>
        <DialogFooter className="mt-4">
          <SubmitButton variant="destructive" pendingText="Закрываю…">Закрыть окно</SubmitButton>
          <DialogClose asChild>
            <Button type="button" variant="outline">Отмена</Button>
          </DialogClose>
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

/* ------------------------------ спор о дате ------------------------------ */

function БлокСпора({ card, спор, исполнитель, user, закрыто, форма, ошибка }: {
  card: Card;
  спор: CardDispute | null;
  исполнитель: boolean;
  user: SessionUser | null;
  закрыто: boolean;
  форма?: string;
  ошибка?: string;
}) {
  const impl = card.implementation!;

  if (!спор || спор.state !== 'open') {
    /* Разрешённый спор остаётся в карточке навсегда: по нему видно, почему
       окно считается от этой даты, а не от той, что называл Заказчик. */
    const прошлый = спор && спор.state !== 'open' ? спор : null;

    return (
      <>
        {прошлый && (
          <div className="block block--quiet">
            <div className="block__h">Спор о дате реализации</div>
            <div className="block__b">{прошлый.reason}</div>
            <div className="alertbox__m">
              {дата(прошлый.openedAt, true)}, {прошлый.openedByName} — {прошлый.state === 'accepted'
                ? `дата изменена на ${дата(impl.factDate)}, окно пересчитано ${дата(прошлый.resolvedAt, true)}`
                : `возражение отклонено ${дата(прошлый.resolvedAt, true)}${прошлый.resolutionNote ? `: ${прошлый.resolutionNote}` : ''}`}
            </div>
          </div>
        )}

        {!прошлый && !закрыто && (
          <div className="block">
            <div className="block__h">Дата реализации</div>
            <div className="block__b">
              Дату определил Исполнитель по телеметрии. Заказчик вправе с ней не согласиться,
              пока окно не закрыто: после закрытия эффект финализирован.
            </div>
            {форма === 'dispute' && user?.side === 'customer'
              ? <ФормаВозражения card={card} ошибка={ошибка} />
              : user?.side === 'customer' ? (
                <div className="form__btns" style={{ marginTop: 'var(--group-gap-m)' }}>
                  <Button variant="outline" asChild>
                    <Link href="?form=dispute">Оспорить дату реализации</Link>
                  </Button>
                  <span className="form__note">Действие Заказчика</span>
                </div>
              ) : null}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="alertbox">
      <div className="alertbox__h">Дата реализации оспорена Заказчиком</div>
      <div className="alertbox__b">{спор.reason}</div>
      <div className="alertbox__m">
        {дата(спор.openedAt, true)}, {спор.openedByName} · предлагаемая
        дата <b>{дата(спор.proposedDate)}</b> вместо {дата(impl.factDate)} · расчёт эффекта
        до снятия возражения предварительный
      </div>

      {форма === 'declineDispute' && исполнитель
        ? <ФормаОтклонения card={card} спор={спор} ошибка={ошибка} />
        : исполнитель ? (
          <div className="form__btns">
            <form action={принятьДату.bind(null, card.id, спор.id)}>
              <Button type="submit" variant="success">Принять дату Заказчика</Button>
            </form>
            <Button variant="outline" asChild>
              <Link href="?form=declineDispute">Отклонить возражение</Link>
            </Button>
            <span className="form__note">Действие Исполнителя</span>
          </div>
        ) : (
          <div className="form__hint">Возражение разбирает Исполнитель: он же определял дату по телеметрии.</div>
        )}
    </div>
  );
}

function ФормаВозражения({ card, ошибка }: { card: Card; ошибка?: string }) {
  const impl = card.implementation!;
  const ошибкаДаты = ошибка && ошибка.includes('дат') && !ошибка.startsWith('Обоснование');

  return (
    <form className="form" action={оспоритьДату.bind(null, card.id)}>
      <div className="form__h">Возражение по дате реализации</div>

      <Field data-invalid={Boolean(ошибкаДаты)}>
        <FieldLabel htmlFor="proposed-date">
          Дата, которую считаете верной <span className="text-muted-foreground">обязательно</span>
        </FieldLabel>
        <DatePicker id="proposed-date" name="proposed_date" label="Дата, которую считаете верной"
                    defaultValue={impl.factDate} invalid={Boolean(ошибкаДаты)}
                    disabled={{ after: new Date() }} endMonth={new Date()} />
        {ошибкаДаты && <FieldError>{ошибка}</FieldError>}
      </Field>

      <Field className="mt-[var(--group-gap-m)]" data-invalid={Boolean(ошибка && !ошибкаДаты)}>
        <FieldLabel htmlFor="dispute-reason">
          Обоснование <span className="text-muted-foreground">обязательно</span>
        </FieldLabel>
        <Textarea id="dispute-reason" name="text" rows={4} aria-invalid={Boolean(ошибка && !ошибкаДаты)}
                  placeholder="Почему изменение режима в указанные сутки не связано с выполнением рекомендации." />
        {ошибка && !ошибкаДаты && <FieldError>{ошибка}</FieldError>}
      </Field>

      <div className="form__hint">
        Окно эффекта не останавливается: суточные значения считаются по настоящим замерам
        телеметрии, поэтому смена даты просто сдвигает {WINDOW_DAYS} суток по тем же данным.
        До снятия возражения расчёт эффекта считается предварительным.
      </div>

      <div className="form__btns">
        <Button type="submit" variant="warning">Отправить возражение</Button>
        <Button variant="outline" asChild><Link href="?">Отмена</Link></Button>
      </div>
    </form>
  );
}

function ФормаОтклонения({ card, спор, ошибка }: {
  card: Card;
  спор: CardDispute;
  ошибка?: string;
}) {
  return (
    <form className="form" action={отклонитьВозражение.bind(null, card.id, спор.id)}>
      <div className="form__h">Отклонить возражение</div>

      <Field data-invalid={Boolean(ошибка)}>
        <FieldLabel htmlFor="decline-reason">
          Обоснование <span className="text-muted-foreground">обязательно</span>
        </FieldLabel>
        <Textarea id="decline-reason" name="text" rows={3} aria-invalid={Boolean(ошибка)}
                  placeholder="Почему дата остаётся прежней: что показывает телеметрия в спорные сутки." />
        {ошибка && <FieldError>{ошибка}</FieldError>}
      </Field>

      <div className="form__hint">
        Дата остаётся прежней, пометка о споре сохраняется в карточке и в истории.
        Дальнейшее разбирательство идёт вне модуля, по разделу 10 договора.
      </div>

      <div className="form__btns">
        <Button type="submit" variant="destructive">Отклонить возражение</Button>
        <Button variant="outline" asChild><Link href="?">Отмена</Link></Button>
      </div>
    </form>
  );
}
