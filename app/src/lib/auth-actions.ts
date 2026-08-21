'use server';

/* Вход и выход.
 *
 * Форма с паролем — временная реализация: в рабочем контуре личность придёт
 * из ВМАП (см. `session.ts`). Поэтому здесь нет ни регистрации, ни смены
 * пароля, ни восстановления — всё это заводится администратором на экране
 * «Пользователи и роли». Заводить свою парольную политику ради месяца работы
 * значило бы поддерживать её потом годами.
 */

import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/db/pool';
import { парольПодходит } from './password';
import { КУКА_СЕССИИ, КУКА_ПОЛЬЗОВАТЕЛЯ } from './session-cookies';

/* Тридцать суток. Модуль открывают не каждый день — недельный срок означал бы
   форму входа почти при каждом обращении, а ценности это не добавляет:
   сессию всё равно гасят снятием доступа, а не истечением. */
const СРОК_СУТОК = 30;

export interface РезультатВхода { ошибка?: string }

export async function войти(_: РезультатВхода, форма: FormData): Promise<РезультатВхода> {
  const логин = String(форма.get('login') ?? '').trim().toLowerCase();
  const пароль = String(форма.get('password') ?? '');
  if (!логин || !пароль) return { ошибка: 'Введите логин и пароль' };

  const [u] = await query<{ id: string; password_hash: string | null; home: string }>(`
    SELECT u.id, u.password_hash, r.home
      FROM rec.users u JOIN rec.roles r ON r.key = u.role_key
     WHERE lower(u.login) = $1 AND u.is_active`, [логин]);

  /* Проверка пароля выполняется и для несуществующего логина: без неё ответ
     приходит мгновенно, и форма входа превращается в способ узнать, кто
     заведён в модуле. Хеш здесь заведомо не подойдёт — важно время. */
  const подошёл = await парольПодходит(пароль, u?.password_hash ?? null);

  /* Одно сообщение на оба случая — «нет такого» и «пароль неверен» — по той же
     причине. */
  if (!u || !подошёл) return { ошибка: 'Неверный логин или пароль' };

  const id = randomBytes(32).toString('base64url');
  const агент = (await headers()).get('user-agent');
  await query(`
    INSERT INTO rec.sessions (id, user_id, expires_at, user_agent)
    VALUES ($1, $2, now() + ($3 || ' days')::interval, $4)`,
  [id, u.id, String(СРОК_СУТОК), агент]);
  await query('UPDATE rec.users SET last_login_at = now() WHERE id = $1', [u.id]);

  const куки = await cookies();
  куки.set(КУКА_СЕССИИ, id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * СРОК_СУТОК,
  });
  /* Кука подмены входа старше сессии и в разработке живёт год. Если её не
     снять, вошедший под своим логином увидит на экране чужого пользователя —
     ровно того, кем в прошлый раз пользовались в переключателе. */
  куки.delete(КУКА_ПОЛЬЗОВАТЕЛЯ);

  /* redirect бросает исключение — всё, что должно случиться до перехода,
     стоит выше. */
  redirect(СТАРТ[u.home] ?? '/');
}

/* Стартовая страница роли (решение 82). Инбокса и экрана пользователей в
   приложении пока нет — обе роли до их появления приходят в реестр. */
const СТАРТ: Record<string, string> = { inbox: '/', registry: '/', users: '/users' };

export async function выйти(): Promise<void> {
  const куки = await cookies();
  const id = куки.get(КУКА_СЕССИИ)?.value;
  /* Сессия удаляется, а не просто забывается куком: иначе украденный
     идентификатор оставался бы годным до истечения срока. */
  if (id) await query('DELETE FROM rec.sessions WHERE id = $1', [id]);
  куки.delete(КУКА_СЕССИИ);
  куки.delete(КУКА_ПОЛЬЗОВАТЕЛЯ);
  revalidatePath('/', 'layout');
  redirect('/login');
}
