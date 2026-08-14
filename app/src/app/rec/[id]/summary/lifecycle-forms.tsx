/* Формы действий из меню в шапке карточки.
 *
 * Открываются окном поверх карточки, а не блоком на вкладке: действие
 * необратимо, и между «нажал в меню» и «сделано» должен стоять экран, с
 * которого видно, что именно произойдёт. Окно ещё и не спорит с содержимым
 * вкладки за место — отмена рекомендации к сводке отношения не имеет, она
 * просто оттуда запускается.
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
import { Button } from '@/components/ui/Button';
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
      <ActionDialog
        title="Зарегистрировать рекомендацию"
        description={`Черновик получит номер по месторождению и уйдёт Заказчику. Норматив ответа
          отсчитывается от передачи и только внутри рабочего окна: выпущенная вечером пятницы
          рекомендация ждёт утра понедельника, и до передачи срок не идёт.`}
      >
        <form action={зарегистрировать.bind(null, card.id)}>
          {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
          <DialogFooter>
            <Button type="submit">Зарегистрировать и передать</Button>
            <Отмена />
          </DialogFooter>
        </form>
      </ActionDialog>
    );
  }

  if (вид === 'delete') {
    return (
      <ActionDialog
        title="Удалить черновик"
        description={`Черновик исчезнет из реестра. Удаление мягкое — запись остаётся в базе, — но
          вернуть её из интерфейса будет нельзя. Номера у черновика нет, в отчётность он не
          попадал, поэтому следов удаление не оставляет.`}
      >
        <form action={удалить.bind(null, card.id)}>
          {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
          <DialogFooter>
            <Button type="submit" variant="destructive">Удалить черновик</Button>
            <Отмена />
          </DialogFooter>
        </form>
      </ActionDialog>
    );
  }

  if (вид === 'cancel') {
    return (
      <ActionDialog
        title="Отменить рекомендацию"
        description={`Рекомендация ${card.number ?? ''} перейдёт в «Отменено»: решения Заказчика по
          ней не будет, срок ответа снимется. Номер и история сохраняются — отмена видна в
          отчётности, поэтому причина обязательна.`}
      >
        <form action={отменить.bind(null, card.id)}>
          <Field data-invalid={Boolean(ошибка)}>
            <FieldLabel htmlFor="cancel-reason">
              Причина отмены <span className="text-muted-foreground">обязательно</span>
            </FieldLabel>
            <Textarea id="cancel-reason" name="text" rows={3} aria-invalid={Boolean(ошибка)}
                      placeholder="Например: скважина выведена в ремонт, мероприятие потеряло смысл." />
            {ошибка && <FieldError>{ошибка}</FieldError>}
          </Field>
          <DialogFooter className="mt-4">
            <Button type="submit" variant="destructive">Отменить рекомендацию</Button>
            <Отмена />
          </DialogFooter>
        </form>
      </ActionDialog>
    );
  }

  if (вид === 'resend') {
    return (
      <ActionDialog
        title="Внести уточнение и передать"
        description={`Уточнение попадёт в обсуждение рекомендации, а сама она вернётся Заказчику под
          тем же номером. Норматив продолжится с остатка${
          card.slaHoursLeft !== null ? ` — осталось ${card.slaHoursLeft} ч` : ''}, а не начнётся
          заново: так по редакции договора от 30.07.2026.`}
      >
        <form action={передатьПовторно.bind(null, card.id)}>
          <Field data-invalid={Boolean(ошибка)}>
            <FieldLabel htmlFor="resend-text">
              Уточнение <span className="text-muted-foreground">обязательно</span>
            </FieldLabel>
            <Textarea id="resend-text" name="text" rows={4} aria-invalid={Boolean(ошибка)}
                      placeholder={card.decision?.kind === 'clarify' && card.decision.comment
                        ? `Ответ на вопрос Заказчика: ${card.decision.comment}`
                        : 'Что уточнено по сравнению с первой редакцией.'} />
            {ошибка && <FieldError>{ошибка}</FieldError>}
          </Field>
          <DialogFooter className="mt-4">
            <Button type="submit">Передать Заказчику</Button>
            <Отмена />
          </DialogFooter>
        </form>
      </ActionDialog>
    );
  }

  return (
    <ActionDialog
      title="Создать новую на основе этой"
      description={`Появится черновик с тем же объектом, содержанием и ожидаемым результатом — без
        номера, решений и базы: он пойдёт свой круг. Исходная рекомендация
        ${card.status === 'rejected' ? 'останется отклонённой' : 'останется отменённой'},
        связь между ними сохранится в истории обеих.`}
    >
      <form action={создатьНаОснове.bind(null, card.id)}>
        {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
        <DialogFooter>
          <Button type="submit">Создать черновик</Button>
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
