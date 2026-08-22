'use client';

/* Колокольчик — глобальный центр уведомлений, один список на все
 * рекомендации сразу (не про одну открытую карточку).
 *
 * Список один для всех ролей: разница в том, что кому в него попадает
 * (получатели считаются в db/notifications.ts), а не в устройстве самой
 * панели — своей цветовой семантики или отдельного вида под роль здесь нет,
 * как и для кружка статуса в другом месте модуля.
 *
 * Хронология без пересортировки по «прочитано»: непрочитанное подсвечено
 * заливкой и точкой, но не всплывает наверх — так проще читать плотную
 * ленту, не гадая, почему знакомая запись вдруг сдвинулась.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AtSign, BadgeCheck, MessageSquare } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Hint } from '@/components/ui/Hint';
import { отметитьВсеУведомления, отметитьУведомление } from '@/lib/notification-actions';
import { ключДня, подписьДня, времяДня } from '@/app/rec/[id]/log/format';
import type { NotificationType } from '@/db/notifications';

export interface УведомлениеПропс {
  id: number;
  recId: number;
  recNumber: string | null;
  wellNumber: string | null;
  type: NotificationType;
  actorName: string;
  text: string | null;
  createdAt: string;
  readAt: string | null;
}

const ИКОНКА: Record<NotificationType, typeof AtSign> = {
  mention: AtSign,
  comment: MessageSquare,
  status_change: BadgeCheck,
};

function обрезать(текст: string, предел = 80): string {
  const t = текст.trim();
  return t.length > предел ? `${t.slice(0, предел)}…` : t;
}

function строка(n: УведомлениеПропс): string {
  if (n.type === 'mention') return `${n.actorName} упомянул(а) вас: «${обрезать(n.text ?? '')}»`;
  if (n.type === 'comment') return `${n.actorName} ответил(а) в обсуждении рекомендации`;
  return n.text ?? 'Статус рекомендации изменился';
}

export function NotificationBell({ уведомления }: { уведомления: УведомлениеПропс[] }) {
  const router = useRouter();
  const [, начать] = useTransition();
  const непрочитано = уведомления.filter((n) => !n.readAt).length;
  const сейчас = new Date();

  /* Сутки — та же группировка, что в ленте обсуждения: «когда» отвечает
     заголовок дня, а не штамп у каждой записи. */
  const группы = new Map<string, { label: string; items: УведомлениеПропс[] }>();
  for (const n of уведомления) {
    const at = new Date(n.createdAt);
    const key = ключДня(at);
    if (!группы.has(key)) группы.set(key, { label: подписьДня(at, сейчас), items: [] });
    группы.get(key)!.items.push(n);
  }

  return (
    <Popover>
      <Hint text="Уведомления">
        <PopoverTrigger asChild>
          <button className="iconbtn iconbtn--lg" type="button" aria-label="Уведомления">
            <span className="icstack ic20">
              <svg className="ic20 bell__dome" aria-hidden="true"><use href="#i-bell-dome" /></svg>
              <svg className="ic20 bell__clap" aria-hidden="true"><use href="#i-bell-clap" /></svg>
            </span>
            {непрочитано > 0 && (
              <span className="badge badge--accent" aria-hidden="true"
                    style={{ position: 'absolute', top: -3, right: -3, pointerEvents: 'none' }}>
                {непрочитано > 99 ? '99+' : непрочитано}
              </span>
            )}
          </button>
        </PopoverTrigger>
      </Hint>

      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium text-foreground">Уведомления</span>
          {непрочитано > 0 && (
            <button type="button" className="text-xs text-[var(--text-accent)] hover:underline"
                    onClick={() => начать(async () => { await отметитьВсеУведомления(); router.refresh(); })}>
              Прочитать всё
            </button>
          )}
        </div>

        {уведомления.length === 0 ? (
          <Empty className="border-0 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon"><BadgeCheck /></EmptyMedia>
              <EmptyTitle>Пока нет уведомлений</EmptyTitle>
              <EmptyDescription>Здесь появятся упоминания, ответы и смены статуса по рекомендациям.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {[...группы.values()].map((г) => (
              <div key={г.label}>
                <div className="px-4 pb-1 pt-2 text-xs text-muted-foreground">{г.label}</div>
                {г.items.map((n) => {
                  const Icon = ИКОНКА[n.type];
                  const непрочитанная = !n.readAt;
                  return (
                    <Link key={n.id} href={`/rec/${n.recId}/log`}
                          className="flex gap-2.5 px-4 py-2.5 no-underline hover:bg-[var(--state-hover)]"
                          style={{ background: непрочитанная ? 'var(--component-accent-secondary)' : undefined }}
                          onClick={() => { if (непрочитанная) начать(() => отметитьУведомление(n.id)); }}>
                      <Icon className="mt-0.5 size-4 shrink-0 text-[var(--icon-default)]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-snug text-foreground">{строка(n)}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {n.wellNumber && <>скв. {n.wellNumber} · </>}
                          {n.recNumber ? `№${n.recNumber}` : `рекомендация ${n.recId}`} · {времяДня(new Date(n.createdAt))}
                        </div>
                      </div>
                      {непрочитанная && (
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: 'var(--component-accent)' }} />
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
