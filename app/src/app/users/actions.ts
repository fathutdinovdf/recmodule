'use server';

/* Изменение прав.
 *
 * Каждое изменение применяется сразу и отдельной строкой ложится в
 * `rec.user_access_log`. Черновика и кнопки «Сохранить» здесь нет намеренно —
 * в отличие от экономической модели (решение 95), где пакет правок публикуется
 * с общей причиной. Там правятся деньги по договору, и связная причина у
 * пакета есть; здесь одно поле — одно понятное событие «кому что выдали», и
 * копить их в черновике значит только оттягивать вопрос «а кто это включил».
 *
 * Журнал нужен не ради аудита ради аудита: когда рекомендация не дошла до
 * исполнителя, первый вопрос — была ли скважина в его зоне на тот момент.
 */

import { revalidatePath } from 'next/cache';
import { query, transaction } from '@/db/pool';
import { currentUser } from '@/lib/session';
import { хешПароля } from '@/lib/password';

export interface Ответ { ошибка?: string }

/* Экран целиком — полномочие администратора модуля. Проверка стоит в каждом
   действии, а не только на странице: страница прячет кнопки, а действие
   вызывается по сети. */
async function администратор() {
  const я = await currentUser();
  return я && я.role === 'admin' ? я : null;
}

const НЕ_АДМИН = 'Пользователями и ролями управляет администратор модуля.';

async function записать(userId: number, actor: string, action: string, details: string) {
  await query(
    'INSERT INTO rec.user_access_log (user_id, actor, action, details) VALUES ($1,$2,$3,$4)',
    [userId, actor, action, details]);
}

export async function сменитьРоль(userId: number, roleKey: string): Promise<Ответ> {
  const я = await администратор();
  if (!я) return { ошибка: НЕ_АДМИН };

  const ошибка = await transaction(async (client) => {
    const { rows: [роль] } = await client.query(
      'SELECT label, can_decide, only_own FROM rec.roles WHERE key = $1', [roleKey]);
    if (!роль) return 'Такой роли нет.';

    const { rows: [было] } = await client.query(
      'SELECT r.label FROM rec.users u JOIN rec.roles r ON r.key = u.role_key WHERE u.id = $1',
      [userId]);

    /* Полномочия возвращаются к умолчаниям роли. Иначе право решения,
       выданное инженеру, тихо переезжает на технолога, которым его сделали, —
       а роль меняют как раз тогда, когда человек сменил обязанности. Сторону
       договора проставит триггер по роли. */
    await client.query(
      'UPDATE rec.users SET role_key = $2, can_decide = $3, only_own = $4 WHERE id = $1',
      [userId, roleKey, роль.can_decide, роль.only_own]);

    await client.query(
      'INSERT INTO rec.user_access_log (user_id, actor, action, details) VALUES ($1,$2,$3,$4)',
      [userId, я.fullName, 'role',
        `Роль: ${было?.label ?? '—'} → ${роль.label}. Полномочия приведены к умолчаниям роли.`]);
    return null;
  });

  if (ошибка) return { ошибка };
  revalidatePath('/users');
  return {};
}

export type Полномочие = 'decide' | 'economy' | 'onlyOwn';

const ПОЛЕ: Record<Полномочие, string> = {
  decide: 'can_decide', economy: 'can_edit_economy', onlyOwn: 'only_own',
};

const ПОДПИСЬ: Record<Полномочие, string> = {
  decide: 'право решения по рекомендациям',
  economy: 'правка экономической модели',
  onlyOwn: 'отбор по ответственному',
};

export async function переключитьПолномочие(
  userId: number, что: Полномочие, включить: boolean,
): Promise<Ответ> {
  const я = await администратор();
  if (!я) return { ошибка: НЕ_АДМИН };

  /* Имя колонки подставляется из словаря, а не из аргумента: значение
     приходит с клиента, и склеивать его с текстом запроса нельзя. */
  const колонка = ПОЛЕ[что];
  if (!колонка) return { ошибка: 'Неизвестное полномочие.' };

  await query(`UPDATE rec.users SET ${колонка} = $2 WHERE id = $1`, [userId, включить]);
  await записать(userId, я.fullName, 'permission',
    `${включить ? 'Выдано' : 'Снято'}: ${ПОДПИСЬ[что]}.`);

  revalidatePath('/users');
  return {};
}

export async function задатьЗону(userId: number, fieldIds: number[]): Promise<Ответ> {
  const я = await администратор();
  if (!я) return { ошибка: НЕ_АДМИН };

  await transaction(async (client) => {
    const { rows: было } = await client.query(
      'SELECT field_name FROM rec.user_fields WHERE user_id = $1 ORDER BY field_name', [userId]);

    await client.query('DELETE FROM rec.user_fields WHERE user_id = $1', [userId]);

    /* Название месторождения кладётся рядом с идентификатором: справочник —
       реплика ВМАП, и запись зоны должна читаться, даже если объект оттуда
       уехал. Идентификатор при этом остаётся главным — названия меняются. */
    if (fieldIds.length) {
      await client.query(
        `INSERT INTO rec.user_fields (user_id, field_id, field_name)
         SELECT $1, w.field_id, min(w.field_name)
           FROM rec.ref_wells w WHERE w.field_id = ANY($2::bigint[])
          GROUP BY w.field_id`, [userId, fieldIds]);
    }

    const { rows: стало } = await client.query(
      'SELECT field_name FROM rec.user_fields WHERE user_id = $1 ORDER BY field_name', [userId]);

    const текст = (r: { field_name: string }[]) =>
      (r.length ? r.map((x) => x.field_name).join(', ') : 'все объекты договора');

    await client.query(
      'INSERT INTO rec.user_access_log (user_id, actor, action, details) VALUES ($1,$2,$3,$4)',
      [userId, я.fullName, 'zone', `Зона: ${текст(было)} → ${текст(стало)}.`]);
    return null;
  });

  revalidatePath('/users');
  return {};
}

export async function переключитьДоступ(userId: number, активен: boolean): Promise<Ответ> {
  const я = await администратор();
  if (!я) return { ошибка: НЕ_АДМИН };
  if (я.id === userId && !активен) {
    return { ошибка: 'Себя отключить нельзя: администратор останется без входа, а вернуть его будет некому.' };
  }

  await transaction(async (client) => {
    await client.query('UPDATE rec.users SET is_active = $2 WHERE id = $1', [userId, активен]);
    /* Открытые сессии гасятся сразу: снятый доступ, действующий до истечения
       куки, — это не снятый доступ. */
    if (!активен) await client.query('DELETE FROM rec.sessions WHERE user_id = $1', [userId]);
    await client.query(
      'INSERT INTO rec.user_access_log (user_id, actor, action, details) VALUES ($1,$2,$3,$4)',
      [userId, я.fullName, 'active',
        активен ? 'Доступ включён.' : 'Доступ отключён, открытые сессии закрыты.']);
    return null;
  });

  revalidatePath('/users');
  return {};
}

export async function задатьПароль(userId: number, пароль: string): Promise<Ответ> {
  const я = await администратор();
  if (!я) return { ошибка: НЕ_АДМИН };

  /* Восемь символов — не парольная политика, а нижняя граница здравого
     смысла: своя аутентификация здесь временная (вопрос 5.1), и заводить под
     неё требования к составу символов значило бы поддерживать их годами ради
     месяца работы. */
  if (пароль.trim().length < 8) return { ошибка: 'Пароль короче восьми символов.' };

  await query('UPDATE rec.users SET password_hash = $2 WHERE id = $1',
    [userId, await хешПароля(пароль)]);
  /* В журнал попадает факт, а не значение. */
  await записать(userId, я.fullName, 'password', 'Задан пароль для входа.');

  revalidatePath('/users');
  return {};
}

export async function снятьПароль(userId: number): Promise<Ответ> {
  const я = await администратор();
  if (!я) return { ошибка: НЕ_АДМИН };

  await transaction(async (client) => {
    await client.query('UPDATE rec.users SET password_hash = NULL WHERE id = $1', [userId]);
    await client.query('DELETE FROM rec.sessions WHERE user_id = $1', [userId]);
    await client.query(
      'INSERT INTO rec.user_access_log (user_id, actor, action, details) VALUES ($1,$2,$3,$4)',
      [userId, я.fullName, 'password', 'Пароль снят: вход только из ВМАП.']);
    return null;
  });

  revalidatePath('/users');
  return {};
}

export async function добавитьПользователя(форма: FormData): Promise<Ответ & { id?: number }> {
  const я = await администратор();
  if (!я) return { ошибка: НЕ_АДМИН };

  const login = String(форма.get('login') ?? '').trim().toLowerCase();
  const fullName = String(форма.get('fullName') ?? '').trim();
  const position = String(форма.get('position') ?? '').trim() || null;
  const role = String(форма.get('role') ?? '').trim();

  if (!login || !fullName || !role) return { ошибка: 'Логин, имя и роль обязательны.' };
  if (!/^[a-z0-9._-]+$/.test(login)) {
    return { ошибка: 'Логин — латиница, цифры, точка, дефис или подчёркивание: он приедет из учётной записи ВМАП.' };
  }

  const [есть] = await query<{ id: string }>(
    'SELECT id FROM rec.users WHERE lower(login) = $1', [login]);
  if (есть) return { ошибка: 'Такой логин уже заведён.' };

  const созданные = await query<{ id: string }>(
    `INSERT INTO rec.users (login, full_name, position, role_key, can_decide, only_own, side)
     SELECT $1, $2, $3, r.key, r.can_decide, r.only_own, r.side FROM rec.roles r WHERE r.key = $4
     RETURNING id`, [login, fullName, position, role]);
  if (!созданные[0]) return { ошибка: 'Такой роли нет.' };

  /* Пароля нет: человек приходит из ВМАП. Задать его отдельным действием
     можно, но по умолчанию своего входа у нового пользователя не появляется. */
  await записать(Number(созданные[0].id), я.fullName, 'create',
    `Пользователь заведён. Роль: ${role}.`);

  revalidatePath('/users');
  return { id: Number(созданные[0].id) };
}
