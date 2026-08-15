import type { Metadata } from 'next';
import './tokens.css';
import './registry.css';
import './app.css';
import './ui.css';
import './shadcn.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MotionProvider } from '@/components/MotionProvider';

export const metadata: Metadata = {
  title: 'Модуль управления рекомендациями',
  description: 'Экспертное сопровождение механизированного фонда скважин',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="light">
      <body>
        <MotionProvider>
          <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
