'use client';

/* Кнопка отправки формы, которая знает, что отправка идёт.
 *
 * Server action выполняется секунды: транзакция, а иногда и поход на стенд
 * ВМАП. Без блокировки два нажатия дают два запроса, и второй возвращает
 * «Окно уже закрыто» — человек видит ошибку там, где всё как раз сработало.
 *
 * useFormStatus читает состояние ближайшей формы сверху, поэтому кнопка должна
 * лежать внутри <form>, а не рядом с ней.
 */

import { useFormStatus } from 'react-dom';
import { Button } from './Button';

export function SubmitButton({ children, pendingText, variant }: {
  children: React.ReactNode;
  /** Подпись на время отправки. По умолчанию остаётся обычная. */
  pendingText?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
