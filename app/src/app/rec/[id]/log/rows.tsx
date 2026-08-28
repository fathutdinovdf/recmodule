/* Строки ленты: событие процесса и реплика человека.
 *
 * Два ритма вместо двух списков. Событие — плотная строка с иконкой, реплика —
 * блок с аватаром и фоном. Разная плотность сама делит «что произошло» и «что
 * об этом сказали», не требуя ни вкладок, ни фильтров.
 */

import {
  BadgeCheck, Ban, CircleHelp, Eye, FileCheck, FilePlus2, Link2,
  Lock, Ruler, RotateCw, Scale, Send, Timer, X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/Button';
import {
  Attachment, AttachmentContent, AttachmentDescription,
  AttachmentMedia, AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';
import { Spinner } from '@/components/ui/spinner';
import { ИконкаФайла, типФайла } from './file-icon';
import { размер, type FeedItem } from './format';

/* Иконка отвечает «что это было» до того, как прочитан текст. Ключ — целевой
   статус, а не вид события: событий смены статуса большинство, и одна иконка
   на все превратила бы ленту в столбик одинаковых кружков. */
const ПО_СТАТУСУ: Record<string, typeof Send> = {
  registered: FilePlus2,
  sent: Send,
  review: Eye,
  clarify: CircleHelp,
  approved: FileCheck,
  windowOpen: Timer,
  windowClosed: Lock,
  rejected: X,
  cancelled: Ban,
  draft: FilePlus2,
};

/* decision, fact, opened и talk сюда не входят: у первых трёх to_status
   проставлен всегда (accept/reject/clarify → approved/rejected/clarify,
   fact → windowOpen, opened → review — см. actions.ts и lifecycle.ts), и
   иконка() выше выбирает их раньше, чем доходит до этой таблицы. talk
   вообще не попадает в Событие — реплики рисует компонент Реплика. */
const ПО_ВИДУ: Record<string, typeof Send> = {
  dispute: Scale,
  link: Link2,
  baseline: Ruler,
};

const иконка = (e: FeedItem) =>
  (e.toStatus ? ПО_СТАТУСУ[e.toStatus] : undefined) ?? ПО_ВИДУ[e.kind] ?? BadgeCheck;

/* Тон и заливка кружка — те же, что у кружка статуса в шапке карточки
   (rec.statuses.tone/filled, миграция 004_status_tone.sql): цвет говорит,
   чья сторона держит процесс, заливка — доведён ли шаг до конца. Своей
   цветовой семантики лента не придумывает. У события без toStatus (спор,
   связь, база) целевого статуса нет — кружок остаётся нейтральным. */
const ТОН_СТАТУСА: Record<string, { tone: 'neutral' | 'wait' | 'work' | 'done' | 'reject'; filled: boolean }> = {
  draft: { tone: 'neutral', filled: false },
  registered: { tone: 'neutral', filled: true },
  sent: { tone: 'wait', filled: false },
  review: { tone: 'wait', filled: true },
  clarify: { tone: 'neutral', filled: false },
  approved: { tone: 'work', filled: false },
  windowOpen: { tone: 'done', filled: false },
  windowClosed: { tone: 'done', filled: true },
  rejected: { tone: 'reject', filled: true },
  cancelled: { tone: 'neutral', filled: false },
};

const ЦВЕТ_ТОНА: Record<string, [text: string, bg: string]> = {
  neutral: ['var(--status-default-text)', 'var(--status-default-light-bg)'],
  wait: ['var(--status-processing-text)', 'var(--status-processing-light-bg)'],
  work: ['var(--status-warning-text)', 'var(--status-warning-light-bg)'],
  done: ['var(--status-success-text)', 'var(--status-success-light-bg)'],
  reject: ['var(--status-error-text)', 'var(--status-error-light-bg)'],
};

function стильКружка(e: FeedItem): React.CSSProperties {
  const т = e.toStatus ? ТОН_СТАТУСА[e.toStatus] : undefined;
  const [цвет, фон] = ЦВЕТ_ТОНА[т?.tone ?? 'neutral'];
  return т?.filled
    ? { background: фон, color: цвет, border: '1px solid transparent' }
    : { background: 'var(--bg-card)', color: цвет, border: `1.5px solid ${цвет}` };
}

/* Нитка времени — псевдоэлемент, а не отдельный узел: у последней строки её
   быть не должно, и на CSS это одно правило вместо ветвления в разметке. */
const СТРОКА = 'relative grid grid-cols-[24px_1fr_auto] items-start gap-3 pb-4 last:pb-0'
  + ' before:absolute before:left-[11px] before:top-7 before:bottom-1 before:w-px'
  + ' before:bg-border last:before:hidden';

/* Появление — общая кривая и общая длительность для всех новых строк ленты,
   чтобы своя реплика и пришедшая по каналу двигались одинаково. */
const ВЪЕЗД = 'animate-in fade-in-0 slide-in-from-bottom-2';
const ДВИЖЕНИЕ = { animationDuration: 'var(--motion-base)', animationTimingFunction: 'var(--ease-out)' };

export function Событие({ e, свежая }: { e: FeedItem; свежая?: boolean }) {
  const Icon = иконка(e);
  return (
    <li className={`${СТРОКА} ${свежая ? ВЪЕЗД : ''}`} style={свежая ? ДВИЖЕНИЕ : undefined}>
      <span className="relative z-10 flex size-6 items-center justify-center rounded-full" style={стильКружка(e)}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-sm text-foreground">{e.text}</div>
        <div className="text-xs text-muted-foreground">
          {e.actorName}
          {e.sideLabel && <> · {e.sideLabel}</>}
        </div>
      </div>
      <time className="pt-0.5 text-xs tabular-nums text-muted-foreground">{e.time}</time>
    </li>
  );
}

export function Реплика({ e, свежая, повторить }: {
  e: FeedItem;
  свежая?: boolean;
  /** Есть только у неотправленной реплики: без повтора текст пришлось бы набирать заново. */
  повторить?: () => void;
}) {
  return (
    <li className={`${СТРОКА} ${свежая ? ВЪЕЗД : ''}`} style={свежая ? ДВИЖЕНИЕ : undefined}>
      <Avatar className="relative z-10 size-6">
        <AvatarFallback className="bg-secondary text-[10px] font-medium">{e.initials}</AvatarFallback>
      </Avatar>

      <div
        /* Ширина ограничена мерой строки: растянутый на всю карточку блок под
           фразу в семь слов читается как пустая плашка. */
        className={`min-w-0 max-w-[68ch] rounded-md px-3 py-2 transition-opacity ${
          e.failed ? 'bg-muted ring-1 ring-[var(--status-error)]' : 'bg-muted'}`}
        style={{
          /* Приглушение — это статус доставки: пока сервер не ответил, реплика
             видна, но отличима от подтверждённых. */
          opacity: e.pending ? 0.6 : 1,
          transitionDuration: 'var(--motion-fast)',
        }}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{e.actorName}</span>
          <span className="text-xs text-muted-foreground">{e.sideLabel}</span>
        </div>

        {e.text && <p className="mt-0.5 text-sm whitespace-pre-wrap text-foreground">
          <Текст текст={e.text} упомянуты={e.mentions} />
        </p>}

        {e.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-col items-start gap-1.5">
            {e.attachments.map((f) => (
              <Вложение key={f.id} f={f} запись={e} />
            ))}
          </div>
        )}

        {e.failed && (
          <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: 'var(--status-error-text)' }}>
            {e.failed}
            {/* Рамка снята: кнопка стоит внутри строки ошибки, и обычная
                клавиша перевесила бы саму реплику. */}
            {повторить && (
              <Button type="button" variant="ghost" size="sm" onClick={повторить}
                      className="h-6 gap-1 border-transparent px-1.5 text-xs">
                <RotateCw className="size-3" /> Повторить
              </Button>
            )}
          </div>
        )}
      </div>

      <time className="pt-2 text-xs tabular-nums text-muted-foreground">
        {/* У неподтверждённой реплики времени ещё нет: сервер поставит своё,
            и показанное сейчас разошлось бы с ним на секунды. */}
        {e.pending ? '…' : e.time}
      </time>
    </li>
  );
}

/* Одно вложение. Состояние берётся из состояния самой реплики: файл заливается
   вместе с ней, отдельной жизни у него нет.
 *
 * Полоса прогресса поверх карточки — своя: в реестре состояние `uploading`
 * показано бликом по имени файла, а «идёт» и «сколько осталось» — разные
 * ответы, и на выгрузке в десять мегабайт нужен второй. */
function Вложение({ f, запись }: { f: FeedItem['attachments'][number]; запись: FeedItem }) {
  const заливается = запись.pending === true;
  const сбой = запись.failed !== undefined;
  const доля = запись.progress ?? 0;

  const карточка = (
    <Attachment size="sm" state={сбой ? 'error' : заливается ? 'uploading' : 'done'}
                className="relative max-w-full flex-nowrap overflow-hidden border-[var(--border-divider-light)]">
      <AttachmentMedia>
        {заливается ? <Spinner data-slot="spinner" /> : <ИконкаФайла имя={f.fileName} />}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{f.fileName}</AttachmentTitle>
        <AttachmentDescription>
          {сбой ? 'Не отправлен'
            : заливается ? `Загрузка · ${Math.round(доля * 100)} %`
              : `${типФайла(f.fileName)} · ${размер(f.sizeBytes)}`}
        </AttachmentDescription>
      </AttachmentContent>

      {заливается && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-border">
          <div className="h-full bg-[var(--component-accent)]"
               style={{ width: `${Math.round(доля * 100)}%`, transition: 'width var(--motion-fast) linear' }} />
        </div>
      )}
    </Attachment>
  );

  /* Пока файла нет в базе, ссылки на него быть не может: у неотправленного
     вложения номер отрицательный и вёл бы в никуда. */
  if (заливается || сбой) return карточка;

  return (
    <div className="relative w-fit max-w-full">
      {карточка}
      <AttachmentTrigger asChild>
        <a href={`/api/attachment/${f.id}`} aria-label={`Скачать ${f.fileName}`} />
      </AttachmentTrigger>
    </div>
  );
}

/* Упоминание выделяется в тексте, но остаётся текстом: ссылки на карточку
   пользователя в модуле нет, а синее подчёркивание обещало бы переход. */
function Текст({ текст, упомянуты }: { текст: string; упомянуты: string[] }) {
  if (!упомянуты.length) return <>{текст}</>;

  /* Длинные имена вперёд: «Сафин Р.М.» не должен срабатывать внутри
     «Сафин Р.М.оглы», если такой однажды появится. */
  const имена = [...упомянуты].sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const части = текст.split(new RegExp(`(@(?:${имена.join('|')}))`, 'g'));

  return <>{части.map((ч, i) => ч.startsWith('@') && упомянуты.includes(ч.slice(1))
    ? <mark key={i} className="rounded-sm bg-transparent font-medium text-[var(--component-accent)]">{ч}</mark>
    : <span key={i}>{ч}</span>)}</>;
}
