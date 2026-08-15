/* Отдача вложения.
 *
 * Файл лежит в самой строке (миграция 006), поэтому маршрут читает его из
 * базы и отдаёт как есть. Всегда вложением, а не для показа в браузере: среди
 * вложений бывают HTML-выгрузки, и открывать чужой HTML на своём домене —
 * значит пускать чужой скрипт к сессии.
 */

import { currentUser } from '@/lib/session';
import { query } from '@/db/pool';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attId = Number(id);
  if (!Number.isFinite(attId)) return new Response('Bad id', { status: 400 });

  /* Вложения рекомендации видят обе стороны — внутренних файлов у модуля нет
     (то же правило, что и у реплик). Но неизвестному не отдаём ничего. */
  const user = await currentUser();
  if (!user) return new Response('Не авторизован', { status: 401 });

  const rows = await query<{ file_name: string; mime_type: string | null; content: Buffer | null }>(
    'SELECT file_name, mime_type, content FROM rec.attachments WHERE id = $1', [attId]);
  const файл = rows[0];
  if (!файл?.content) return new Response('Файл не найден', { status: 404 });

  return new Response(new Uint8Array(файл.content), {
    headers: {
      'Content-Type': файл.mime_type ?? 'application/octet-stream',
      /* Имя в кавычках и в UTF-8: русские имена файлов иначе приезжают
         вопросительными знаками. */
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(файл.file_name)}`,
      'Content-Length': String(файл.content.length),
    },
  });
}
