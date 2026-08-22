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

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { IconSprite, Icon } from './Icons';
import { switchUser } from '@/lib/session-actions';
import { выйти } from '@/lib/auth-actions';
import type { SessionUser } from '@/lib/session';
import { Hint } from '@/components/ui/Hint';
import { Select } from '@/components/ui/Select';
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
      { label: 'Календарь и SLA', muted: true },
      { label: 'Отчёты и выгрузки', muted: true },
    ],
  },
];

export function AppChrome({
  children, user, users,
}: {
  children: React.ReactNode;
  /* Не `null`: до входа оболочка не рисуется вовсе — см. AppShell. */
  user: SessionUser;
  users: SessionUser[];
}) {
  const path = usePathname();

  return (
    <>
      <IconSprite />

      <header className="appbar">
        <div className="appbar__group appbar__group--right">
          <ПереключательТемы />
          <Hint text="Уведомления">
            <button className="iconbtn iconbtn--lg" type="button" aria-label="Уведомления">
              <span className="icstack ic20">
                <svg className="ic20 bell__dome" aria-hidden="true"><use href="#i-bell-dome" /></svg>
                <svg className="ic20 bell__clap" aria-hidden="true"><use href="#i-bell-clap" /></svg>
              </span>
              <span className="dot" />
            </button>
          </Hint>
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
              вниз и линия сверху, а не место в списке экранов. Адресат пока
              не назначен, поэтому это кнопка без действия, а не ссылка в
              никуда. */}
          <button type="button" className="navitem navitem--foot">
            <Icon id="bug" />
            <span className="navitem__label">Сообщить о проблеме</span>
          </button>
        </nav>

        {children}
      </div>
    </>
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
