/* Данные для чек-листа в поповере фильтра колонки реестра — по запросу,
   а не заранее: у «Скважины» больше тысячи разных значений, тянуть их на
   каждое открытие страницы незачем. */

import { NextRequest, NextResponse } from 'next/server';
import { columnFacet, textFacet, type FilterColumn, type TextFacetColumn } from '@/db/recommendations';

const КОЛОНКИ: FilterColumn[] = [
  'field', 'direction', 'well', 'priority', 'executor', 'status', 'control', 'decision',
];
const ТЕКСТ_КОЛОНКИ: TextFacetColumn[] = ['number', 'problem'];

export async function GET(req: NextRequest) {
  const col = req.nextUrl.searchParams.get('col');
  const q = req.nextUrl.searchParams.get('q') ?? undefined;

  if (col && ТЕКСТ_КОЛОНКИ.includes(col as TextFacetColumn)) {
    const options = await textFacet(col as TextFacetColumn, q ?? '');
    return NextResponse.json({ options });
  }

  if (!col || !КОЛОНКИ.includes(col as FilterColumn)) {
    return NextResponse.json({ error: 'unknown column' }, { status: 400 });
  }

  const options = await columnFacet(col as FilterColumn, q);
  return NextResponse.json({ options });
}
