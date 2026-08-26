'use client';

/* Кнопка «Создать рекомендацию» и мастер поверх реестра — без своего адреса.
 * Раньше мастер жил в перехватывающем маршруте (@modal/(.)rec/new): URL менялся
 * на /rec/new, ссылку можно было скопировать. Явно не нужно — открытость мастера
 * держится в обычном состоянии компонента, справочники подтягиваются действием
 * `справочникиМастера` только в момент открытия (см. actions.ts), а закрытие —
 * это просто setOpen(false), а не навигация.
 */

import * as React from 'react';
import { motion } from 'motion/react';
import { Spinner } from '@/components/ui/spinner';
import { RegistrationWizard } from './rec/new/wizard';
import { справочникиМастера, type RegistrationReferencesResult } from './rec/new/actions';
import './rec/new/wizard.css';

export function RegistrationLauncher() {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [references, setReferences] = React.useState<RegistrationReferencesResult | null>(null);

  /* Между кликом и ответом справочникиМастера() окно ещё не открыто — без
     этого признака нажатие на кнопку не давало вообще никакого отклика,
     пока сервер не ответит: человек не понимал, дошёл ли клик. */
  const загрузка = open && !references;

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
      <button
        type="button"
        className="btn btn--accent btn--main"
        onClick={launch}
        disabled={загрузка}
        aria-busy={загрузка}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <MorphIcon on={hover} pending={загрузка} />Создать рекомендацию
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

/* Плюс сменяется листом с плюсом при наведении: жест «добавить» уступает
 * предмету действия — новой рекомендации. Обе иконки лежат стопкой в
 * квадрате 16×16, иначе на подмене кнопка дёргала бы ширину.
 * Поворот в противоход (уходящая вправо, приходящая слева) читается как
 * одно движение, а не как две независимые иконки. */
function MorphIcon({ on, pending }: { on: boolean; pending: boolean }) {
  const common = {
    className: 'ic16 btn__morph-ic',
    'aria-hidden': true,
    initial: false,
    transition: { type: 'spring' as const, stiffness: 420, damping: 30 },
  };
  /* Тот же квадрат 16×16, что у обычных двух иконок — иначе подмена на
     спиннер дёргает ширину кнопки ровно так, как боялся исходный комментарий
     про stacking двух svg. */
  if (pending) return <span className="btn__morph"><Spinner className="ic16 btn__morph-ic" /></span>;
  return (
    <span className="btn__morph">
      <motion.svg {...common} animate={{ opacity: on ? 0 : 1, scale: on ? 0.6 : 1, rotate: on ? 40 : 0 }}>
        <use href="#i-plus" />
      </motion.svg>
      <motion.svg {...common} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.6, rotate: on ? 0 : -40 }}>
        <use href="#i-doc-plus" />
      </motion.svg>
    </span>
  );
}
