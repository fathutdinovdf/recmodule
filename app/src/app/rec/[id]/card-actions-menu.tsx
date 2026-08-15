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
import { type КлючОкна } from './form-meta';

interface ActionItem {
  label: string;
  /** Вкладка, на которой живёт форма. Ключ формы берётся из `форма`. */
  tab: 'summary' | 'impl';
  форма: КлючОкна;
  destructive?: boolean;
}

/* Состав действий повторяет HEAD_ACTIONS из макета.
 *
 * Каждый пункт — ссылка на вкладку с раскрытой формой, а не действие прямо из
 * меню: все они меняют состояние рекомендации необратимо, и подтверждение с
 * объяснением последствий обязательно. Заодно действие переживает
 * перезагрузку и работает без JavaScript, как остальные формы карточки.
 */
const ОТМЕНА: ActionItem = { label: 'Отменить', tab: 'summary', форма: 'cancel', destructive: true };
const НА_ОСНОВЕ: ActionItem = { label: 'Создать новую на основе', tab: 'summary', форма: 'copy' };

const ACTIONS: Record<string, ActionItem[]> = {
  draft: [
    { label: 'Зарегистрировать', tab: 'summary', форма: 'register' },
    { label: 'Удалить', tab: 'summary', форма: 'delete', destructive: true },
  ],
  registered: [ОТМЕНА],
  sent: [ОТМЕНА],
  review: [ОТМЕНА],
  clarify: [
    { label: 'Внести уточнение и передать', tab: 'summary', форма: 'resend' },
    ОТМЕНА,
  ],
  approved: [{ label: 'Зафиксировать реализацию', tab: 'impl', форма: 'fact' }],
  windowOpen: [{ label: 'Закрыть окно досрочно', tab: 'impl', форма: 'close', destructive: true }],
  rejected: [НА_ОСНОВЕ],
  cancelled: [НА_ОСНОВЕ],
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
            onSelect={() => router.push(`/rec/${recId}/${action.tab}?form=${action.форма}`)}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
