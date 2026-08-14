'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { Hint } from '@/components/ui/Hint';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ActionItem {
  label: string;
  /** Куда ведёт пункт: вкладка и параметр, раскрывающий форму действия. */
  href: string;
  destructive?: boolean;
}

/* Состав действий повторяет HEAD_ACTIONS из макета.
 *
 * Каждый пункт — ссылка на вкладку с раскрытой формой, а не действие прямо из
 * меню: все они меняют состояние рекомендации необратимо, и подтверждение с
 * объяснением последствий обязательно. Заодно действие переживает
 * перезагрузку и работает без JavaScript, как остальные формы карточки.
 */
const ACTIONS: Record<string, ActionItem[]> = {
  draft: [
    { label: 'Зарегистрировать', href: 'summary?form=register' },
    { label: 'Удалить', href: 'summary?form=delete', destructive: true },
  ],
  registered: [{ label: 'Отменить', href: 'summary?form=cancel', destructive: true }],
  sent: [{ label: 'Отменить', href: 'summary?form=cancel', destructive: true }],
  review: [{ label: 'Отменить', href: 'summary?form=cancel', destructive: true }],
  clarify: [
    { label: 'Внести уточнение и передать', href: 'summary?form=resend' },
    { label: 'Отменить', href: 'summary?form=cancel', destructive: true },
  ],
  approved: [{ label: 'Зафиксировать реализацию', href: 'impl?form=fact' }],
  windowOpen: [{ label: 'Закрыть окно досрочно', href: 'impl?form=close', destructive: true }],
  rejected: [{ label: 'Создать новую на основе', href: 'summary?form=copy' }],
  cancelled: [{ label: 'Создать новую на основе', href: 'summary?form=copy' }],
};

export function CardActionsMenu({ status, recId, executor }: {
  status: string;
  recId: number;
  /** Все действия меню — действия Исполнителя; Заказчику меню не показывается. */
  executor: boolean;
}) {
  const actions = executor ? ACTIONS[status] ?? [] : [];
  if (!actions.length) return null;

  return (
    <DropdownMenu>
      <Hint text="Действия с рекомендацией">
        <DropdownMenuTrigger asChild>
          <button className="cnbtn" type="button" aria-label="Действия с рекомендацией">
            <Icon id="more" size={20} />
          </button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent
        align="end"
        className="min-w-40 rounded-lg border-[var(--border-divider-light)] bg-[var(--bg-popover)] p-1 shadow-md"
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            asChild
            variant={action.destructive ? 'destructive' : 'default'}
          >
            <Link href={`/rec/${recId}/${action.href}`}>{action.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
