import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './tokens.css';
import './registry.css';
import './app.css';
import './ui.css';
import './shadcn.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ScrollOverlay } from '@/components/ScrollOverlay';
import { AppShell } from '@/components/AppShell';
import { MotionProvider } from '@/components/MotionProvider';

/* subsets: cyrillic обязателен — интерфейс по-русски (см. CLAUDE.md). */
const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Модуль управления рекомендациями',
  description: 'Экспертное сопровождение механизированного фонда скважин',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* suppressHydrationWarning: скрипт ниже правит data-theme до гидрации, и
       React иначе ругается на расхождение атрибута с серверной разметкой. */
    <html lang="ru" data-theme="light" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* Тема ставится ДО первой отрисовки, поэтому скрипт синхронный и
            встроенный: любой внешний файл или эффект React выполнится после
            первого кадра, и тёмная страница мигнёт светлым. */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{var t=localStorage.getItem('vmap-theme');`
          + `if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body>
        {/* Оболочка (шапка и левая навигация) стоит здесь, а не в страницах.
            Иначе заглушка маршрута подставляется вместе с ней, и на время
            загрузки пропадают шапка с навигацией — уходишь из реестра в
            карточку, а слева пустота. В корневом layout она вне всех границ
            Suspense: остаётся на месте, не перемонтируется при навигации и
            сохраняет прокрутку. Цена — layout читает пользователя и потому
            динамический; страницы и так объявлены `force-dynamic`. */}
        <MotionProvider>
          <TooltipProvider delayDuration={350}>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </MotionProvider>
        {/* Индикатор прокрутки окна. Экраны с собственным прокручиваемым
            контейнером (карточка) поднимают свой — см. `ScrollOverlay`. */}
        <ScrollOverlay target={null} />
      </body>
    </html>
  );
}
