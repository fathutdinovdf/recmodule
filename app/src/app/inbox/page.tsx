/* Инбокс «Мои задачи».
 *
 * Зачем экран существует. Быстрых действий по решению в строке реестра нет
 * намеренно (решение 3): человек обязан открыть карточку и прочитать
 * обоснование. Значит уложиться в норматив ответа можно только одним способом —
 * сразу видеть, что горит, и попадать в нужную карточку одним кликом. Инбокс
 * это и делает: он не даёт действий, он сокращает путь до них.
 *
 * Про сам норматив: 4 / 8 / 24 рабочих часа в договоре не написаны, они пришли
 * из Формы 2 и оставлены как рабочее правило (решение 64). Поэтому на экране
 * они нигде не названы договорными — «норматив ответа», и всё.
 *
 * Отсюда три правила экрана (перенесены из макет/inbox.js):
 *   1. Каждая строка — ссылка в карточку, и по возможности сразу в ту вкладку,
 *      где лежит нужное действие (/rec/[id]/impl).
 *   2. Порядок внутри блока — «сначала горит»: самое давнее сверху, у окон —
 *      ближайшее закрытие.
 *   3. Блоки делятся на два сорта: «ход за мной» (hot/warn, помечены act) и
 *      «под наблюдением» (calm). В значок бокового меню должны попадать только
 *      первые — иначе он показывал бы объём ведения, а не число дел на сегодня.
 *
 * Композиция — лента блоков, а не таблица с фильтрами: у задач разных сортов
 * разные «когда» и «что дальше», в общих колонках они бы усреднились до
 * нечитаемого. Плитки сверху — якоря к блокам: быстрый ответ «что горит»
 * без прокрутки. Состояния: у блока свой честный пустой текст (пустой блок —
 * тоже ответ, срез существует); роль без собранного инбокса получает заглушку
 * со ссылкой в реестр, а не пустой экран; администратору инбокс не положен
 * вовсе (решение 82) — у него и задач по рекомендациям не бывает.
 *
 * Сейчас собран только инбокс эксперта Исполнителя. Остальные роли добавляются
 * новым билдером в БИЛДЕРЫ — состав блоков у каждой свой (см. макет/inbox.js),
 * каркас экрана общий.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Inbox as InboxIcon } from 'lucide-react';
import { currentUser, type SessionUser } from '@/lib/session';
import { этоАдминистратор } from '@/lib/access';
import { строкиИнбокса, параметрМодуля, type InboxRow } from '@/db/inbox';
import { инбоксИнженера } from './builders/engineer';
import { дата, сутки } from '@/lib/format';
import { control, fmtDur, toWindow } from '@/domain/workhours';
import { Icon } from '@/components/Icons';
import { Hint } from '@/components/ui/Hint';
import {
  Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import './inbox.css';

export const dynamic = 'force-dynamic';

/* Сколько строк показываем внутри блока. Инбокс — не второй реестр: если
   задач больше, дальше человек идёт в реестр, а не листает здесь. */
const ЛИМИТ_СТРОК = 6;

const МС_СУТОК = 86_400_000;
const суткиНазад = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / МС_СУТОК);
const суткиДо = (d: Date, now: Date) => Math.round((d.getTime() - now.getTime()) / МС_СУТОК);

/* Ноль суток на экране читается как «ничего не ждём», хотя ждём — просто
   меньше суток. Разница между «0 суток» и «меньше суток» в блоке «вернули на
   уточнение» — это разница между «уже поздно» и «ещё нет». */
const давность = (n: number) => (n <= 0 ? 'меньше суток' : сутки(n));

/** Календарная длительность: «2 д 3 ч», «3 ч 12 мин». Не путать с fmtDur из
 *  domain/workhours — тот считает рабочие часы, а «через сколько уйдёт
 *  передача» и «когда откроется окно» ждут по календарю. */
function длит(мс: number): string {
  const м = Math.round(Math.abs(мс) / 60_000);
  const д = Math.floor(м / 1440);
  const ч = Math.floor((м % 1440) / 60);
  const мин = м % 60;
  if (д) return `${д} д ${ч} ч`;
  if (ч) return `${ч} ч ${мин} мин`;
  return `${мин} мин`;
}

/* ------------------------------ блоки ------------------------------ */

interface Блок {
  id: string;
  tone: 'hot' | 'warn' | 'calm';
  /** Ход за пользователем лично. Такие блоки должны входить в значок левой
      навигации; наблюдательные (calm) — нет. */
  act?: boolean;
  title: string;
  /** Зачем блок существует — процессный текст, выверен в макете. */
  why?: string;
  rows: InboxRow[];
  empty?: string;
  /** Куда ведёт строка; по умолчанию — сводка карточки. */
  href?: (r: InboxRow) => string;
  when: (r: InboxRow) => string;
  extra?: (r: InboxRow) => string;
  deep?: string;
  deepLabel?: string;
}

interface Плитка { n: number; l: string; href: string }

interface Инбокс { плитки: Плитка[]; блоки: Блок[] }

/* ------------------------------ инбокс эксперта АКЭ ------------------------------ */

function инбоксЭксперта(все: InboxRow[], горизонтОкна: number, now: Date): Инбокс {
  const t = (d: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);

  /* Внутри блока — «сначала горит»: самое давнее сверху (дольше молчим —
     выше), у окон — ближайшее закрытие. */
  const уточнения = все.filter((r) => r.status === 'clarify')
    .sort((a, b) => t(a.repliedAt) - t(b.repliedAt));
  const споры = все.filter((r) => r.disputeOpenedAt !== null)
    .sort((a, b) => t(a.disputeOpenedAt) - t(b.disputeOpenedAt));
  const черновики = все.filter((r) => r.status === 'draft')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  /* Момент передачи — как в колонке «Контроль ответа» реестра: sent_at, а если
     он не проставлен — открытие рабочего окна после регистрации. Другое
     выражение здесь показало бы человеку два разных времени на двух экранах. */
  const передача = (r: InboxRow) => r.sentAt
    ?? (r.registeredAt ? toWindow(new Date(r.registeredAt)) : null);
  const ждутПередачи = все.filter((r) => r.status === 'registered')
    .sort((a, b) => t(передача(a)) - t(передача(b)));
  const согласовано = все.filter((r) => r.status === 'approved')
    .sort((a, b) => t(a.repliedAt) - t(b.repliedAt));
  const окна = все.filter((r) => r.status === 'windowOpen' && r.windowCloseAt)
    .sort((a, b) => t(a.windowCloseAt) - t(b.windowCloseAt));
  const закрываются = окна.filter((r) => {
    const d = r.windowCloseAt!.getTime() - now.getTime();
    return d >= 0 && d <= горизонтОкна * МС_СУТОК;
  });

  const блоки: Блок[] = [
    {
      id: 'b-clarify', tone: 'hot', act: true, rows: уточнения,
      title: 'Вернули на уточнение',
      why: 'Заказчик прочитал рекомендацию и просит деталей. Пока мы не ответим, решение '
        + 'не двинется: уточнение вносится в ту же рекомендацию, номер не меняется.',
      when: (r) => `запрошено ${дата(r.repliedAt, true)}`,
      extra: (r) => `Заказчик: ${r.customerName ?? '—'}`
        + (r.repliedAt ? ` · у нас ${давность(суткиНазад(r.repliedAt, now))}` : ''),
    },
    {
      id: 'b-dispute', tone: 'hot', act: true, rows: споры,
      title: 'Оспорена дата реализации',
      why: 'Заказчик не согласен с датой, от которой считается окно. Окно при этом не '
        + 'останавливается, но расчёт эффекта до снятия возражения предварительный — '
        + 'ответ за нами: принять дату Заказчика или отклонить возражение с обоснованием.',
      href: (r) => `/rec/${r.id}/impl`,
      when: (r) => `возражение ${дата(r.disputeOpenedAt, true)}`,
      extra: (r) => `наша дата ${дата(r.factDate)} · предлагают ${дата(r.disputeProposedDate)}`,
      empty: 'Возражений по датам реализации нет.',
    },
    {
      id: 'b-draft', tone: 'warn', act: true, rows: черновики,
      title: 'Незаконченные черновики',
      why: 'У черновика нет ни номера, ни даты регистрации, и в реестре его видит только '
        + 'автор. Никто, кроме вас, эту работу не подхватит.',
      when: (r) => `создан ${дата(r.createdAt, true)}`,
      extra: (r) => `лежит ${давность(суткиНазад(r.createdAt, now))}`,
    },
    {
      id: 'b-pending', tone: 'calm', rows: ждутПередачи,
      title: 'Уйдут Заказчику с открытием рабочего окна',
      why: 'Передача идёт только в рабочее окно — пн–пт 09:00–24:00 по Когалыму, — и '
        + 'норматив ответа стартует с момента передачи, а не регистрации. Действия '
        + 'не требуется: это напоминание, чтобы успеть отозвать или поправить.',
      when: (r) => `передача ${дата(передача(r), true)}`,
      extra: (r) => {
        /* «Через сколько» пишется только про будущее: расчётный момент в
           прошлом (передача ещё не сработала) — не повод утверждать срок,
           которого нет. */
        const момент = передача(r);
        const мс = момент ? момент.getTime() - now.getTime() : 0;
        return (мс > 0 ? `через ${длит(мс)} · ` : '')
          + `норматив ${r.slaHours ?? '—'} ч пойдёт с момента передачи`;
      },
    },
    {
      id: 'b-approved', tone: 'calm', rows: согласовано,
      title: 'Согласовано — проверить телеметрию и зафиксировать реализацию',
      why: 'Факт и дату реализации определяет Исполнитель. Ведём скважину в ВМАП: смена '
        + 'частоты, давления на приёме, загрузки ПЭД или программы периодического режима '
        + 'означает, что мероприятие выполнено — тогда фиксируем дату, и этим же '
        + 'действием открывается окно эффекта на 90 суток.',
      href: (r) => `/rec/${r.id}/impl`,
      /* Реестр и так ограничен границей видимости эксперта, поэтому фильтра
         по исполнителю в ссылке нет — плитка «Согласовано» уже показывает
         ровно «за вами». */
      deep: '/?tile=approved',
      deepLabel: 'все согласованные за вами, в реестре',
      when: (r) => `согласовано ${дата(r.repliedAt)}`,
      extra: (r) => (r.repliedAt ? `ждём смены режима ${давность(суткиНазад(r.repliedAt, now))}` : ''),
    },
    {
      id: 'b-window', tone: 'calm', rows: закрываются,
      title: `Окна эффекта, закрывающиеся в ближайшие ${горизонтОкна} суток`,
      /* Текст собирается из данных, а не написан по факту сегодняшнего набора:
         на другом наборе «разбирать нечего» превратилось бы в ложь молча. */
      why: 'Окно идёт 90 суток от даты фактической реализации; после закрытия дата '
        + 'реализации не пересматривается, поэтому спорное разбирают до него. '
        + (окна.length
          ? `Ближайшее из ваших ${окна.length} открытых закрывается ${дата(окна[0].windowCloseAt)}.`
          : 'Открытых окон у вас сейчас нет.'),
      /* Отбора «закрывается в ближайшие N суток» у реестра нет, поэтому ссылка
         ведёт на плитку всех открытых окон, а подпись не обещает большего. */
      deep: '/?tile=window',
      deepLabel: 'все открытые окна, в реестре',
      when: (r) => (r.windowCloseAt ? `до закрытия ${давность(суткиДо(r.windowCloseAt, now))}` : ''),
      empty: 'Ни одно окно в этот срок не закрывается.',
    },
  ];

  const плитки: Плитка[] = [
    { n: уточнения.length, l: 'Вернули на уточнение', href: '#b-clarify' },
    { n: споры.length, l: 'Оспорена дата реализации', href: '#b-dispute' },
    { n: черновики.length, l: 'Черновики', href: '#b-draft' },
    /* В макете плитка звалась «Уйдут в 09:00», но момент передачи не всегда
       09:00 (регистрация в выходной уходит в понедельник), а термин «ждут
       передачи» уже стоит в реестре и сводке руководителя. */
    { n: ждутПередачи.length, l: 'Ждут передачи', href: '#b-pending' },
    { n: согласовано.length, l: 'Ждём реализации', href: '#b-approved' },
    { n: закрываются.length, l: 'Окно закрывается скоро', href: '#b-window' },
  ];

  return { плитки, блоки };
}

/* Роль → сборка её инбокса. Остальные роли (expertLead, engineer,
   customerLead) добавляются сюда своими билдерами — состав блоков каждой
   расписан в макет/inbox.js; до тех пор они видят заглушку, а не пустой
   экран. Администратора здесь не будет никогда (решение 82). */
/* Билдер может быть асинхронным: ролям Заказчика нужны строки, которых в
   строкиИнбокса() нет (sent/review), и дочитывают они их сами. */
const БИЛДЕРЫ: Record<string, (все: InboxRow[], горизонт: number, now: Date) => Инбокс | Promise<Инбокс>> = {
  expert: инбоксЭксперта,
  engineer: инбоксИнженера,
};

/* ------------------------------ строка задачи ------------------------------ */

/* Приоритет и контроль ответа показываются, только пока вопрос ответа
   Заказчика не закрыт (shows_sla в справочнике статусов). После решения это
   историческая справка, и в инбоксе она занимала бы место молча. */
function ТегиСла({ r }: { r: InboxRow }) {
  if (!r.showsSla) return null;

  const приоритет = r.priority && (
    <Hint text={`Приоритет ${r.priority}`}>
      <span className={`prio prio--${r.priority}`}>{r.priority}<i>{r.slaHours} ч</i></span>
    </Hint>
  );

  /* Бакет берётся из control_kind (SQL CTE), часы — из domain/control: тот же
     разделённый труд, что у колонки «Контроль ответа» в реестре. */
  let тег: ReactNode = null;
  if (r.controlKind === 'pending') {
    тег = (
      <Hint text="Заказчику уйдёт с началом рабочего дня">
        <span className="tag tag--pending">ожидает передачи</span>
      </Hint>
    );
  } else if (r.controlKind !== 'none' && r.controlKind !== 'hidden') {
    const c = control({ status: r.status, sentAt: r.sentAt, dueAt: r.dueAt, repliedAt: r.repliedAt });
    const подписи: Partial<Record<typeof c.kind, string>> = {
      ok: 'в срок', late: 'с опозданием', overdue: 'просрочено', waiting: 'осталось',
    };
    const подпись = подписи[c.kind];
    if (подпись) {
      тег = (
        <span className={`tag tag--${c.kind}`}>
          {подпись}{c.kind === 'ok' ? '' : ` ${fmtDur(c.hours)}`}
        </span>
      );
    }
  }

  return <>{приоритет}{тег}</>;
}

/* Строка задачи. Вся строка — ссылка: довести до карточки за один клик и есть
   смысл экрана. Где действие живёт не в «Сводке», ссылка сразу несёт вкладку. */
function Строка({ r, b }: { r: InboxRow; b: Блок }) {
  return (
    <Link className="task" href={b.href ? b.href(r) : `/rec/${r.id}/summary`}>
      <Hint text={r.statusName}>
        <i className={`status__d status__d--${r.tone} ${r.filled ? '' : 'is-hollow'} task__dot`} />
      </Hint>
      <div className="task__b">
        <div className="task__r1">
          {r.status === 'draft'
            ? <span className="mark">черновик</span>
            : <span className="task__num">{r.number}</span>}
          <ТегиСла r={r} />
          <span className="task__when">{b.when(r)}</span>
        </div>
        <div className="task__r2">{r.problem || '—'}</div>
        <div className="task__r3">
          {r.fieldName} · куст {r.kust ?? '—'} · скв. <b>{r.wellNumber}</b> · {r.direction}
        </div>
        {b.extra && <div className="task__r4">{b.extra(r)}</div>}
      </div>
      <svg className="ic16 task__go" aria-hidden="true"><use href="#i-next" /></svg>
    </Link>
  );
}

function БлокЗадач({ b }: { b: Блок }) {
  const показаны = b.rows.slice(0, ЛИМИТ_СТРОК);
  return (
    <section className={`blk blk--${b.tone}`} id={b.id}>
      <div className="blk__h">
        <h2 className="blk__t">{b.title}</h2>
        <span className={`badge${b.tone === 'calm' ? '' : ' badge--accent'}`}>{b.rows.length}</span>
        {b.deep && <Link className="blk__deep" href={b.deep}>{b.deepLabel ?? 'в реестре'} →</Link>}
      </div>
      {b.why && <div className="blk__why">{b.why}</div>}
      {показаны.length
        ? <div className="blk__list">{показаны.map((r) => <Строка key={r.id} r={r} b={b} />)}</div>
        : <div className="blk__empty">{b.empty ?? 'Пусто — задач нет.'}</div>}
      {b.rows.length > показаны.length && (
        <div className="blk__more">
          Показаны {показаны.length} из {b.rows.length}
          {b.deep && <> · <Link href={b.deep}>остальные в реестре</Link></>}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ каркас экрана ------------------------------ */

/* «Сейчас» вынесено на экран намеренно: без него непонятно, почему
   зарегистрированные «ждут открытия рабочего окна». Окно названо просто
   рабочим, без стороны, — по договору оно принадлежит Исполнителю (решение
   66), а применение его к передаче Заказчику идёт в протокол согласования. */
function Сейчас({ now }: { now: Date }) {
  const открытие = toWindow(now);
  const закрыто = открытие.getTime() > now.getTime();
  return (
    <span className="nowline">
      <Icon id="clock" size={16} />
      {дата(now, true)} · рабочее окно {закрыто
        ? `откроется через ${длит(открытие.getTime() - now.getTime())}`
        : 'открыто до 24:00'}
    </span>
  );
}

/* Роль без собранного инбокса и администратор. Не пустой экран и не 404:
   человек пришёл по пункту меню и должен понять, что здесь будет и куда
   идти сейчас. */
function Заглушка({ заголовок, текст, действие }: {
  заголовок: string;
  текст: string;
  действие: { href: string; label: string };
}) {
  return (
    <main className="content content--inbox">
      <div className="pagehead"><h1>Мои задачи</h1></div>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
          <EmptyTitle>{заголовок}</EmptyTitle>
          <EmptyDescription>{текст}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link className="btn" href={действие.href}>{действие.label}</Link>
        </EmptyContent>
      </Empty>
    </main>
  );
}

export default async function Page() {
  const user: SessionUser | null = await currentUser();
  if (!user) return null; /* Не вошёл — оболочка уводит на форму входа. */

  if (этоАдминистратор(user)) {
    return (
      <Заглушка
        заголовок="У администратора инбокса нет"
        текст="Задач по рекомендациям у администратора не бывает — его рабочее место: пользователи, роли и справочники."
        действие={{ href: '/users', label: 'К пользователям и ролям' }}
      />
    );
  }

  const билдер = БИЛДЕРЫ[user.role];
  if (!билдер) {
    return (
      <Заглушка
        заголовок="Инбокс для вашей роли ещё не собран"
        текст={`Разделы задач роли «${user.roleLabel}» появятся в одном из ближайших обновлений. Пока все рекомендации — в реестре.`}
        действие={{ href: '/', label: 'К реестру рекомендаций' }}
      />
    );
  }

  const [все, горизонт] = await Promise.all([
    строкиИнбокса(),
    параметрМодуля('closingSoonDays'),
  ]);
  const now = new Date();
  const { плитки, блоки } = await билдер(все, горизонт, now);

  return (
    <main className="content content--inbox">
      <div className="pagehead">
        <h1>Мои задачи</h1>
        <div className="pagehead__actions">
          <Сейчас now={now} />
        </div>
      </div>

      <section className="itiles">
        {плитки.map((t) => (
          <a key={t.href} className={`tile ${t.n ? '' : 'is-zero'}`} href={t.href}>
            <span className="tile__n">{t.n}</span>
            <span className="tile__l">{t.l}</span>
          </a>
        ))}
      </section>

      <div className="feed">
        {блоки.map((b) => <БлокЗадач key={b.id} b={b} />)}
      </div>
    </main>
  );
}
