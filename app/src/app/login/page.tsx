import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { ФормаВхода } from './form';
import './login.css';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  /* Вошедшего форма входа не касается: попал сюда — значит по старой ссылке
     или по кнопке «назад» после входа. */
  if (await currentUser()) redirect('/');

  return (
    <div className="login">
      <div className="login__card">
        <div>
          <div className="login__title">Модуль управления рекомендациями</div>
          <div className="login__sub">Экспертное сопровождение механизированного фонда скважин</div>
        </div>
        <ФормаВхода />
        {process.env.NODE_ENV !== 'production' && (
          <div className="login__hint">
            Демонстрационные учётные записи: логин из списка пользователей,
            пароль совпадает с логином. Например <b>matrosov</b> — Исполнитель,
            <b> gadayatov</b> — Заказчик с правом решения.
          </div>
        )}
      </div>
    </div>
  );
}
