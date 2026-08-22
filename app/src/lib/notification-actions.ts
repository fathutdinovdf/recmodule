'use server';

/* Действия колокольчика: отметить одно уведомление или все разом.
 *
 * revalidatePath, а не редирект и не собственный API-маршрут: колокольчик
 * стоит в шапке AppShell, которая оборачивает вообще все страницы, и
 * серверный компонент перечитывает счётчик из базы при следующей отрисовке —
 * тот же приём, что у switchUser в session-actions.ts.
 */

import { revalidatePath } from 'next/cache';
import { markAllRead, markRead } from '@/db/notifications';
import { currentUser } from '@/lib/session';

export async function отметитьУведомление(id: number): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await markRead(user.id, id);
  revalidatePath('/', 'layout');
}

export async function отметитьВсеУведомления(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await markAllRead(user.id);
  revalidatePath('/', 'layout');
}
