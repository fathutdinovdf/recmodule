/* Приём реплики: текст, упоминания и вложения.
 *
 * Маршрутом, а не серверным действием: файл заливается XHR-ом ради честного
 * прогресса, а серверное действие прогресса не отдаёт. Ответ — готовая
 * реплика: клиент подменяет ею временную запись, нарисованную сразу после
 * нажатия, и лента не перезагружается.
 *
 * Единственное действие модуля, которое ничего не меняет в процессе: реплика
 * не двигает статус и не порождает обязательств. Уточнение по-прежнему
 * запрашивается решением Заказчика, а не сообщением в ленте, — иначе норматив
 * ответа считался бы от того, что стороны между собой обсуждали. Поэтому здесь
 * нет и события в `rec.recommendation_events`: событие означает шаг процесса, а
 * реплика попадает в ленту сама, из `rec.comments`.
 */

import { transaction } from '@/db/pool';
import { getComment } from '@/db/log';
import { insertCommentNotifications } from '@/db/notifications';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ПРЕДЕЛ_ТЕКСТА = 4000;
/* Файл живёт в самой строке базы (миграция 006). Предел нужен не из-за
   формата, а из-за бэкапа: выгрузка тренда на сотню мегабайт утащит за собой
   всю базу. Десяти хватает на расчёт, снимок экрана и выгрузку за месяц. */
const ПРЕДЕЛ_ФАЙЛА = 10 * 1024 * 1024;
const ПРЕДЕЛ_ФАЙЛОВ = 5;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recId = Number(id);
  if (!Number.isFinite(recId)) return Response.json({ error: 'Неверный адрес' }, { status: 400 });

  const user = await currentUser();
  if (!user) return Response.json({ error: 'Пользователь не определён' }, { status: 401 });

  const form = await req.formData();
  const текст = String(form.get('text') ?? '').trim().slice(0, ПРЕДЕЛ_ТЕКСТА);
  const файлы = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const упомянуты = form.getAll('mentions')
    .map((v) => Number(v)).filter((n) => Number.isFinite(n));

  /* Реплика без текста, но с файлом — нормальный случай: «вот выгрузка».
     Пустая целиком — нет. */
  if (!текст && !файлы.length) {
    return Response.json({ error: 'Пустая реплика' }, { status: 400 });
  }
  if (файлы.length > ПРЕДЕЛ_ФАЙЛОВ) {
    return Response.json({ error: `За раз не больше ${ПРЕДЕЛ_ФАЙЛОВ} файлов` }, { status: 400 });
  }
  for (const f of файлы) {
    if (f.size > ПРЕДЕЛ_ФАЙЛА) {
      return Response.json(
        { error: `Файл «${f.name}» больше 10 МБ` }, { status: 413 });
    }
  }

  const commentId = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string; status: string }>(`
      SELECT id, status FROM rec.recommendations WHERE id = $1 FOR SHARE
    `, [recId]);
    if (!rows[0]) throw new Error('нет такой рекомендации');
    if (rows[0].status === 'draft') throw new Error('черновик не обсуждается');

    const { rows: [реплика] } = await client.query<{ id: string }>(`
      INSERT INTO rec.comments (rec_id, author_id, author_name, text)
      VALUES ($1,$2,$3,$4) RETURNING id
    `, [recId, user.id, user.fullName, текст]);

    /* Упомянутых присылает клиент списком номеров, но verify всё равно нужен:
       номер мог прийти любой. Берём только активных — упоминание уволенного
       никого не оповестит и в ленте выглядело бы обещанием, которого не будет. */
    if (упомянуты.length) {
      await client.query(`
        INSERT INTO rec.comment_mentions (comment_id, user_id)
        SELECT $1, u.id FROM rec.users u WHERE u.id = ANY($2::bigint[]) AND u.is_active
        ON CONFLICT DO NOTHING
      `, [реплика.id, упомянуты]);
    }

    await insertCommentNotifications(client, {
      recId, commentId: Number(реплика.id), authorId: user.id, authorName: user.fullName,
      text: текст, mentionedUserIds: упомянуты,
    });

    for (const f of файлы) {
      const байты = Buffer.from(await f.arrayBuffer());
      await client.query(`
        INSERT INTO rec.attachments
          (rec_id, comment_id, file_name, mime_type, size_bytes, uploaded_by, context, content)
        VALUES ($1,$2,$3,$4,$5,$6,'comment',$7)
      `, [recId, реплика.id, f.name, f.type || null, f.size, user.id, байты]);
    }

    return Number(реплика.id);
  });

  /* Отдаём ровно то же, что уйдёт в живую ленту другим: один формат записи на
     оба пути, иначе своя реплика и чужая выглядели бы по-разному. */
  const запись = await getComment(commentId, user.id);
  return Response.json(запись ? { ...запись, at: запись.at.toISOString() } : null);
}
