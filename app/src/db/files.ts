/* Все файлы рекомендации независимо от места, где их приложили.
 *
 * Вкладка «Файлы» — не второе хранилище и не отдельный способ загрузки. Она
 * собирает материалы рекомендации, решения, реализации и обсуждения в одном
 * месте, но сохраняет контекст каждого файла: без него выгрузка тренда рядом
 * с решением Заказчика выглядела бы просто случайным документом.
 */

import { query } from './pool';

export interface RecommendationFile {
  id: number;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: Date;
  uploadedBy: string | null;
  context: string;
  commentId: number | null;
  commentText: string | null;
}

export async function getRecommendationFiles(recId: number): Promise<RecommendationFile[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT a.id, a.file_name, a.mime_type, a.size_bytes, a.uploaded_at,
           u.full_name AS uploaded_by, a.context, a.comment_id, c.text AS comment_text
      FROM rec.attachments a
      LEFT JOIN rec.users u ON u.id = a.uploaded_by
      LEFT JOIN rec.comments c ON c.id = a.comment_id AND c.deleted_at IS NULL
     WHERE a.rec_id = $1
     ORDER BY a.uploaded_at DESC, a.id DESC
  `, [recId]);

  return rows.map((r) => ({
    id: Number(r.id),
    fileName: r.file_name as string,
    mimeType: r.mime_type as string | null,
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    uploadedAt: r.uploaded_at as Date,
    uploadedBy: r.uploaded_by as string | null,
    context: r.context as string,
    commentId: r.comment_id === null ? null : Number(r.comment_id),
    commentText: r.comment_text as string | null,
  }));
}
