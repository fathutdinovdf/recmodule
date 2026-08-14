/* Оболочка приложения.
 *
 * Разделена надвое: здесь серверная половина, которая знает, кто вошёл, а
 * разметка шапки и навигации — в AppChrome, помеченном 'use client' (активный
 * пункт определяется путём, переключатель пользователя — состоянием). Читать
 * базу из клиентского компонента нельзя, поэтому пользователь приходит туда
 * пропсами.
 */

import { AppChrome } from './AppChrome';
import { currentUser, allUsers } from '@/lib/session';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [user, users] = await Promise.all([currentUser(), allUsers()]);
  return <AppChrome user={user} users={users}>{children}</AppChrome>;
}
