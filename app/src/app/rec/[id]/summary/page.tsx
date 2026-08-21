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
 * Форма решения раскрывается состоянием, а не переходом: окно стоит в
 * разметке закрытым, кнопка на вкладке — его `trigger`. `?form=…` задаёт лишь
 * НАЧАЛЬНУЮ открытость (присланная ссылка, перезагрузка) — тот же приём, что у
 * спора о базе (`useОкноДействия`).
 *
 * Сама форма — окно поверх карточки, как действия из меню и разбор спора о
 * базе. Решение Заказчика необратимо (отменить принятие из интерфейса нельзя),
 * и между «нажал» и «сделано» должен стоять экран с последствиями. Заодно
 * кнопки остаются на месте: раньше форма занимала их место, и после её
 * открытия было не видно, от чего отказываешься. Цена — форма требует
 * JavaScript; тот же размен уже принят для остальных окон действий.
 */

import { notFound } from 'next/navigation';
import { getCard, type Card } from '@/db/card';
import { getRejectReasons } from '@/db/refs';
import { currentUser, type SessionUser } from '@/lib/session';
import { этоРешающий } from '@/lib/access';
import { control, fmtDur } from '@/domain/workhours';
import { дата } from '@/lib/format';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { отметитьОткрытие } from '../actions';
import { ФормыДействий } from './lifecycle-forms';
import { ОкноПринятия, ОкноОтклонения, ОкноУточнения } from './decision-forms';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ form?: string }>;
}) {
  const { id } = await params;
  const { form } = await searchParams;
  const card = await getCard(Number(id));
  if (!card) notFound();

  /* Отметка об открытии до чтения пользователя не нужна, а вот сама карточка
     уже прочитана: getCard в cache(), оболочка взяла ту же строку. */
  await отметитьОткрытие(card.id, card.status);

  const [user, причины] = await Promise.all([currentUser(), getRejectReasons()]);

  /* Формы действий из меню шапки показываются только Исполнителю: все эти
     операции — его. Заказчику меню и не отдаётся, но адрес можно ввести руками. */
  const исполнитель = user?.side === 'executor';

  return (
    <>
      {исполнитель && <ФормыДействий card={card} форма={form} />}
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

      <БлокРешения card={card} user={user} форма={form} причины={причины} />
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

function БлокРешения({ card, user, форма, причины }: {
  card: Card;
  user: SessionUser | null;
  форма?: string;
  причины: { id: number; name: string }[];
}) {
  /* Блок «Решение Заказчика» показывается только пока рекомендация у него на
     решении и когда решение — отказ; на остальных статусах (черновик,
     зарегистрирована, отменена, принята, уточнение) он ничего не добавляет к
     уже видной вкладке и только занимает место. */
  if (card.status === 'draft' || card.status === 'registered' || card.status === 'cancelled') {
    return null;
  }

  if (card.decision) {
    return card.decision.kind === 'reject' ? <ПринятоеРешение card={card} /> : null;
  }

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
  if (!user || !этоРешающий(user)) {
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

      {/* Кнопка — она же `trigger` своего окна: открытие мгновенное, без
          навигации, и из-под открытого окна по-прежнему видно, по какой
          рекомендации принимается решение. */}
      <div className="decision__btns">
        <ОкноПринятия card={card} стартОткрыто={форма === 'accept'} />
        <ОкноОтклонения card={card} причины={причины} стартОткрыто={форма === 'reject'} />
        <ОкноУточнения card={card} стартОткрыто={форма === 'clarify'} />
      </div>
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

