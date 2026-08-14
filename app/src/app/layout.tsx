import type { Metadata } from 'next';
import './tokens.css';
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
