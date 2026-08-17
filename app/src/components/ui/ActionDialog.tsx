'use client';

/* Окно действия: форма открывается поверх карточки.
 *
 * Два режима, и разница между ними — цена открытия.
 *
 * 1. Адресный (по умолчанию). Открытость живёт в `?form=...`: окно попадает на
 *    страницу только когда сервер его отрисовал, поэтому открытие — навигация,
 *    со сменой адреса и заглушкой вкладки по пути. Зато ссылку на окно можно
 *    переслать, а перезагрузка не закрывает его посреди подтверждения.
 * 2. Управляемый (передан `open`). Окно уже стоит в разметке страницы
 *    закрытым, и открывает его состояние — мгновенно, без навигации. Адрес
 *    остаётся вторым входом: он задаёт начальное состояние.
 *
 * Второй режим появился потому, что первый заметен глазом: нажатие на кнопку
 * давало заглушку вкладки и только потом окно, а отказ валидации прогонял тот
 * же круг заново.
 *
 * Содержимое — серверная разметка формы: она приходит в children уже
 * отрисованной, поэтому клиентским оказывается только само окно.
 */

import { useRouter, usePathname } from 'next/navigation';
import { TriangleAlertIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from './dialog';

export function ActionDialog({
  title, tone = 'default', className, children, open, onOpenChange, trigger,
}: {
  title: string;
  /** `danger` — необратимое действие: значок и красный заголовок. */
  tone?: 'default' | 'danger';
  /** Ширина окна. По умолчанию 480 — подтверждению этого хватает; форма с
      парой полей в строку просит 560, иначе поля переносятся по одному. */
  className?: string;
  children: React.ReactNode;
  /** Управляемый режим: открытость держит вызывающий компонент. */
  open?: boolean;
  onOpenChange?: (открыто: boolean) => void;
  /** Кнопка, открывающая окно. Только для управляемого режима. */
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const управляемое = open !== undefined;

  return (
    <Dialog
      open={управляемое ? open : true}
      onOpenChange={(открыто) => {
        if (управляемое) onOpenChange?.(открыто);
        else if (!открыто) router.push(pathname);
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
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
