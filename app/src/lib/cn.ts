import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Объединение условных классов и разрешение конфликтов Tailwind — тот же
 * маленький адаптер, на который опираются сгенерированные компоненты shadcn.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
