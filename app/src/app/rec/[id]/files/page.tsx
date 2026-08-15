/* Вкладка «Файлы»: единая витрина вложений рекомендации.
 *
 * Загрузки здесь нет намеренно. Файл должен появляться там, где понятна его
 * роль: в обосновании, решении, фиксации реализации или реплике. Эта вкладка
 * только собирает материалы вместе и не отрывает их от исходного контекста.
 */

import { notFound } from 'next/navigation';
import { Download, Paperclip } from 'lucide-react';
import { getCard } from '@/db/card';
import { getRecommendationFiles, type RecommendationFile } from '@/db/files';
import { дата } from '@/lib/format';
import {
  Attachment, AttachmentActions, AttachmentContent, AttachmentDescription,
  AttachmentMedia, AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { ИконкаФайла, типФайла } from '../log/file-icon';

export const dynamic = 'force-dynamic';

const КОНТЕКСТ: Record<string, string> = {
  recommendation: 'Обоснование рекомендации',
  decision: 'Решение Заказчика',
  implementation: 'Фиксация реализации',
  comment: 'Обсуждение',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCard(Number(id));
  if (!card) notFound();

  const файлы = await getRecommendationFiles(card.id);
  if (!файлы.length) return <Пусто />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="m-0 text-sm text-muted-foreground">
          Все материалы рекомендации — вместе с местом, где файл был приложен.
        </p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {файлы.length} {склонитьФайл(файлы.length)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {файлы.map((файл) => <СтрокаФайла key={файл.id} файл={файл} />)}
      </div>
    </div>
  );
}

function СтрокаФайла({ файл }: { файл: RecommendationFile }) {
  const контекст = КОНТЕКСТ[файл.context] ?? 'Материалы рекомендации';
  const детали = [
    типФайла(файл.fileName),
    размер(файл.sizeBytes),
    файл.uploadedBy,
    дата(файл.uploadedAt, true),
  ].filter(Boolean).join(' · ');

  return (
    <div className="relative min-w-0">
      <Attachment className="w-full flex-nowrap border-[var(--border-divider-light)]" size="default">
        <AttachmentMedia><ИконкаФайла имя={файл.fileName} /></AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{файл.fileName}</AttachmentTitle>
          <AttachmentDescription>{детали}</AttachmentDescription>
          {файл.context === 'comment' && файл.commentText && (
            <span className="mt-1 block truncate text-xs text-muted-foreground/80">
              «{файл.commentText}»
            </span>
          )}
        </AttachmentContent>
        <Badge variant="secondary" className="max-w-48 shrink truncate">{контекст}</Badge>
        <AttachmentActions aria-hidden="true">
          <Download className="size-4 text-muted-foreground" />
        </AttachmentActions>
      </Attachment>
      <AttachmentTrigger asChild>
        <a href={`/api/attachment/${файл.id}`} aria-label={`Скачать ${файл.fileName}`} />
      </AttachmentTrigger>
    </div>
  );
}

function Пусто() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Paperclip /></EmptyMedia>
        <EmptyTitle>Вложений нет</EmptyTitle>
        <EmptyDescription>
          Файлы появятся здесь, когда их приложат к рекомендации, реализации или обсуждению.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function размер(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

function склонитьФайл(n: number): string {
  const сотня = n % 100;
  const десяток = n % 10;
  if (сотня >= 11 && сотня <= 14) return 'файлов';
  if (десяток === 1) return 'файл';
  if (десяток >= 2 && десяток <= 4) return 'файла';
  return 'файлов';
}
