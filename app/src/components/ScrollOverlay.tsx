'use client';

/* Полоса прокрутки, которая ничего не занимает.
 *
 * Системная полоса отъедает у содержимого восемь пикселов, а появляясь и
 * исчезая вместе с длиной содержимого, сдвигает вёрстку вбок — на карточке это
 * заметно при переходе между вкладками. Здесь вместо неё накладной индикатор:
 * он поверх содержимого, показывается во время прокрутки и гаснет.
 *
 * Именно индикатор, а не полноценная полоса: тащить его мышью нельзя. Тянут
 * полосу в вебе редко, а накладная полоса, за которую вдруг можно схватиться,
 * перехватывала бы клики по тому, что под ней.
 *
 * Цель — либо окно (реестр, справочники), либо конкретный прокручиваемый
 * элемент: на карточке прокручивается не страница, а панель вкладки.
 */

import { useEffect, useRef, useState } from 'react';

/** Сколько индикатор виден после последнего движения. */
const ЖИЗНЬ_МС = 900;
const МИН_ВЫСОТА_PX = 32;

export function ScrollOverlay({ target }: { target?: HTMLElement | null }) {
  const [ползунок, setПолзунок] = useState<{ top: number; height: number; left: number } | null>(null);
  const [видно, setВидно] = useState(false);
  const таймер = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    /* `undefined` — цель ещё не определена (элемент ищется после монтирования),
       `null` — цели нет, и тогда следим за окном. */
    if (target === undefined) return;
    const цель = target;

    const пересчитать = () => {
      const всего = цель ? цель.scrollHeight : document.documentElement.scrollHeight;
      const видимо = цель ? цель.clientHeight : window.innerHeight;
      const сверху = цель ? цель.scrollTop : window.scrollY;

      /* Содержимое короче окна — крутить нечего, индикатор был бы враньём. */
      if (всего <= видимо + 1) { setВидно(false); return; }

      const коробка = цель?.getBoundingClientRect();
      const высота = Math.max((видимо / всего) * видимо, МИН_ВЫСОТА_PX);
      const доля = сверху / (всего - видимо);

      setПолзунок({
        top: (коробка?.top ?? 0) + доля * (видимо - высота),
        height: высота,
        left: (коробка ? коробка.right : window.innerWidth) - 8,
      });
      setВидно(true);

      if (таймер.current) clearTimeout(таймер.current);
      таймер.current = setTimeout(() => setВидно(false), ЖИЗНЬ_МС);
    };

    const источник: HTMLElement | Window = цель ?? window;
    источник.addEventListener('scroll', пересчитать, { passive: true });
    window.addEventListener('resize', пересчитать);
    return () => {
      источник.removeEventListener('scroll', пересчитать);
      window.removeEventListener('resize', пересчитать);
      if (таймер.current) clearTimeout(таймер.current);
    };
  }, [target]);

  if (!ползунок) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 w-[3px] rounded-full bg-[var(--text-quaternary)]"
      style={{
        top: `${ползунок.top}px`,
        left: `${ползунок.left}px`,
        height: `${ползунок.height}px`,
        opacity: видно ? 0.25 : 0,
        /* Положение — без перехода: ползунок обязан идти ровно за пальцем.
           Гаснет медленнее, чем появляется, чтобы уход не читался как рывок. */
        transition: `opacity ${видно ? 'var(--motion-fast)' : '400ms'} var(--ease-out)`,
      }}
    />
  );
}

/**
 * Ближайший прокручиваемый предок. Ищется по вычисленному стилю, а не по имени
 * класса: прокрутку в макете держат разные контейнеры (`.tabpane` на карточке,
 * `.tablewrap` в реестре), и завязка на класс сломалась бы на первом же новом
 * экране.
 */
export function найтиСкроллер(от: HTMLElement | null): HTMLElement | null {
  for (let el = от?.parentElement ?? null; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    /* Отбор по текущему `scrollHeight > clientHeight` ловил контейнер только
       если он уже переполнен в момент поиска. Пустой чат на входе не
       переполнен, элемент терялся навсегда — эффект ищет один раз при
       монтировании, — и более поздняя автопрокрутка к новой реплике молчала.
       Достаточно структурного признака: это прокручиваемый предок, даже если
       ему пока нечего прокручивать. */
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return null;
}
