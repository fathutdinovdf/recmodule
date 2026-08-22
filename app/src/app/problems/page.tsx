/* Экран «Обратная связь» — список того, что прислали кнопкой «Обратная связь»
 * в подвале навигации: проблемы, идеи и рекомендации по модулю вперемешку,
 * без отдельной формы под каждый жанр (см. комментарий у КнопкаПроблемы в
 * AppChrome.tsx).
 *
 * Лента, а не таблица: содержимое — свободный текст переменной длины, и
 * ужимать его в ячейку строкой значило бы обрезать самую суть заявки.
 * Тот же выбор, что у вкладки «Файлы» рекомендации (files/page.tsx) — тоже
 * список карточек по свободной высоте, а не таблица.
 *
 * Отметки «решено» здесь нет: попросили только увидеть заявки, и заводить
 * состояние без этого запроса — значит придумывать за администратора рабочий
 * процесс, которого он не просил.
 */

import { redirect } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { currentUser } from '@/lib/session';
import { заявкиОПроблемах } from '@/db/problem-reports';
import { дата } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  Attachment, AttachmentContent, AttachmentDescription, AttachmentMedia,
  AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ИконкаФайла } from '@/app/rec/[id]/log/file-icon';
import { размер } from '@/app/rec/[id]/log/format';
import './problems.css';

export const dynamic = 'force-dynamic';

const инициалы = (имя: string) => {
  const части = имя.split(' ');
  return ((части[0]?.[0] ?? '') + (части[1]?.[0] ?? '')).toUpperCase();
};

export default async function ProblemsPage() {
  const я = await currentUser();
  /* Тот же приём, что на /users: у экрана нет «меньше кнопок» для чужой
     роли — показывать чужие заявки о модуле некому, кроме того, кто их
     разбирает. */
  if (я?.role !== 'admin') redirect('/');

  const заявки = await заявкиОПроблемах();

  return (
    <main className="content">
      <div className="pagehead">
        <h1>Обратная связь</h1>
        <span className="pagehead__zone">всего <b>{заявки.length}</b></span>
      </div>

      {заявки.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
            <EmptyTitle>Заявок нет</EmptyTitle>
            <EmptyDescription>
              Кнопка «Сообщить о проблеме» есть у Исполнителя и администратора в подвале навигации.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="preports">
          {заявки.map((з) => (
            <article className="preport panel" key={з.id}>
              <header className="preport__head">
                <span className="preport__ava">{инициалы(з.authorName)}</span>
                <div className="preport__who">
                  <span className="preport__name">{з.authorName}</span>
                  <span className="preport__sub">
                    {з.authorPosition ?? 'должность не указана'} · {дата(з.createdAt, true)}
                  </span>
                </div>
                <Badge variant="secondary" className="preport__page" title={з.page}>{з.page}</Badge>
              </header>

              <p className="preport__text">{з.text}</p>

              {з.attachments.length > 0 && (
                <div className="preport__files">
                  {з.attachments.map((ф) => (
                    <div key={ф.id} className="relative min-w-0">
                      <Attachment size="sm" className="max-w-full flex-nowrap border-[var(--border-divider-light)]">
                        <AttachmentMedia><ИконкаФайла имя={ф.fileName} /></AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle>{ф.fileName}</AttachmentTitle>
                          <AttachmentDescription>{размер(ф.sizeBytes)}</AttachmentDescription>
                        </AttachmentContent>
                      </Attachment>
                      <AttachmentTrigger asChild>
                        <a href={`/api/attachment/${ф.id}`} aria-label={`Скачать ${ф.fileName}`} />
                      </AttachmentTrigger>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
