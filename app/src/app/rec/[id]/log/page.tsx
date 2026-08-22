/* Вкладка «История и обсуждение».
 *
 * Всё, что произошло с рекомендацией, и всё, что стороны об этом писали, —
 * одной хронологией (почему одной, а не двумя, — в `db/log.ts`).
 *
 * Страница читает ленту на сервере и отдаёт готовые строки клиентскому чату:
 * первый показ не зависит ни от канала, ни от JavaScript, а дальше лента живёт
 * сама — новые реплики приходят по SSE.
 */

import { notFound } from 'next/navigation';
import { getCard } from '@/db/card';
import { getLog } from '@/db/log';
import { markRecRead } from '@/db/notifications';
import { allUsers, currentUser } from '@/lib/session';
import { вЛенту } from './format';
import { Чат } from './chat';

export const dynamic = 'force-dynamic';

/* Почему нельзя писать. Молча убранное поле ввода читается как поломка. */
const ПОЧЕМУ_НЕЛЬЗЯ: Record<string, string> = {
  draft: 'Черновик не обсуждается: он ещё не зарегистрирован, и второй стороны у него нет.',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [card, user] = await Promise.all([getCard(Number(id)), currentUser()]);
  if (!card) notFound();
  const [записи, люди] = await Promise.all([
    getLog(card.id, user?.id ?? null),
    allUsers(),
    /* Открыли вкладку — значит увидели ленту целиком: гасим непрочитанное по
       этой рекомендации здесь же, а не отдельным запросом с клиента. */
    user ? markRecRead(user.id, card.id) : Promise.resolve(),
  ]);

  const сейчас = new Date();

  return (
    <Чат
      recId={card.id}
      начальные={записи.map((e) => вЛенту(e, сейчас))}
      люди={люди.map((u) => ({ id: u.id, fullName: u.fullName, position: u.position, side: u.side }))}
      я={user && { id: user.id, fullName: user.fullName, side: user.side }}
      обсуждаемо={card.status !== 'draft' && user !== null}
      причина={ПОЧЕМУ_НЕЛЬЗЯ[card.status]}
    />
  );
}
