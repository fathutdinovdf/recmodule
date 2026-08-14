/* Оболочка приложения: шапка и левая навигация.
 *
 * Разметка перенесена из макета один в один — те же классы appbar, layout,
 * sidenav, navitem. CSS взят оттуда же файлом (registry.css) и не правился:
 * это уже выверенный визуальный язык ВМАП, и переписывать его «под React»
 * означало бы завести второй вид одного модуля.
 *
 * Единственное отличие от макета — ссылки ведут на маршруты Next, а не на
 * html-файлы, и активный пункт определяется текущим путём, а не проставленным
 * руками классом. */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconSprite, Icon } from './Icons';

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

export function AppShell({
  children,
  user = 'Фатхутдинов Д.Ф.',
}: {
  children: React.ReactNode;
  user?: string;
}) {
  const path = usePathname();

  /* Инициалы для аватара: из «Фатхутдинов Д.Ф.» получается «ФД» — первая буква
     фамилии и первая буква имени, как в макете. */
  const инициалы = (() => {
    const части = user.split(' ');
    const фамилия = части[0]?.[0] ?? '';
    const имя = части[1]?.[0] ?? '';
    return (фамилия + имя).toUpperCase();
  })();

  return (
    <>
      <IconSprite />

      <header className="appbar">
        <div className="appbar__group appbar__group--right">
          <button className="iconbtn iconbtn--lg" title="Уведомления">
            <Icon id="bell" size={20} />
            <span className="dot" />
          </button>
          <button className="iconbtn iconbtn--lg" title="Помощь">
            <Icon id="help" size={20} />
          </button>
          <div className="user"><span className="avatar">{инициалы}</span>{user}</div>
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
