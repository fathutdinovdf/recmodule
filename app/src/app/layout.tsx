import type { Metadata } from 'next';
import './tokens.css';
/* Tailwind и мост к токенам подключаются ДО файлов макета. Порядок здесь не
   решает ничего сам по себе — Tailwind разложен по @layer, а registry.css вне
   слоёв и потому сильнее, — но читается он как «сначала общий слой, потом
   макет», и так честнее. */
import './shadcn.css';
import './registry.css';
import './app.css';

export const metadata: Metadata = {
  title: 'Модуль управления рекомендациями',
  description: 'Экспертное сопровождение механизированного фонда скважин',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
