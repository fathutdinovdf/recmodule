/* Статусные цвета — единственное, для чего у shadcn нет своей переменной.
 * Его палитра знает primary, secondary и destructive, а ВМАП кодирует цветом
 * чью сторону процесса держит рекомендация. Поэтому токен ВМАП подставляется
 * в утилиту Tailwind напрямую.
 *
 * Классы записаны целиком, без склейки из кусков: Tailwind ищет имена классов
 * по исходникам обычным поиском текста и собранного из переменных не находит.
 */

export const ТОН: Record<string, string> = {
  ok: 'bg-[var(--status-success-light-bg)] text-[var(--status-success-text)]',
  warning: 'bg-[var(--status-warning-light-bg)] text-[var(--status-warning-text)]',
  late: 'bg-[var(--status-error-light-bg)] text-[var(--status-error-text)]',
  overdue: 'bg-[var(--status-error-light-bg)] text-[var(--status-error-text)]',
  waiting: 'bg-[var(--status-processing-light-bg)] text-[var(--status-processing-text)]',
  pending: 'bg-[var(--status-processing-light-bg)] text-[var(--status-processing-text)]',
  processing: 'bg-[var(--status-processing-light-bg)] text-[var(--status-processing-text)]',
  default: 'bg-[var(--status-default-light-bg)] text-[var(--status-default-text)]',
};
