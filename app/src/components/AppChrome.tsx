/* Шапка и левая навигация.
 *
 * Разметка перенесена из макета один в один — те же классы appbar, layout,
 * sidenav, navitem. CSS взят оттуда же файлом (registry.css) и не правился:
 * это уже выверенный визуальный язык ВМАП, и переписывать его «под React»
 * означало бы завести второй вид одного модуля.
 *
 * Отличий от макета два: ссылки ведут на маршруты Next, а активный пункт
 * определяется текущим путём; и на месте имени пользователя стоит
 * переключатель — см. комментарий к нему ниже.
 *
 * Клиентский компонент нужен ровно ради этих двух мест. Данные о пользователе
 * приходят пропсами из серверной обёртки AppShell: читать базу отсюда нельзя. */

'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, X } from 'lucide-react';
import { IconSprite, Icon } from './Icons';
import { switchUser } from '@/lib/session-actions';
import { выйти } from '@/lib/auth-actions';
import { этоИсполнитель, этоАдминистратор } from '@/lib/access';
import { сообщитьОПроблеме, type ОтветЗаявки } from '@/lib/problem-report-actions';
import { NotificationBell, type УведомлениеПропс } from './NotificationBell';
import type { SessionUser } from '@/lib/session';
import { Hint } from '@/components/ui/Hint';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Textarea } from '@/components/ui/Textarea';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { DialogFooter, DialogClose } from '@/components/ui/dialog';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent,
  AttachmentDescription, AttachmentMedia, AttachmentTitle,
} from '@/components/ui/attachment';
import { Dropzone, DropzoneEmptyState } from '@/components/kibo-ui/dropzone';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { Upload } from '@/components/animate-ui/icons/upload';
import { ИконкаФайла, типФайла } from '@/app/rec/[id]/log/file-icon';
import { размер } from '@/app/rec/[id]/log/format';
import { ПереключательТемы } from './ThemeToggle';

interface NavItem {
  href?: string;
  label: string;
  badge?: { text: string; accent?: boolean };
  /* Пункты, которых ещё нет: показываются приглушённо и не кликаются —
     так же, как в макете. Прятать их нельзя: по ним видно объём модуля. */
  muted?: boolean;
  /* Пункт администратора модуля. Этот прячется по-настоящему: остальным он не
     «пока недоступен», а не нужен вовсе — чужие полномочия не их работа. */
  admin?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const НАВИГАЦИЯ: NavSection[] = [
  {
    title: 'Работа',
    items: [
      { href: '/inbox', label: 'Мои задачи', badge: { text: '7', accent: true }, muted: true },
      { href: '/', label: 'Реестр рекомендаций' },
      { href: '/claims', label: 'Заявки Заказчика', badge: { text: '2' }, muted: true },
    ],
  },
  {
    title: 'Эффект',
    items: [
      { label: 'Окна эффекта', muted: true },
      { label: 'Подтверждённые', muted: true },
    ],
  },
  {
    title: 'Настройка',
    items: [
      { href: '/economy', label: 'Экономическая модель' },
      { label: 'Справочники', muted: true },
      { href: '/users', label: 'Пользователи и роли', admin: true },
      { href: '/problems', label: 'Заявки о проблемах', admin: true },
      { label: 'Календарь и SLA', muted: true },
      { label: 'Отчёты и выгрузки', muted: true },
    ],
  },
];

export function AppChrome({
  children, user, users, уведомления,
}: {
  children: React.ReactNode;
  /* Не `null`: до входа оболочка не рисуется вовсе — см. AppShell. */
  user: SessionUser;
  users: SessionUser[];
  уведомления: УведомлениеПропс[];
}) {
  const path = usePathname();

  return (
    <>
      <IconSprite />

      <header className="appbar">
        <div className="appbar__group appbar__group--right">
          <ПереключательТемы />
          <NotificationBell уведомления={уведомления} />
          <Hint text="Помощь">
            <button className="iconbtn iconbtn--lg" type="button" aria-label="Помощь">
              <Icon id="help" size={20} />
            </button>
          </Hint>
          <ПереключательПользователя user={user} users={users} />
          <Hint text="Выйти">
            <form action={выйти}>
              <button className="iconbtn iconbtn--lg" type="submit" aria-label="Выйти">
                <LogOut size={20} />
              </button>
            </form>
          </Hint>
        </div>
      </header>

      <div className="layout">
        <nav className="sidenav">
          {НАВИГАЦИЯ.map((секция) => (
            <div key={секция.title}>
              <div className="sidenav__section">{секция.title}</div>
              {секция.items.filter((п) => !п.admin || user.role === 'admin').map((пункт) => {
                const активен = пункт.href === path;
                const классы = ['navitem', активен ? 'is-active' : '',
                  пункт.muted ? 'navitem--muted' : ''].filter(Boolean).join(' ');
                const внутри = (
                  <>
                    <span className="navitem__label">{пункт.label}</span>
                    {пункт.badge && (
                      <span className={`badge ${пункт.badge.accent ? 'badge--accent' : ''}`}>
                        {пункт.badge.text}
                      </span>
                    )}
                  </>
                );
                /* Приглушённый пункт без ссылки — это ещё не сделанный экран.
                   Он остаётся в навигации, но не ведёт никуда: щелчок по
                   заглушке хуже, чем видимое «пока нет». */
                return пункт.href && !пункт.muted
                  ? <Link key={пункт.label} className={классы} href={пункт.href}>{внутри}</Link>
                  : <a key={пункт.label} className={классы}>{внутри}</a>;
              })}
            </div>
          ))}

          {/* Низ меню — жалоба на модуль, а не пункт работы: отсюда отрыв
              вниз и линия сверху, а не место в списке экранов. Видна
              Исполнителю и администратору: у Заказчика для этого есть канал
              через самого Исполнителя, а не форма внутри чужого инструмента
              (решение по видимости — сентябрь 2026, без номера в документе). */}
          {(этоИсполнитель(user) || этоАдминистратор(user)) && <КнопкаПроблемы />}
        </nav>

        {children}
      </div>
    </>
  );
}

const пустойОтвет: ОтветЗаявки = null;

/* Кнопка «Сообщить о проблеме» — по названию и жучку в подвале навигации, но
   внутри окно шире: один канал на проблему, идею и рекомендацию сразу, а не
   три разные формы под каждый жанр (заголовок окна и текст поля — «Обратная
   связь» / «Что сообщаете»). Один вопрос — что сообщаете, — и необязательный
   скриншот: составлять из этого мастер незачем, а без вложения полдиалога с
   администратором потом уходит на «а на какой странице, пришлите картинку».
   Хранится всё по-прежнему в rec.problem_reports и на /problems —
   переименовывать таблицу под более широкий смысл кнопки не стали. */
function КнопкаПроблемы() {
  const path = usePathname();
  const [открыто, setОткрыто] = useState(false);
  const [файлы, setФайлы] = useState<File[]>([]);
  const [ошибкаФайла, setОшибкаФайла] = useState<string>();
  const выбор = useRef<HTMLInputElement>(null);
  const [ответ, отправить] = useActionState(сообщитьОПроблеме, пустойОтвет);
  const ошибка = ошибкаФайла ?? (ответ && !ответ.ok ? ответ.error : undefined);

  useEffect(() => {
    if (ответ?.ok) { setОткрыто(false); setФайлы([]); setОшибкаФайла(undefined); }
  }, [ответ]);

  /* Один input на все файлы, через DataTransfer, — как в мастере регистрации
     (wizard.tsx): обычная форма отправляет `files` списком без лишней разметки,
     а повторный выбор того же файла снова даёт событие change. */
  function syncФайлы(следующие: File[]) {
    const input = выбор.current;
    if (!input) return;
    const dt = new DataTransfer();
    следующие.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    setФайлы(следующие);
  }

  return (
    <ActionDialog
      title="Обратная связь"
      className="max-w-[560px]"
      open={открыто}
      onOpenChange={setОткрыто}
      trigger={(
        <button type="button" className="navitem navitem--foot">
          <Icon id="bug" />
          <span className="navitem__label">Сообщить о проблеме</span>
        </button>
      )}
    >
      <form action={отправить}>
        <input type="hidden" name="page" value={path} />
        <input ref={выбор} type="file" name="files" accept="image/*" multiple hidden
               onChange={(e) => syncФайлы([...файлы, ...Array.from(e.target.files ?? [])].slice(0, 3))} />

        <Field>
          <FieldLabel htmlFor="problem-text">Что сообщаете</FieldLabel>
          <Textarea id="problem-text" name="text" rows={4} aria-invalid={Boolean(ошибка)}
                    placeholder="Проблема, идея, что стоит поправить в модуле — пишите как есть. Если это баг: экран и шаги — самое ценное." />
        </Field>

        {файлы.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {файлы.map((f, i) => (
              <Attachment key={`${f.name}-${i}`} size="sm" className="max-w-full flex-nowrap">
                <AttachmentMedia><ИконкаФайла имя={f.name} /></AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{f.name}</AttachmentTitle>
                  <AttachmentDescription>{типФайла(f.name)} · {размер(f.size)}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction aria-label="Убрать файл"
                                     className="border-transparent bg-transparent text-muted-foreground hover:text-foreground"
                                     onClick={() => syncФайлы(файлы.filter((_, j) => j !== i))}>
                    <X />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
          </div>
        )}

        <Dropzone
          className="mt-2 w-full items-center justify-center py-6 text-center"
          accept={{ 'image/*': [] }}
          maxFiles={Math.max(1, 3 - файлы.length)}
          disabled={файлы.length >= 3}
          onDrop={(принятые) => {
            setОшибкаФайла(undefined);
            syncФайлы([...файлы, ...принятые].slice(0, 3));
          }}
          onError={() => setОшибкаФайла('Файл не подошёл: только картинки, до 10 МБ, не больше 3 штук.')}
        >
          <DropzoneEmptyState>
            <div className="flex flex-col items-center justify-center gap-1 text-center">
              <AnimateIcon animateOnHover asChild>
                <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Upload className="size-4" />
                </div>
              </AnimateIcon>
              <p className="m-0 text-sm font-medium">Прикрепить скриншот</p>
              <p className="m-0 text-xs text-muted-foreground">
                Перетащите сюда или нажмите — до 3 файлов, каждый до 10 МБ
              </p>
            </div>
          </DropzoneEmptyState>
        </Dropzone>

        {ошибка && <FieldError className="mt-2">{ошибка}</FieldError>}

        <DialogFooter className="mt-4">
          <SubmitButton pendingText="Отправляю…">Отправить</SubmitButton>
          <DialogClose asChild><Button type="button" variant="outline">Отмена</Button></DialogClose>
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

/* Роль показывается названием из справочника, а право решения приписывается
   к нему: наблюдателя Заказчика от инженера отличает именно оно, а роль у них
   бывает одна и та же (решение 89). */
const РОЛЬ = (u: SessionUser) => (u.side === 'customer' && !u.canDecide
  ? `${u.roleLabel}, без права решения` : u.roleLabel);

/* На месте имени в макете — выбор пользователя. Это подмена входа, и живёт она
   только в разработке: в рабочем контуре список пуст, и на его месте остаётся
   имя вошедшего. Без переключателя невозможно проверить ветки, зависящие от
   роли: кнопки решения видит только Заказчик с правом решения, факт реализации
   фиксирует только Исполнитель, — а выходить и входить ради каждой шесть раз
   невыносимо. */
function ПереключательПользователя({
  user, users,
}: {
  user: SessionUser; users: SessionUser[];
}) {
  const [идёт, начать] = useTransition();
  const router = useRouter();

  /* Инициалы для аватара: из «Гадаятов Ф.Г.» получается «ГФ» — первая буква
     фамилии и первая буква имени, как в макете. */
  const части = user.fullName.split(' ');
  const инициалы = ((части[0]?.[0] ?? '') + (части[1]?.[0] ?? '')).toUpperCase();

  if (users.length === 0) {
    return (
      <div className="user" title={`${user.position ?? ''} · ${РОЛЬ(user)}`}>
        <span className="avatar">{инициалы}</span>{user.fullName}
      </div>
    );
  }

  return (
    <div className="user" title={`${user.position ?? ''} · ${РОЛЬ(user)}`}>
      <span className="avatar">{инициалы}</span>
      <Select
        triggerClassName="userpick"
        value={user.login}
        disabled={идёт}
        options={users.map((u) => ({ value: u.login, label: `${u.fullName} · ${РОЛЬ(u)}` }))}
        /* router.refresh() обязателен: revalidatePath в server action чистит
           кэш, но текущий отрисованный экран сам по себе не пересобирается —
           без него список возвращается к прежнему пользователю, и смена роли
           выглядит как не сработавшая. */
        onValueChange={(login) => {
          начать(async () => { await switchUser(login); router.refresh(); });
        }}
      />
    </div>
  );
}
