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
 * Окна показываются поверх карточки, состоянием, а не переходом: они стоят в
 * разметке закрытыми, кнопка на вкладке — их `trigger` (кроме досрочного
 * закрытия — его открывает только пункт меню в шапке). `?form=…` задаёт лишь
 * НАЧАЛЬНУЮ открытость — тот же приём, что у спора о базе (`useОкноДействия`,
 * клиентская половина — `action-forms.tsx`). Кнопки при этом остаются на
 * месте — из-под окна видно, о какой дате спор.
 */

import { notFound } from 'next/navigation';
import { getCard, type Card, type CardDispute } from '@/db/card';
import { currentUser, type SessionUser } from '@/lib/session';
import { WINDOW_DAYS } from '@/services/effect-store';
import { дата, сутки } from '@/lib/format';
import {
  ОкноФиксации, ФормаЗакрытия, ОкноВозражения, ОкноПринятияДаты, ОкноОтклонения,
} from './action-forms';

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
  searchParams: Promise<{ form?: string }>;
}) {
  const { id } = await params;
  const { form } = await searchParams;
  const [card, user] = await Promise.all([getCard(Number(id)), currentUser()]);
  if (!card) notFound();

  const исполнитель = user?.side === 'executor';

  if (card.status === 'approved') {
    return (
      <ФактНеЗафиксирован card={card} исполнитель={исполнитель} стартОткрыто={form === 'fact'} />
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

      {/* Досрочное закрытие приходит из меню шапки: своей кнопки на вкладке у
          него нет, окно стоит здесь же — решение о его закрытии принимают,
          глядя на даты окна, а не на пункт меню. */}
      {исполнитель && !закрыто && (
        <ФормаЗакрытия card={card} стартОткрыто={form === 'close'} />
      )}

      <БлокСпора card={card} спор={спор} исполнитель={исполнитель} user={user}
                 закрыто={закрыто} форма={form} />
    </>
  );
}

/* ------------------------------ до фиксации ------------------------------ */

function ФактНеЗафиксирован({ card, исполнитель, стартОткрыто }: {
  card: Card;
  исполнитель: boolean;
  стартОткрыто: boolean;
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

      {исполнитель ? (
          <div className="form__btns" style={{ marginTop: 'var(--group-gap-m)' }}>
            <ОкноФиксации card={card} стартОткрыто={стартОткрыто} />
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

/* ------------------------------ спор о дате ------------------------------ */

function БлокСпора({ card, спор, исполнитель, user, закрыто, форма }: {
  card: Card;
  спор: CardDispute | null;
  исполнитель: boolean;
  user: SessionUser | null;
  закрыто: boolean;
  форма?: string;
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
            {user?.side === 'customer' && (
              <div className="form__btns" style={{ marginTop: 'var(--group-gap-m)' }}>
                <ОкноВозражения card={card} стартОткрыто={форма === 'dispute'} />
                <span className="form__note">Действие Заказчика</span>
              </div>
            )}
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

      {исполнитель ? (
          /* Принятие тоже идёт через окно, а не отправляется сразу: оно
             переносит окно эффекта целиком и стирает посуточный расчёт — это
             не то, что делают одним кликом из ленты. */
          <div className="form__btns">
            <ОкноПринятияДаты card={card} спор={спор} стартОткрыто={форма === 'acceptDispute'} />
            <ОкноОтклонения card={card} спор={спор} стартОткрыто={форма === 'declineDispute'} />
            <span className="form__note">Действие Исполнителя</span>
          </div>
        ) : (
          <div className="form__hint">Возражение разбирает Исполнитель: он же определял дату по телеметрии.</div>
        )}
    </div>
  );
}
