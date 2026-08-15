/* Формы действий из меню в шапке карточки.
 *
 * Открываются окном поверх карточки, а не блоком на вкладке: действие
 * необратимо, и между «нажал в меню» и «сделано» должен стоять экран, с
 * которого видно, что именно произойдёт. Окно ещё и не спорит с содержимым
 * вкладки за место — отмена рекомендации к сводке отношения не имеет, она
 * просто оттуда запускается.
 *
 * Окно несёт заголовок, поля и кнопки — и ничего больше. Пояснения и строка
 * фактов (номер, статус, остаток норматива) убраны по решению пользователя:
 * всё это стоит в самой карточке, из-под окна, и в окне читалось повтором.
 *
 * Открытость живёт в адресе (`?form=...`), а не в состоянии: подтверждение
 * переживает перезагрузку, а ошибка возвращается тем же адресом.
 *
 * Форма показывается на своём статусе. Пришёл по ссылке на чужом — значит,
 * статус успел смениться в другой вкладке; тогда не показывается ничего, а не
 * форма, которая всё равно упадёт на проверке.
 */

import type { Card } from '@/db/card';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { окно } from '../form-meta';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Textarea } from '@/components/ui/Textarea';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  зарегистрировать, удалить, отменить, передатьПовторно, создатьНаОснове,
} from '../lifecycle';

export type ЖизненнаяФорма = 'register' | 'delete' | 'cancel' | 'resend' | 'copy';

export const ЖИЗНЕННЫЕ_ФОРМЫ: ЖизненнаяФорма[] = ['register', 'delete', 'cancel', 'resend', 'copy'];

/** На каких статусах действие вообще возможно — тот же список, что в операциях. */
const СТАТУСЫ: Record<ЖизненнаяФорма, string[]> = {
  register: ['draft'],
  delete: ['draft'],
  cancel: ['registered', 'sent', 'review', 'clarify'],
  resend: ['clarify'],
  copy: ['rejected', 'cancelled'],
};

export function ФормаДействия({ card, вид, ошибка }: {
  card: Card;
  вид: ЖизненнаяФорма;
  ошибка?: string;
}) {
  if (!СТАТУСЫ[вид].includes(card.status)) return null;

  if (вид === 'register') {
    return (
      <ActionDialog {...окно('register')}>
        <form action={зарегистрировать.bind(null, card.id)}>
          {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
          <DialogFooter>
            <SubmitButton pendingText="Регистрирую…">Зарегистрировать и передать</SubmitButton>
            <Отмена />
          </DialogFooter>
        </form>
      </ActionDialog>
    );
  }

  if (вид === 'delete') {
    return (
      <ActionDialog {...окно('delete')}>
        <form action={удалить.bind(null, card.id)}>
          {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
          <DialogFooter>
            <SubmitButton variant="destructive" pendingText="Удаляю…">Удалить черновик</SubmitButton>
            <Отмена />
          </DialogFooter>
        </form>
      </ActionDialog>
    );
  }

  if (вид === 'cancel') {
    return (
      <ActionDialog {...окно('cancel')}>
        <form action={отменить.bind(null, card.id)}>
          <Field data-invalid={Boolean(ошибка)}>
            <FieldLabel htmlFor="cancel-reason">
              Причина отмены <span className="text-muted-foreground">обязательно</span>
            </FieldLabel>
            <Textarea id="cancel-reason" name="text" rows={3} aria-invalid={Boolean(ошибка)}
                      placeholder="Скважина выведена в ремонт" />
            {ошибка && <FieldError>{ошибка}</FieldError>}
          </Field>
          <DialogFooter className="mt-4">
            <SubmitButton variant="destructive" pendingText="Отменяю…">Отменить рекомендацию</SubmitButton>
            <Отмена />
          </DialogFooter>
        </form>
      </ActionDialog>
    );
  }

  if (вид === 'resend') {
    return (
      <ActionDialog {...окно('resend')}>
        <form action={передатьПовторно.bind(null, card.id)}>
          <Field data-invalid={Boolean(ошибка)}>
            <FieldLabel htmlFor="resend-text">
              Уточнение <span className="text-muted-foreground">обязательно</span>
            </FieldLabel>
            <Textarea id="resend-text" name="text" rows={4} aria-invalid={Boolean(ошибка)}
                      placeholder={card.decision?.kind === 'clarify' && card.decision.comment
                        ? `Ответ на вопрос Заказчика: ${card.decision.comment}`
                        : 'Что уточнено по сравнению с первой редакцией'} />
            {ошибка && <FieldError>{ошибка}</FieldError>}
          </Field>
          <DialogFooter className="mt-4">
            <SubmitButton pendingText="Передаю…">Передать Заказчику</SubmitButton>
            <Отмена />
          </DialogFooter>
        </form>
      </ActionDialog>
    );
  }

  return (
    <ActionDialog {...окно('copy')}>
      <form action={создатьНаОснове.bind(null, card.id)}>
        {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
        <DialogFooter>
          <SubmitButton pendingText="Создаю…">Создать черновик</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

/* Отмена — штатное закрытие окна средствами Radix, а не ссылка: так одинаково
   работают и кнопка, и Esc, и клик мимо окна. */
function Отмена() {
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline">Отмена</Button>
    </DialogClose>
  );
}
