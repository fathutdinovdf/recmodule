'use server';

import { redirect } from 'next/navigation';
import { transaction } from '@/db/pool';
import { currentUser } from '@/lib/session';
import { registrationAnalogs, type RegistrationAnalog } from '@/db/registration';
import { зарегистрировать } from '@/app/rec/[id]/lifecycle';
import { getRegistrationWell } from '@/db/vmap';

export interface RegistrationActionState {
  error?: string;
  analogs?: Array<Omit<RegistrationAnalog, 'registeredAt'> & { registeredAt: string }>;
  analogFingerprint?: string;
}

const LIMIT = 10 * 1024 * 1024;

const строка = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const число = (form: FormData, key: string) => {
  const value = строка(form, key).replace(',', '.');
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function сохранитьРекомендацию(
  _state: RegistrationActionState,
  form: FormData,
): Promise<RegistrationActionState> {
  const user = await currentUser();
  if (!user || user.side !== 'executor') {
    return { error: 'Создавать рекомендации может только Исполнитель.' };
  }

  const intent = строка(form, 'intent') === 'register' ? 'register' : 'draft';
  const wellId = Number(строка(form, 'wellId'));
  const well = await getRegistrationWell(wellId);
  if (!well) return { error: 'Выберите скважину из списка ВМАП.' };

  const directionId = Number(строка(form, 'directionId'));
  const priority = строка(form, 'priority');
  const problem = строка(form, 'problem');
  const action = строка(form, 'action');
  const rationale = строка(form, 'rationale');
  const executorId = Number(строка(form, 'executorId'));
  const expectQzh = число(form, 'expectQzh');
  const expectQn = число(form, 'expectQn');
  const expectEe = число(form, 'expectEe');
  const baselineSource = строка(form, 'baselineSource') === 'manual' ? 'manual' : 'measured';
  const baseQzh = число(form, 'baseQzh');
  const baseQn = число(form, 'baseQn');
  const baseEe = число(form, 'baseEe');
  const baselineNote = строка(form, 'baselineNote');
  const resultNote = строка(form, 'resultNote');
  const comment = строка(form, 'comment');

  if (!Number.isInteger(directionId) || directionId <= 0) return { error: 'Выберите направление.' };
  if (!problem) return { error: 'Опишите проблему или отклонение.' };
  if (!action) return { error: 'Сформулируйте рекомендуемое мероприятие.' };

  if (intent === 'register') {
    if (!priority) return { error: 'Выберите приоритет.' };
    if (!rationale) return { error: 'Добавьте технологическое обоснование.' };
    if (!Number.isInteger(executorId) || executorId <= 0) return { error: 'Выберите ответственного Исполнителя.' };
    if (expectQzh === null || expectQn === null || expectEe === null) {
      return { error: 'Для регистрации заполните все три показателя ожидаемого результата.' };
    }
  }
  if (baselineSource === 'manual' && (baseQzh === null || baseQn === null || !baselineNote)) {
    return { error: 'Для ручной базы заполните дебиты жидкости и нефти и объясните замену расчёта по замерам.' };
  }

  let analogsSeen = 0;
  if (intent === 'register') {
    const analogs = await registrationAnalogs(wellId, directionId);
    analogsSeen = analogs.length;
    const fingerprint = analogs.map((item) => item.id).sort((a, b) => a - b).join(':');
    const подтверждено = строка(form, 'duplicatesConfirmed') === 'yes'
      && строка(form, 'duplicatesFingerprint') === fingerprint;
    if (analogs.length && !подтверждено) {
      return {
        error: 'По скважине и направлению найдены аналоги. Подтвердите, что это отдельное мероприятие.',
        analogFingerprint: fingerprint,
        analogs: analogs.map((item) => ({
          ...item, registeredAt: item.registeredAt.toISOString(),
        })),
      };
    }
  }

  const files = form.getAll('attachments').filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > 5) return { error: 'К рекомендации можно приложить не больше пяти файлов.' };
  if (files.some((file) => file.size > LIMIT)) return { error: 'Размер каждого файла не должен превышать 10 МБ.' };

  const recId = await transaction(async (client) => {
    const [{ ok: directionOk }, { ok: priorityOk }, { ok: executorOk }] = await Promise.all([
      client.query<{ ok: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM rec.directions WHERE id = $1 AND archived_at IS NULL) AS ok
      `, [directionId]).then((r) => r.rows[0]),
      client.query<{ ok: boolean }>(`
        SELECT $1::text = '' OR EXISTS (SELECT 1 FROM rec.priorities WHERE code = $1) AS ok
      `, [priority]).then((r) => r.rows[0]),
      client.query<{ ok: boolean }>(`
        SELECT $1::bigint = 0 OR EXISTS (SELECT 1 FROM rec.users WHERE id = $1 AND side = 'executor' AND is_active) AS ok
      `, [Number.isInteger(executorId) ? executorId : 0]).then((r) => r.rows[0]),
    ]);
    if (!directionOk || !priorityOk || !executorOk) throw new Error('Справочники изменились. Обновите мастер и повторите действие.');

    const result = await client.query<{ id: string }>(`
      INSERT INTO rec.recommendations
        (status, direction_id, priority, well_id, well_number, kust,
         field_id, field_name, problem, action, rationale,
         expect_qzh, expect_qn, expect_ee, author_id, executor_id)
      VALUES ('draft',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id::text
    `, [directionId, priority, well.wellId, well.number, well.kust,
      well.fieldId, well.fieldName, problem, action, rationale,
      expectQzh, expectQn, expectEe, user.id,
      Number.isInteger(executorId) && executorId > 0 ? executorId : null]);
    const id = Number(result.rows[0].id);

    if (baselineSource === 'manual') {
      await client.query(`
        INSERT INTO rec.baselines
          (rec_id, base_qzh, base_qn, base_ee, source, status,
           created_by, author_name, note)
        VALUES ($1,$2,$3,$4,'manual','accepted',$5,$6,$7)
      `, [id, baseQzh, baseQn, baseEe, user.id, user.fullName, baselineNote]);
    }

    for (const text of [
      resultNote ? `Пояснение к ожидаемому результату: ${resultNote}` : '',
      comment,
    ].filter(Boolean)) {
      await client.query(`
        INSERT INTO rec.comments (rec_id, author_id, author_name, text)
        VALUES ($1,$2,$3,$4)
      `, [id, user.id, user.fullName, text]);
    }

    for (const file of files) {
      const content = Buffer.from(await file.arrayBuffer());
      await client.query(`
        INSERT INTO rec.attachments
          (rec_id, file_name, mime_type, size_bytes, storage_key,
           uploaded_by, context, content)
        VALUES ($1,$2,$3,$4,NULL,$5,'recommendation',$6)
      `, [id, file.name, file.type || null, file.size, user.id, content]);
    }

    if (analogsSeen > 0) {
      await client.query(`
        INSERT INTO rec.recommendation_events
          (rec_id, kind, actor_id, actor_name, text)
        VALUES ($1,'duplicate_check',$2,$3,$4)
      `, [id, user.id, user.fullName,
        `Эксперт подтвердил отсутствие дублирования, ознакомившись с ${analogsSeen} аналогами`]);
    }

    return id;
  });

  if (intent === 'register') await зарегистрировать(recId);
  redirect(`/rec/${recId}/summary?form=draft-saved`);
}
