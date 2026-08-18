import { currentUser } from '@/lib/session';
import { registrationReferences } from '@/db/registration';
import { WizardStandalone } from './standalone';
import './wizard.css';

export const dynamic = 'force-dynamic';

export default async function NewRecommendationPage() {
  const [references, user] = await Promise.all([
    registrationReferences(), currentUser(),
  ]);

  return (
    <main className="content wz-underlay">
      <div className="pagehead"><h1>Реестр рекомендаций</h1></div>
      {user?.side === 'executor' ? (
        <WizardStandalone
          directions={references.directions}
          priorities={references.priorities}
          executors={references.executors}
          currentExecutorId={user.id}
        />
      ) : (
        <section className="panel wz-access">
          Мастер регистрации доступен Исполнителю. Переключите демонстрационного пользователя в шапке.
        </section>
      )}
    </main>
  );
}
