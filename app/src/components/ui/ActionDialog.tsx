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
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './dialog';

export function ActionDialog({ title, description, children }: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Dialog
      open
      onOpenChange={(открыто) => { if (!открыто) router.push(pathname); }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
