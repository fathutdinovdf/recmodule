/* Оболочка приложения.
 *
 * Разделена надвое: здесь серверная половина, которая знает, кто вошёл, а
 * разметка шапки и навигации — в AppChrome, помеченном 'use client' (активный
 * пункт определяется путём, переключатель пользователя — состоянием). Читать
 * базу из клиентского компонента нельзя, поэтому пользователь приходит туда
 * пропсами.
 *
 * Здесь же — единственная настоящая проверка входа для страниц. Она стоит
 * именно в корневом layout, а не в middleware: только отсюда видно базу, то
 * есть погашена сессия или ещё жива. Middleware лишь срезает путь тем, у кого
 * куки нет вовсе.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppChrome } from './AppChrome';
import { currentUser, allUsers } from '@/lib/session';
import { listNotifications } from '@/db/notifications';
import { счётчикИнбокса } from '@/db/inbox';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [user, users, шапки] = await Promise.all([currentUser(), allUsers(), headers()]);

  if (!user) {
    /* Форма входа рисуется без оболочки: шапке до входа нечего показывать, а
       левой навигации некуда вести. */
    if (шапки.get('x-pathname') === '/login') return <>{children}</>;
    redirect('/login');
  }

  /* Колокольчик читает уведомления здесь же, а не отдельным маршрутом: шапка
     оборачивает все страницы, и revalidatePath('/', 'layout') из
     notification-actions.ts уже перерисовывает именно этот компонент. */
  const [уведомленияСырые, значокИнбокса] = await Promise.all([
    listNotifications(user.id, 30),
    счётчикИнбокса(user.role),
  ]);
  const уведомления = уведомленияСырые.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  }));

  return (
    <AppChrome user={user} users={users} уведомления={уведомления} значокИнбокса={значокИнбокса}>
      {children}
    </AppChrome>
  );
}
