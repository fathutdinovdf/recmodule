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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from './dialog';

export function ActionDialog({ title, tone = 'default', className, children }: {
  title: string;
  /** `danger` — необратимое действие: значок и красный заголовок. */
  tone?: 'default' | 'danger';
  /** Ширина окна. По умолчанию 480 — подтверждению этого хватает; форма с
      парой полей в строку просит 560, иначе поля переносятся по одному. */
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Dialog open onOpenChange={(открыто) => { if (!открыто) router.push(pathname); }}>
      {/* aria-describedby снимаем явно: описания у окна больше нет, а Radix
          без этого пишет в консоль предупреждение о недостающем описании. */}
      <DialogContent className={className} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tone === 'danger' && (
              <TriangleAlertIcon className="size-4 shrink-0 text-[var(--status-error-text)]"
                                 aria-hidden="true" />
            )}
            {title}
          </DialogTitle>
        </DialogHeader>

        {children}
      </DialogContent>
    </Dialog>
  );
}
