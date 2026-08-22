/* Заявки о проблемах модуля — кнопка «Сообщить о проблеме» в подвале навигации. */

import { query, transaction } from './pool';

export interface ВложениеЗаявки {
  id: number;
  fileName: string;
  sizeBytes: number | null;
}

export interface ЗаявкаОПроблеме {
  id: number;
  page: string;
  text: string;
  createdAt: Date;
  authorName: string;
  authorPosition: string | null;
  attachments: ВложениеЗаявки[];
}

export async function создатьЗаявкуОПроблеме(
  userId: number, page: string, text: string, files: File[],
): Promise<void> {
  await transaction(async (client) => {
    const { rows: [заявка] } = await client.query<{ id: string }>(
      'INSERT INTO rec.problem_reports (user_id, page, text) VALUES ($1,$2,$3) RETURNING id',
      [userId, page, text]);

    for (const f of files) {
      const байты = Buffer.from(await f.arrayBuffer());
      await client.query(`
        INSERT INTO rec.attachments
          (problem_report_id, file_name, mime_type, size_bytes, uploaded_by, context, content)
        VALUES ($1,$2,$3,$4,$5,'problem_report',$6)
      `, [заявка.id, f.name, f.type || null, f.size, userId, байты]);
    }
  });
}

export async function заявкиОПроблемах(): Promise<ЗаявкаОПроблеме[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT p.id, p.page, p.text, p.created_at, u.full_name, u.position,
           COALESCE(
             (SELECT json_agg(json_build_object('id', a.id, 'fileName', a.file_name, 'sizeBytes', a.size_bytes)
                               ORDER BY a.id)
                FROM rec.attachments a WHERE a.problem_report_id = p.id),
             '[]'
           ) AS attachments
      FROM rec.problem_reports p JOIN rec.users u ON u.id = p.user_id
     ORDER BY p.created_at DESC`);

  return rows.map((r) => ({
    id: Number(r.id),
    page: r.page as string,
    text: r.text as string,
    createdAt: r.created_at as Date,
    authorName: r.full_name as string,
    authorPosition: r.position as string | null,
    attachments: (r.attachments as { id: number; fileName: string; sizeBytes: number | null }[])
      .map((a) => ({ id: Number(a.id), fileName: a.fileName, sizeBytes: a.sizeBytes })),
  }));
}
