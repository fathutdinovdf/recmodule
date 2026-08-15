'use client';

/* Переключатель темы в шапке.
 *
 * Тема — атрибут `data-theme` на <html>, весь остальной слой уже сделан
 * токенами: переключение сводится к одной строке. Выбор хранится в
 * localStorage, а не в куке и не в базе: это настройка рабочего места, она не
 * должна ехать за пользователем на чужой монитор, и серверу о ней знать нечего.
 *
 * До первой отрисовки тему ставит крошечный скрипт в layout.tsx — иначе
 * страница успевает мигнуть светлым и только потом темнеет.
 */

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Hint } from '@/components/ui/Hint';

export const КЛЮЧ_ТЕМЫ = 'vmap-theme';

export function ПереключательТемы() {
  /* На сервере темы не знаем: она читается из localStorage уже в браузере.
     Стартуем со светлой — она основная, и при совпадении (а это девять
     случаев из десяти) переключения кадра не будет вовсе. */
  const [тёмная, setТёмная] = useState(false);

  useEffect(() => {
    setТёмная(document.documentElement.dataset.theme === 'dark');
  }, []);

  function переключить() {
    const новая = тёмная ? 'light' : 'dark';
    document.documentElement.dataset.theme = новая;
    /* localStorage недоступен в приватном режиме некоторых браузеров, и
       падение здесь уронило бы обработчик клика целиком. */
    try { localStorage.setItem(КЛЮЧ_ТЕМЫ, новая); } catch { /* переживём */ }
    setТёмная(!тёмная);
  }

  return (
    <Hint text={тёмная ? 'Светлая тема' : 'Тёмная тема'}>
      <button className="iconbtn iconbtn--lg" type="button" onClick={переключить}
              aria-pressed={тёмная} aria-label="Сменить тему">
        {/* Солнце и месяц стоят друг на друге и меняются поворотом со сжатием
            — приём из mode-toggle у shadcn. Одна иконка, подменённая на другую
            мгновенно, читается как перерисовка кнопки, а не как переключение. */}
        <span className="relative flex size-5 items-center justify-center">
          <Sun className="absolute size-5 transition-all"
               style={{
                 opacity: тёмная ? 0 : 1,
                 transform: тёмная ? 'rotate(-90deg) scale(0)' : 'none',
                 transitionDuration: 'var(--motion-base)',
                 transitionTimingFunction: 'var(--ease-out)',
               }} />
          <Moon className="absolute size-5 transition-all"
                style={{
                  opacity: тёмная ? 1 : 0,
                  transform: тёмная ? 'none' : 'rotate(90deg) scale(0)',
                  transitionDuration: 'var(--motion-base)',
                  transitionTimingFunction: 'var(--ease-out)',
                }} />
        </span>
      </button>
    </Hint>
  );
}
