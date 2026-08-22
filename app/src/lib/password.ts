/* Хранение паролей.
 *
 * Простой вход — временная мера: в рабочем контуре человек придёт из ВМАП уже
 * опознанным (вопрос 5.1 не закрыт). Но «временно» не значит «как попало»:
 * пароль хранится хешем, и хеш подобран так, чтобы перебор по украденной базе
 * стоил дорого.
 *
 * scrypt из стандартной библиотеки Node, без внешней зависимости: bcrypt
 * тянет нативную сборку, а она в контуре Заказчика собирается не всегда.
 * Параметры — рекомендованные OWASP N=2^16, r=8, p=1 (около 64 МБ и ~100 мс
 * на проверку); сохраняются рядом с хешем, иначе при их пересмотре старые
 * пароли перестанут проверяться.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  пароль: string, соль: Buffer, длина: number, опции: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 2 ** 16, r = 8, p = 1, ДЛИНА = 32;
/* maxmem по умолчанию 32 МБ, а N=2^16 требует вдвое больше — без этого scrypt
   падает с «memory limit exceeded». */
const ОПЦИИ = { N, r, p, maxmem: 256 * 1024 * 1024 };

export async function хешПароля(пароль: string): Promise<string> {
  const соль = randomBytes(16);
  const хеш = await scryptAsync(пароль.normalize('NFKC'), соль, ДЛИНА, ОПЦИИ);
  return `scrypt$${N}$${r}$${p}$${соль.toString('base64')}$${хеш.toString('base64')}`;
}

export async function парольПодходит(пароль: string, хранимое: string | null): Promise<boolean> {
  /* Пользователь без пароля (вход только из ВМАП) не должен отличаться по
     времени ответа от пользователя с неверным паролем — иначе форма входа
     превращается в способ узнать, кто заведён в модуле. */
  if (!хранимое) { await хешПароля(пароль); return false; }

  const [алгоритм, n, rr, pp, соль64, хеш64] = хранимое.split('$');
  if (алгоритм !== 'scrypt') return false;

  const ожидается = Buffer.from(хеш64, 'base64');
  const получено = await scryptAsync(пароль.normalize('NFKC'), Buffer.from(соль64, 'base64'),
    ожидается.length, { N: Number(n), r: Number(rr), p: Number(pp), maxmem: 256 * 1024 * 1024 });

  return получено.length === ожидается.length && timingSafeEqual(получено, ожидается);
}
