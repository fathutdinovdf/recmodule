import { NextResponse } from 'next/server';
import { measuredBaseline } from '@/services/baseline';
import { BASELINE_DAYS } from '@/domain/baseline';

export async function GET(request: Request) {
  const wellId = Number(new URL(request.url).searchParams.get('wellId'));
  if (!Number.isInteger(wellId) || wellId <= 0) {
    return NextResponse.json({ error: 'Некорректная скважина.' }, { status: 400 });
  }

  try {
    const baseline = await measuredBaseline({ wellId, until: new Date() });
    return NextResponse.json({
      baseQzh: baseline.baseQzh,
      baseQn: baseline.baseQn,
      periodFrom: baseline.periodFrom.toISOString(),
      periodTo: baseline.periodTo.toISOString(),
      usedDays: baseline.usedDays,
      requestedDays: BASELINE_DAYS,
    });
  } catch {
    return NextResponse.json({ error: 'Стенд ВМАП не ответил.' }, { status: 503 });
  }
}
