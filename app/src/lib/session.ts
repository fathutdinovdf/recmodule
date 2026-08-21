/* Кто сейчас за экраном.
 *
 * Личность и права — разные вещи, и берутся они из разных мест. Личность
 * («кто вошёл») в рабочем контуре придёт из ВМАП: модуль встраивается в чужой
 * фронт, и человек приходит туда уже опознанным (вопрос 5.1 не закрыт —
 * выбирается между JWT ВМАП и заголовком от реверс-прокси). Права («что ему
 * можно») останутся здесь всегда: у ВМАП нет понятия «сторона договора».
 *
 * Поэтому способ входа спрятан в одну функцию `определитьЛичность`, и всё
 * остальное приложение о нём не знает. Сейчас реализация одна — своя форма с
 * паролем и сессией в базе; заменить её на JWT значит переписать эту функцию,
 * и больше ничего.
 *
 * Единственный модуль вне `app/`, зависящий от Next. Домена это не касается:
 * в `domain/` по-прежнему нет ни одного импорта из фреймворка.
 */

import { cache } from 'react';
import { cookies } from 'next/headers';
import { query } from '@/db/pool';
import { КУКА_СЕССИИ, КУКА_ПОЛЬЗОВАТЕЛЯ } from './session-cookies';

export interface SessionUser {
  id: number;
  login: string;
  fullName: string;
  position: string | null;
  side: 'executor' | 'customer';
  role: string;
  roleLabel: string;
  /** Стартовая страница роли: `inbox`, `registry`, `users`. */
  home: string;
  canDecide: boolean;
  canEditEconomy: boolean;
  /** Видит только те рекомендации, где он ответственный Исполнителя. */
  onlyOwn: boolean;
  /** Зона ответственности — месторождения ВМАП. Пустая означает «все объекты договора». */
  fields: { id: number; name: string }[];
}

export { КУКА_СЕССИИ, КУКА_ПОЛЬЗОВАТЕЛЯ } from './session-cookies';

const разобрать = (r: Record<string, unknown>): SessionUser => ({
  id: Number(r.id),
  login: r.login as string,
  fullName: r.full_name as string,
  position: r.position as string | null,
  side: r.side as 'executor' | 'customer',
  role: r.role_key as string,
  roleLabel: r.role_label as string,
  home: r.home as string,
  canDecide: r.can_decide as boolean,
  canEditEconomy: r.can_edit_economy as boolean,
  onlyOwn: r.only_own as boolean,
  fields: (r.fields as { id: string | number; name: string }[] | null ?? [])
    .map((f) => ({ id: Number(f.id), name: f.name })),
});

const ВЫБОРКА = `
  SELECT u.id, u.login, u.full_name, u.position, u.side, u.role_key,
         r.label AS role_label, r.home,
         u.can_decide, u.can_edit_economy, u.only_own,
         (SELECT json_agg(json_build_object('id', f.field_id, 'name', f.field_name)
                          ORDER BY f.field_name)
            FROM rec.user_fields f WHERE f.user_id = u.id) AS fields
    FROM rec.users u JOIN rec.roles r ON r.key = u.role_key`;

/* Подмена входа для разработки. В рабочем контуре её нет: пользователь
   приходит из ВМАП и не выбирается.
 *
 * Нужна по двум причинам. Первая — половина интерфейса зависит от того, кто за
 * экраном (кнопки решения видит только Заказчик с правом решения, факт
 * реализации фиксирует только Исполнитель), и проверять это, выходя и входя
 * шесть раз, невыносимо. Вторая — снимки экрана снимаются headless-браузером
 * в свежем профиле, где кука не переживает запуск, поэтому роль задаётся
 * переменной DEMO_USER.
 *
 * Умолчания у обеих нет намеренно: иначе в разработке форму входа не увидеть
 * никогда — любой браузер сразу оказывался бы внутри. */
const подменаВхода = process.env.NODE_ENV !== 'production';

async function определитьЛичность(): Promise<{ по: 'session' | 'login'; значение: string } | null> {
  const куки = await cookies();

  const сессия = куки.get(КУКА_СЕССИИ)?.value;
  if (сессия) return { по: 'session', значение: сессия };

  if (подменаВхода) {
    const логин = куки.get(КУКА_ПОЛЬЗОВАТЕЛЯ)?.value || process.env.DEMO_USER;
    if (логин) return { по: 'login', значение: логин };
  }
  return null;
}

/**
 * Текущий пользователь. `null` означает «не вошёл»: оболочка тогда рисует
 * голую страницу без шапки, а middleware уводит на форму входа.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const личность = await определитьЛичность();
  if (!личность) return null;

  const rows = личность.по === 'session'
    ? await query<Record<string, unknown>>(`
        ${ВЫБОРКА}
        JOIN rec.sessions s ON s.user_id = u.id
        WHERE s.id = $1 AND s.expires_at > now() AND u.is_active`, [личность.значение])
    /* Логин из кука подмены мог устареть — набор пользователей пересоздаётся
       вместе с демо. Тогда возвращаем null, то есть уводим на форму входа, а
       не роняем страницу. */
    : await query<Record<string, unknown>>(`
        ${ВЫБОРКА} WHERE u.login = $1 AND u.is_active`, [личность.значение]);

  return rows[0] ? разобрать(rows[0]) : null;
});

/** Список для переключателя подмены. Исполнитель первым: он выдаёт рекомендации. */
export const allUsers = cache(async (): Promise<SessionUser[]> => {
  if (!подменаВхода) return [];
  const rows = await query<Record<string, unknown>>(
    `${ВЫБОРКА} WHERE u.is_active ORDER BY u.side DESC, u.can_decide DESC, u.full_name`);
  return rows.map(разобрать);
});
