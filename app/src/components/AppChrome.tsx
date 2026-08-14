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
import { usePathname } from 'next/navigation';
import { IconSprite, Icon } from './Icons';
import { switchUser } from '@/lib/session-actions';
import type { SessionUser } from '@/lib/session';
import { Hint } from '@/components/ui/Hint';

interface NavItem {
  href?: string;
  label: string;
  badge?: { text: string; accent?: boolean };
  /* Пункты, которых ещё нет: показываются приглушённо и не кликаются —
     так же, как в макете. Прятать их нельзя: по ним видно объём модуля. */
  muted?: boolean;
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
      { label: 'Пользователи и роли', muted: true },
      { label: 'Календарь и SLA', muted: true },
      { label: 'Отчёты и выгрузки', muted: true },
    ],
  },
];

export function AppChrome({
  children, user, users,
}: {
  children: React.ReactNode;
  user: SessionUser | null;
  users: SessionUser[];
}) {
  const path = usePathname();

  return (
    <>
      <IconSprite />

      <header className="appbar">
        <div className="appbar__group appbar__group--right">
          <Hint text="Уведомления">
            <button className="iconbtn iconbtn--lg" type="button" aria-label="Уведомления">
              <Icon id="bell" size={20} />
              <span className="dot" />
            </button>
          </Hint>
          <Hint text="Помощь">
            <button className="iconbtn iconbtn--lg" type="button" aria-label="Помощь">
              <Icon id="help" size={20} />
            </button>
          </Hint>
          <ПереключательПользователя user={user} users={users} />
        </div>
      </header>

      <div className="layout">
        <nav className="sidenav">
          {НАВИГАЦИЯ.map((секция) => (
            <div key={секция.title}>
              <div className="sidenav__section">{секция.title}</div>
              {секция.items.map((пункт) => {
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
        </nav>

        {children}
      </div>
    </>
  );
}

const РОЛЬ = (u: SessionUser) => (u.side === 'executor' ? 'Исполнитель'
  : u.canDecide ? 'Заказчик, решает' : 'Заказчик, без права решения');

/* На месте имени в макете — выбор пользователя. Это заглушка входа: в рабочем
   контуре пользователь приходит из ВМАП и не выбирается. Здесь без неё нельзя
   ни показать, ни проверить ветки, которые от роли зависят: кнопки решения
   видит только Заказчик с правом решения, факт реализации фиксирует только
   Исполнитель. */
function ПереключательПользователя({
  user, users,
}: {
  user: SessionUser | null; users: SessionUser[];
}) {
  const [идёт, начать] = useTransition();

  if (!user) return <div className="user"><span className="avatar">—</span>Пользователь не определён</div>;

  /* Инициалы для аватара: из «Гадаятов Ф.Г.» получается «ГФ» — первая буква
     фамилии и первая буква имени, как в макете. */
  const части = user.fullName.split(' ');
  const инициалы = ((части[0]?.[0] ?? '') + (части[1]?.[0] ?? '')).toUpperCase();

  return (
    <div className="user" title={`${user.position ?? ''} · ${РОЛЬ(user)}`}>
      <span className="avatar">{инициалы}</span>
      <select
        className="userpick"
        value={user.login}
        disabled={идёт}
        onChange={(e) => { const login = e.target.value; начать(() => { switchUser(login); }); }}
      >
        {users.map((u) => (
          <option key={u.login} value={u.login}>{u.fullName} · {РОЛЬ(u)}</option>
        ))}
      </select>
    </div>
  );
}
