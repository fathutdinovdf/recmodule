/* Перехватывающий маршрут: переход на /rec/new из реестра остаётся на месте
 * (URL меняется, но серверный рендер реестра не перезапускается), а здесь
 * рисуется только сам мастер — поверх таблицы, а не вместо неё. Прямой заход
 * по ссылке или обновление страницы перехват не ловит и уходит на обычный
 * app/rec/new/page.tsx (тот же RegistrationWizard, без стола под низом).
 */

import { currentUser } from '@/lib/session';
import { registrationReferences } from '@/db/registration';
import { RegistrationWizard } from '../../../rec/new/wizard';
import '../../../rec/new/wizard.css';

export const dynamic = 'force-dynamic';

export default async function RegistrationModal() {
  const [references, user] = await Promise.all([
    registrationReferences(), currentUser(),
  ]);

  if (user?.side !== 'executor') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <section className="panel wz-access" style={{ background: 'var(--bg-popover)' }}>
          Мастер регистрации доступен Исполнителю. Переключите демонстрационного пользователя в шапке.
        </section>
      </div>
    );
  }

  return (
    <RegistrationWizard
      directions={references.directions}
      priorities={references.priorities}
      executors={references.executors}
      currentExecutorId={user.id}
    />
  );
}
