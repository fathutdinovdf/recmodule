'use server';

/* Изменение прав.
 *
 * Роль, полномочия и зона сохраняются пакетом по кнопке (см. `сохранитьПрава`).
 * Операции доступа — пароль и включение-отключение — наоборот, выполняются
 * сразу: это не поля формы, а действия, и держать «снять пароль» в черновике
 * значило бы, что доступ снят на экране и не снят на деле.
 *
 * Журнал в обоих случаях построчный: одно поле — одно событие. Он нужен не
 * ради аудита ради аудита — когда рекомендация не дошла до исполнителя,
 * первый вопрос, была ли скважина в его зоне на тот момент.
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

/* Сохранение прав одним пакетом.
 *
 * Роль, полномочия и зона правятся в карточке как черновик и уходят сюда
 * вместе, по кнопке. Так сделано потому, что права — связный набор, а не
 * независимые галочки: смена роли тянет за собой умолчания полномочий, а зона
 * осмысленна только вместе с ними. Применять каждое поле по отдельности значило
 * бы проводить человека через состояния, которых он не хотел, — например,
 * через «инженер с правом решения», когда роль уже сменили, а право ещё нет.
 *
 * Транзакция одна на пакет: наполовину выданные права хуже невыданных.
 * Журнал при этом остаётся построчным — одно поле, одно событие: в разборе
 * «почему рекомендация не дошла» ищут конкретное изменение, а не пакет.
 */
export interface Права {
  role: string;
  canDecide: boolean;
  onlyOwn: boolean;
  canEditEconomy: boolean;
  fields: number[];
}

export async function сохранитьПрава(userId: number, права: Права): Promise<Ответ> {
  const я = await администратор();
  if (!я) return { ошибка: НЕ_АДМИН };

  const ошибка = await transaction(async (client) => {
    const { rows: [роль] } = await client.query(
      'SELECT key, label, side, has_recs FROM rec.roles WHERE key = $1', [права.role]);
    if (!роль) return 'Такой роли нет.';

    const { rows: [было] } = await client.query(`
      SELECT u.role_key, r.label AS role_label, u.can_decide, u.can_edit_economy, u.only_own
        FROM rec.users u JOIN rec.roles r ON r.key = u.role_key
       WHERE u.id = $1 FOR UPDATE OF u`, [userId]);
    if (!было) return 'Пользователь не найден.';

    /* Нормализация на сервере, а не только в интерфейсе: полномочие, к стороне
       договора неприменимое, не должно доезжать до базы даже если форму
       подменили. Решение принимает Заказчик, рекомендации ведёт Исполнитель. */
    const canDecide = роль.side === 'customer' && права.canDecide;
    const onlyOwn = роль.side === 'executor' && роль.has_recs && права.onlyOwn;
    const fields = роль.has_recs ? [...new Set(права.fields.map(Number))].filter(Number.isInteger) : [];

    await client.query(`
      UPDATE rec.users SET role_key = $2, can_decide = $3, only_own = $4, can_edit_economy = $5
       WHERE id = $1`, [userId, права.role, canDecide, onlyOwn, права.canEditEconomy]);

    const события: [string, string][] = [];
    if (было.role_key !== права.role) {
      события.push(['role', `Роль: ${было.role_label} → ${роль.label}.`]);
    }
    if (было.can_decide !== canDecide) {
      события.push(['permission',
        `${canDecide ? 'Выдано' : 'Снято'}: право решения по рекомендациям.`]);
    }
    if (было.only_own !== onlyOwn) {
      события.push(['permission', `${onlyOwn ? 'Выдан' : 'Снят'}: отбор по ответственному.`]);
    }
    if (было.can_edit_economy !== права.canEditEconomy) {
      события.push(['permission',
        `${права.canEditEconomy ? 'Выдана' : 'Снята'}: правка экономической модели.`]);
    }

    const { rows: зонаБыло } = await client.query(
      'SELECT field_id, field_name FROM rec.user_fields WHERE user_id = $1 ORDER BY field_name',
      [userId]);
    const списком = (r: { field_name: string }[]) =>
      (r.length ? r.map((x) => x.field_name).join(', ') : 'все объекты договора');

    const менялась = зонаБыло.length !== fields.length
      || зонаБыло.some((f: { field_id: string }) => !fields.includes(Number(f.field_id)));

    if (менялась) {
      await client.query('DELETE FROM rec.user_fields WHERE user_id = $1', [userId]);
      /* Название кладётся рядом с идентификатором: справочник — реплика ВМАП,
         и запись зоны должна читаться, даже если объект оттуда уехал. */
      if (fields.length) {
        await client.query(`
          INSERT INTO rec.user_fields (user_id, field_id, field_name)
          SELECT $1, w.field_id, min(w.field_name)
            FROM rec.ref_wells w WHERE w.field_id = ANY($2::bigint[])
           GROUP BY w.field_id`, [userId, fields]);
      }
      const { rows: зонаСтало } = await client.query(
        'SELECT field_name FROM rec.user_fields WHERE user_id = $1 ORDER BY field_name', [userId]);
      события.push(['zone', `Зона: ${списком(зонаБыло)} → ${списком(зонаСтало)}.`]);
    }

    for (const [вид, текст] of события) {
      await client.query(
        'INSERT INTO rec.user_access_log (user_id, actor, action, details) VALUES ($1,$2,$3,$4)',
        [userId, я.fullName, вид, текст]);
    }
    return null;
  });

  if (ошибка) return { ошибка };
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
