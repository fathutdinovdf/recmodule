/* Кто сейчас за экраном.
 *
 * Настоящей аутентификации у модуля не будет и в ВМАП: пользователя туда
 * приносит контур Заказчика. Здесь она подменена куком с логином — ровно
 * настолько, насколько нужно, чтобы решение по рекомендации имело автора.
 *
 * Почему это вообще понадобилось. Решение Заказчика — документ по договору:
 * `rec.decisions.actor_id` не допускает NULL, а состав блока решения зависит
 * от права решать (решение 89: наблюдатель Заказчика видит карточку целиком,
 * но без кнопок). До сих пор приложение только читало, и вопрос «кто?» не
 * возникал.
 *
 * Единственный модуль вне `app/`, зависящий от Next. Домена это не касается:
 * в `domain/` по-прежнему нет ни одного импорта из фреймворка.
 */

import { cache } from 'react';
import { cookies } from 'next/headers';
import { query } from '@/db/pool';

export interface SessionUser {
  id: number;
  login: string;
  fullName: string;
  position: string | null;
  side: 'executor' | 'customer';
  canDecide: boolean;
  canEditEconomy: boolean;
}

export const КУКА_ПОЛЬЗОВАТЕЛЯ = 'demo-user';

/* По умолчанию входим Заказчиком с правом решения: карточка чаще всего
   открывается ради ответа на рекомендацию, и пустой блок решения на первом
   же экране выглядел бы поломкой.
 *
 * Переменная DEMO_USER перебивает умолчание — этим снимается вторая роль при
 * проверке: у headless Chrome в свежем профиле кука нет, а половина интерфейса
 * зависит от того, Исполнитель за экраном или Заказчик. Кук пользователя,
 * выбранный переключателем в шапке, всё равно главнее. */
const ЛОГИН_ПО_УМОЛЧАНИЮ = process.env.DEMO_USER || 'gadayatov';

const разобрать = (r: Record<string, unknown>): SessionUser => ({
  id: Number(r.id),
  login: r.login as string,
  fullName: r.full_name as string,
  position: r.position as string | null,
  side: r.side as 'executor' | 'customer',
  canDecide: r.can_decide as boolean,
  canEditEconomy: r.can_edit_economy as boolean,
});

const ПОЛЯ = 'id, login, full_name, position, side, can_decide, can_edit_economy';

/**
 * Текущий пользователь. `null` только на пустой базе — тогда интерфейс
 * показывает прочерк вместо имени, а действия отказываются работать.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const логин = (await cookies()).get(КУКА_ПОЛЬЗОВАТЕЛЯ)?.value ?? ЛОГИН_ПО_УМОЛЧАНИЮ;

  /* Логин из кука мог устареть — набор пользователей пересоздаётся вместе с
     демо. Тогда молча возвращаемся к тому, кто есть, а не роняем страницу. */
  const rows = await query<Record<string, unknown>>(`
    SELECT ${ПОЛЯ} FROM rec.users
    WHERE is_active AND login IN ($1, $2)
    ORDER BY (login = $1) DESC
    LIMIT 1
  `, [логин, ЛОГИН_ПО_УМОЛЧАНИЮ]);

  return rows[0] ? разобрать(rows[0]) : null;
});

/** Список для переключателя в шапке. Исполнитель первым: он выдаёт рекомендации. */
export const allUsers = cache(async (): Promise<SessionUser[]> => {
  const rows = await query<Record<string, unknown>>(`
    SELECT ${ПОЛЯ} FROM rec.users WHERE is_active
    ORDER BY side DESC, can_decide DESC, full_name
  `);
  return rows.map(разобрать);
});
