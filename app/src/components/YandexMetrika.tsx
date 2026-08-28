'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

const COUNTER_ID = 111972504;

declare global {
  interface Window {
    ym?: (id: number, action: string, params?: unknown) => void;
  }
}

/* Next.js — SPA: переходы между экранами не перезагружают страницу, и без
   ручного hit() Метрика видит только самый первый заход.

   Гейт на production — не оптимизация, а гигиена данных: без него каждый
   дев-запуск слал хиты и вебвизор в боевой счётчик, а при недоступном
   mc.yandex.ru консоль каждой страницы сыпала ERR_CONNECTION_RESET
   (единственный источник ошибок консоли по итогам QA-прогона 28.08.2026). */
const ВКЛЮЧЕНА = process.env.NODE_ENV === 'production';

export function YandexMetrika() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!ВКЛЮЧЕНА) return;
    const url = pathname + (searchParams.toString() ? `?${searchParams}` : '');
    window.ym?.(COUNTER_ID, 'hit', url);
  }, [pathname, searchParams]);

  if (!ВКЛЮЧЕНА) return null;

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

          ym(${COUNTER_ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", accurateTrackBounce:true, trackLinks:true});
        `}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${COUNTER_ID}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
