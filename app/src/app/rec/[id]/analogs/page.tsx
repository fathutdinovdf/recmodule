import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitCompareArrows } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { getCard } from '@/db/card';
import { listAnalogs, type AnalogRecommendation } from '@/db/recommendations';
import { дата } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCard(Number(id));
  if (!card) notFound();

  const аналоги = await listAnalogs(card.id);
  if (!аналоги.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><GitCompareArrows /></EmptyMedia>
          <EmptyTitle>Аналогов нет</EmptyTitle>
          <EmptyDescription>
            Рекомендаций по направлению «{card.direction}» на других скважинах пока нет.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="m-0 text-sm text-muted-foreground">
          Как ту же задачу решали на других скважинах — до пяти последних рекомендаций.
        </p>
        <Badge variant="secondary">{аналоги.length}</Badge>
      </div>

      <div className="flex flex-col gap-2">
        {аналоги.map((аналог) => <Строка key={аналог.id} аналог={аналог} />)}
      </div>
    </div>
  );
}

function Строка({ аналог }: { аналог: AnalogRecommendation }) {
  const полнота = аналог.completeness === 'full' ? 'реализовано полностью'
    : аналог.completeness === 'partial' ? 'реализовано частично' : '';

  return (
    <Link className="flex text-inherit no-underline" href={`/rec/${аналог.id}/summary`}>
      <Item variant="outline" className="w-full hover:bg-muted/50">
        <ItemContent>
          <ItemTitle className="flex flex-wrap items-center gap-2">
            <span>{аналог.number}</span>
            <span className="font-normal text-muted-foreground">
              скважина {аналог.wellNumber} · {аналог.fieldName}
            </span>
          </ItemTitle>
          <ItemDescription>{аналог.problem}</ItemDescription>
        </ItemContent>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <span>{дата(аналог.registeredAt)}</span>
          <span className="flex items-center gap-1.5">
            <i className={`status__d status__d--${аналог.tone} ${аналог.filled ? '' : 'is-hollow'}`} />
            {аналог.statusName}{полнота ? `, ${полнота}` : ''}
          </span>
        </div>
      </Item>
    </Link>
  );
}
