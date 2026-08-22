'use client';

/* Форма входа.
 *
 * useActionState, а не собственное состояние с fetch: ошибку возвращает
 * серверное действие, оно же ставит куку и уводит на стартовую страницу роли.
 * Промежуточного клиентского состояния здесь нет вовсе — нечему рассинхро-
 * низироваться.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { войти } from '@/lib/auth-actions';

export function ФормаВхода() {
  const [состояние, отправить] = useActionState(войти, {});

  return (
    <form className="login__form" action={отправить}>
      {состояние.ошибка && <div className="login__error" role="alert">{состояние.ошибка}</div>}

      <label className="login__label" htmlFor="login">Логин</label>
      <div className="field login__field">
        <input id="login" name="login" autoComplete="username" autoFocus required />
      </div>

      <label className="login__label" htmlFor="password">Пароль</label>
      <div className="field login__field">
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      <Кнопка />
    </form>
  );
}

/* Отдельный компонент: useFormStatus читает состояние ближайшей формы сверху
   и внутри самой формы всегда вернул бы pending = false. */
function Кнопка() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--accent btn--main login__submit" disabled={pending}>
      {pending ? 'Проверяем…' : 'Войти'}
    </button>
  );
}
