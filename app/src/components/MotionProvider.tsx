'use client';

import { MotionConfig } from 'motion/react';

/* Одно правило доступности для всех компонентов Animate UI. При системной
 * настройке reduced motion Motion убирает transform/layout-анимации, оставляя
 * спокойное изменение прозрачности — окно не возникает рывком, но и не едет. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
