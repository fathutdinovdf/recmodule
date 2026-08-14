'use client';

/* Окно действия: форма из меню в шапке открывается поверх карточки.
 *
 * Открытость по-прежнему живёт в адресе (`?form=...`), а не в состоянии
 * компонента: ссылку на подтверждение можно переслать, а перезагрузка страницы
 * не закрывает окно посреди подтверждения. Отсюда и закрытие — переход на
 * адрес без параметра, а не setState.
 *
 * Содержимое — серверная разметка формы: она приходит в children уже
 * отрисованной, поэтому клиентским оказывается только само окно.
 */

import { useRouter, usePathname } from 'next/navigation';
import { TriangleAlertIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './dialog';

export function ActionDialog({ title, description, facts, tone = 'default', children }: {
  title: string;
  description?: React.ReactNode;
  /* Факты, на которые смотрят, принимая решение: сколько суток теряется,
     какой статус снимается. Подтверждение без единой цифры человек кликает
     не глядя — а действия здесь необратимые. */
  facts?: React.ReactNode;
  /** `danger` — необратимое действие: значок и красный заголовок. */
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Dialog open onOpenChange={(открыто) => { if (!открыто) router.push(pathname); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tone === 'danger' && (
              <TriangleAlertIcon className="size-4 shrink-0 text-[var(--status-error-text)]"
                                 aria-hidden="true" />
            )}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {facts && (
          <div className="rounded-md bg-[var(--bg-secondary)] px-3 py-2 text-sm text-foreground">
            {facts}
          </div>
        )}

        {children}
      </DialogContent>
    </Dialog>
  );
}
