import { NextResponse } from 'next/server';
import { listRegistrationWells } from '@/db/wells-data';

export async function GET() {
  try {
    const wells = await listRegistrationWells();
    return NextResponse.json(wells, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch {
    return NextResponse.json({ error: 'Стенд ВМАП не ответил.' }, { status: 503 });
  }
}
