'use client';

import { useRouter } from 'next/navigation';
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
  const router = useRouter();
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
        {/* Пункт — сам пункт меню, а не ссылка внутри него: у ссылок в
            registry.css своё оформление, и вложенный <a> превращал пункт в
            обведённую рамкой плашку поверх меню. */}
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant={action.destructive ? 'destructive' : 'default'}
            /* Красный текст берётся из токена текста, а не из --destructive:
               там у ВМАП светлая заливка для кнопок, и как цвет надписи она
               даёт почти прозрачные буквы. Важность нужна, чтобы перебить
               `data-[variant=destructive]:text-destructive` самого пункта. */
            className={action.destructive
              ? '!text-[var(--status-error-text)]' : undefined}
            onSelect={() => router.push(`/rec/${recId}/${action.href}`)}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
