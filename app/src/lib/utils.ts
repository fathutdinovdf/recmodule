/* Склейка классов для компонентов shadcn: clsx собирает условные классы,
   twMerge выбрасывает конфликтующие утилиты Tailwind, оставляя последнюю.
   Файл ожидается компонентами по алиасу @/lib/utils — имя менять нельзя. */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
