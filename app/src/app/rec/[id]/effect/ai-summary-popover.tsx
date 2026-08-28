'use client';

/* Кнопка-иконка с ИИ-резюме расчёта эффекта — рядом с итоговой цифрой наверху
 * вкладки. Резюме не персистится (см. ai-summary-actions.ts): при первом
 * открытии поповера в этой сессии просмотра генерируется само, повторное
 * открытие показывает уже готовый текст без нового обращения к ИИ —
 * обновить можно явно, кнопкой-стрелкой рядом с заголовком. */

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Hint } from '@/components/ui/Hint';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { generateEffectSummary, type EffectSummaryState } from './ai-summary-actions';

export function ИИРезюме({ cardId }: { cardId: number }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<EffectSummaryState, FormData>(
    generateEffectSummary, undefined,
  );

  useEffect(() => {
    if (open && !state && !pending) startTransition(() => submit(запрос(cardId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint text="ИИ-резюме расчёта">
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon-xs">
            <Sparkles className="size-3.5" />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="flex h-80 w-96 flex-col p-4" align="end">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">ИИ-резюме расчёта</span>
          <Hint text="Сформировать заново">
            <Button variant="ghost" size="icon-xs" disabled={pending}
                    onClick={() => startTransition(() => submit(запрос(cardId)))}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
          </Hint>
        </div>

        {/* Фиксированная высота поповера легко переполняется даже коротким
            ответом ИИ — тело со своей прокруткой, а не растущий поповер,
            который на верхних карточках реестра упирался бы в край экрана. */}
        <div className="thin-scroll mt-3 flex-1 overflow-y-auto pr-1">
          {pending && !state?.text && (
            <p className="text-xs text-muted-foreground">Формируем резюме…</p>
          )}
          {state?.error && (
            <p className="text-xs text-destructive">{state.error}</p>
          )}
          {state?.text && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {state.text}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function запрос(cardId: number): FormData {
  const fd = new FormData();
  fd.set('cardId', String(cardId));
  return fd;
}
