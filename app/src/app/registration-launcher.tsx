'use client';

/* Кнопка «Создать рекомендацию» и мастер поверх реестра — без своего адреса.
 * Раньше мастер жил в перехватывающем маршруте (@modal/(.)rec/new): URL менялся
 * на /rec/new, ссылку можно было скопировать. Явно не нужно — открытость мастера
 * держится в обычном состоянии компонента, справочники подтягиваются действием
 * `справочникиМастера` только в момент открытия (см. actions.ts), а закрытие —
 * это просто setOpen(false), а не навигация.
 */

import * as React from 'react';
import { Icon } from '@/components/Icons';
import { RegistrationWizard } from './rec/new/wizard';
import { справочникиМастера, type RegistrationReferencesResult } from './rec/new/actions';
import './rec/new/wizard.css';

export function RegistrationLauncher() {
  const [open, setOpen] = React.useState(false);
  const [references, setReferences] = React.useState<RegistrationReferencesResult | null>(null);

  function launch() {
    setOpen(true);
    справочникиМастера().then(setReferences);
  }

  function close() {
    setOpen(false);
    setReferences(null);
  }

  return (
    <>
      <button type="button" className="btn btn--accent" onClick={launch}>
        <Icon id="plus" />Создать рекомендацию
      </button>
      {open && references?.allowed && (
        <RegistrationWizard
          directions={references.directions}
          priorities={references.priorities}
          executors={references.executors}
          currentExecutorId={references.currentExecutorId}
          onClose={close}
        />
      )}
      {open && references && !references.allowed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={close}>
          <section className="panel wz-access" style={{ background: 'var(--bg-popover)' }}>
            Мастер регистрации доступен Исполнителю. Переключите демонстрационного пользователя в шапке.
          </section>
        </div>
      )}
    </>
  );
}
