'use client';

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
  destructive?: boolean;
}

/* Состав действий повторяет HEAD_ACTIONS из макета. Пока серверные операции
   для них не реализованы, пункты намеренно disabled: меню можно оценить как
   компонент, но оно не создаёт ложного ощущения, что действие уже работает. */
const ACTIONS: Record<string, ActionItem[]> = {
  draft: [
    { label: 'Зарегистрировать' },
    { label: 'Удалить', destructive: true },
  ],
  registered: [{ label: 'Отменить', destructive: true }],
  clarify: [{ label: 'Внести уточнение и передать' }],
  approved: [{ label: 'Зафиксировать реализацию' }],
  windowOpen: [{ label: 'Закрыть окно досрочно', destructive: true }],
  rejected: [{ label: 'Создать новую на основе' }],
  cancelled: [{ label: 'Создать новую на основе' }],
};

export function CardActionsMenu({ status }: { status: string }) {
  const actions = ACTIONS[status] ?? [];
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
            disabled
            variant={action.destructive ? 'destructive' : 'default'}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
