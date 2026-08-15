import { currentUser } from '@/lib/session';
import { registrationReferences } from '@/db/registration';
import { listRegistrationWells } from '@/db/vmap';
import { RegistrationWizard, type RegistrationWell } from './wizard';
import './wizard.css';

export const dynamic = 'force-dynamic';

export default async function NewRecommendationPage() {
  const [references, user, vmapWells] = await Promise.all([
    registrationReferences(), currentUser(), listRegistrationWells(),
  ]);
  const wells: RegistrationWell[] = vmapWells;

  return (
    <main className="content wz-underlay">
      <div className="pagehead"><h1>Реестр рекомендаций</h1></div>
      {user?.side === 'executor' ? (
        <RegistrationWizard
          wells={wells}
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
