'use client';

/* Раскрытие посуточного расчёта — раньше нативный <details>, теперь общий
 * Collapsible с плавной анимацией высоты (см. src/components/ui/Collapsible.tsx).
 * Сама таблица и текст под ней остаются на сервере — сюда приходят детьми,
 * клиентский код только открывает/закрывает блок. */

import type { ReactNode } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/Collapsible';

export function СутРаскрытие({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <Collapsible className="eff-collapsible">
      <CollapsibleTrigger className="eff-collapsible__trigger">{summary}</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="eff-collapsible__body">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
