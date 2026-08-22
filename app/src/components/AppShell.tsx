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

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [user, users, шапки] = await Promise.all([currentUser(), allUsers(), headers()]);

  if (!user) {
    /* Форма входа рисуется без оболочки: шапке до входа нечего показывать, а
       левой навигации некуда вести. */
    if (шапки.get('x-pathname') === '/login') return <>{children}</>;
    redirect('/login');
  }

  return <AppChrome user={user} users={users}>{children}</AppChrome>;
}
