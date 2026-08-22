'use client';

/* Предупреждение «сначала внесите базовые значения» на вкладке реализации.
 *
 * Договор: «Базовые значения определяются ДО МОМЕНТА РЕАЛИЗАЦИИ рекомендации
 * Исполнителя». Фиксация открывает окно эффекта, после чего база изменению не
 * подлежит, — значит это последний момент, когда её ещё можно определить
 * вовремя. Отсюда и место предупреждения: не там, где базу вводят, а там, где
 * без неё нельзя идти дальше.
 *
 * Почему с движением. Блок появляется на уже открытой вкладке (человек пришёл
 * фиксировать реализацию), и статичная плашка среди прочего текста читается
 * как очередной абзац справки. Выезд по высоте и подсветка иконки говорят
 * «это про сейчас», не заставляя ничего читать. Движение выключается системной
 * настройкой prefers-reduced-motion — за это отвечает сама motion.
 */

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Ruler, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ЗаслонБазы({ recId }: { recId: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-lg border border-[var(--status-warning)]/45
                 bg-[var(--status-warning)]/8 p-4"
      style={{ marginBottom: 'var(--group-gap-m)' }}
    >
      {/* Полоса слева — тот же приём, что у просроченных строк реестра
          (`row-overdue`): цвет держит смысл «требуется действие», а не
          украшает. */}
      <span aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] bg-[var(--status-warning)]" />

      <div className="flex items-start gap-3 pl-2">
        <motion.span
          aria-hidden
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 320, damping: 18 }}
          className="grid size-9 shrink-0 place-items-center rounded-md
                     bg-[var(--status-warning)]/15 text-[var(--status-warning)]"
        >
          <Ruler className="size-4.5" />
        </motion.span>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Сначала внесите базовые значения</div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Договор требует определить базу <b>до момента реализации</b>: после
            того как фиксация откроет окно подтверждения эффекта, базовые
            значения изменению не подлежат — кроме исправления ошибки в
            исходных данных или соглашения Сторон. Без базы прирост не с чем
            сравнивать, и фиксация недоступна.
          </p>

          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={`/rec/${recId}/effect?form=baseEnter`}>
              Внести базовые значения
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
