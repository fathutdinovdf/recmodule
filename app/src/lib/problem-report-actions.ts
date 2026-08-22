'use server';

/* Кнопка «Обратная связь» в подвале навигации — один канал на проблему,
 * идею и рекомендацию по модулю сразу (см. комментарий у КнопкаПроблемы в
 * AppChrome.tsx).
 *
 * Видна Исполнителю и администратору модуля: у Заказчика для этого есть
 * канал через самого Исполнителя, а не форма внутри чужого инструмента.
 * Заявка прежде всего ложится в таблицу — администратор смотрит список на
 * /problems независимо от почты. Письмо (`lib/mail.ts`) — только ускоряющий
 * слой поверх: если SMTP не настроен или упал, заявка всё равно сохранена.
 */

import { revalidatePath } from 'next/cache';
import { currentUser } from './session';
import { этоИсполнитель, этоАдминистратор } from './access';
import { создатьЗаявкуОПроблеме } from '@/db/problem-reports';
import { уведомитьОЗаявке } from './mail';

const ПРЕДЕЛ_ТЕКСТА = 4000;
const ПРЕДЕЛ_ФАЙЛА = 10 * 1024 * 1024;
const ПРЕДЕЛ_ФАЙЛОВ = 3;

export type ОтветЗаявки = null | { ok: true } | { ok: false; error: string };

export async function сообщитьОПроблеме(
  _prev: ОтветЗаявки, formData: FormData,
): Promise<ОтветЗаявки> {
  const пользователь = await currentUser();
  if (!пользователь || !(этоИсполнитель(пользователь) || этоАдминистратор(пользователь))) {
    return { ok: false, error: 'Эта форма доступна Исполнителю и администратору модуля.' };
  }

  const текст = String(formData.get('text') ?? '').trim().slice(0, ПРЕДЕЛ_ТЕКСТА);
  if (!текст) return { ok: false, error: 'Опишите проблему, идею или предложение.' };

  const page = String(formData.get('page') ?? '');
  const файлы = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (файлы.length > ПРЕДЕЛ_ФАЙЛОВ) return { ok: false, error: `Не больше ${ПРЕДЕЛ_ФАЙЛОВ} скриншотов за раз.` };
  if (файлы.some((f) => f.size > ПРЕДЕЛ_ФАЙЛА)) return { ok: false, error: 'Каждый файл — не больше 10 МБ.' };

  await создатьЗаявкуОПроблеме(пользователь.id, page, текст, файлы);
  /* /problems читает базу заново при каждом заходе (force-dynamic), но
     администратор мог держать вкладку открытой ещё до заявки. */
  revalidatePath('/problems');

  /* Заявка уже сохранена — сбой почты не должен превращать успешную
     отправку в ошибку формы. */
  try {
    const вложения = await Promise.all(файлы.map(async (f) => ({
      filename: f.name,
      content: Buffer.from(await f.arrayBuffer()),
      contentType: f.type || undefined,
    })));
    await уведомитьОЗаявке({ автор: пользователь.fullName, page, text: текст, вложения });
  } catch (e) {
    console.error('не удалось отправить письмо о заявке', e);
  }

  return { ok: true };
}
