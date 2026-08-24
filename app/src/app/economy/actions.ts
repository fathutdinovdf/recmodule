'use server';

/* Публикация правок экономической модели.
 *
 * Одно действие на весь пакет, и оно намеренно грубое: применить часть правок
 * нельзя. Ставки входят в один расчёт, и модель, где цена нефти уже новая, а
 * ставка НДПИ ещё старая, даст сумму, которой не было ни в одной редакции, —
 * и никто этого не заметит, потому что число выглядит правдоподобно.
 *
 * Старые значения читаются здесь же, внутри транзакции, а не приходят с
 * клиента. Клиентское «было» — это то, что человек видел, открыв страницу;
 * между открытием и публикацией мог опубликовать сосед, и тогда журнал
 * записал бы переход, которого не происходило.
 */

import { revalidatePath } from 'next/cache';
import { transaction } from '@/db/pool';
import { currentUser } from '@/lib/session';
import { правитЭкономику, НЕТ_ПРАВА } from '@/lib/access';

export type ОбластьПравки = 'global' | 'field' | 'ndpi';

export interface Правка {
  scope: ОбластьПравки;
  /** `field_id` узла ВМАП или `id` пластовой ставки; для общих параметров 0. */
  id: number;
  field: string;
  value: number | null;
}

/* Колонка и подпись для журнала — по белому списку, а не подстановкой имени
   поля в SQL. Имя приходит с клиента, и «просто подставить» его в UPDATE
   значит отдать наружу выбор колонки. */
const ПОЛЯ: Record<ОбластьПравки, Record<string, { col: string; label: string; nullable: boolean }>> = {
  global: {
    oilPrice: { col: 'oil_price', label: 'Цена нефти', nullable: false },
  },
  field: {
    eeLiquid: { col: 'ee_liquid', label: 'ЭЭ жидкость', nullable: true },
    eeOil: { col: 'ee_oil', label: 'ЭЭ нефть', nullable: true },
    chem: { col: 'chem', label: 'Деэмульгаторы', nullable: true },
  },
  ndpi: {
    rate: { col: 'rate', label: 'Ставка НДПИ', nullable: false },
  },
};

/** Число в журнал пишется так же, как показано на экране, — иначе спор по акту
    упрётся в расхождение записи и того, что человек видел. */
const текстом = (v: number | null): string | null =>
  v === null ? null : String(v);

export async function опубликовать(
  правки: Правка[],
  причина: string,
): Promise<{ error?: string; version?: string }> {
  const я = await currentUser();
  if (!правитЭкономику(я)) return { error: НЕТ_ПРАВА.экономика };

  const текстПричины = причина.trim();
  if (!текстПричины) return { error: 'Укажите причину изменения: без неё правку нельзя ни проверить, ни восстановить.' };
  if (!правки.length) return { error: 'Изменений нет.' };

  for (const п of правки) {
    const спец = ПОЛЯ[п.scope]?.[п.field];
    if (!спец) return { error: 'Неизвестное поле в пакете правок.' };
    if (п.value === null && !спец.nullable) return { error: `«${спец.label}» не может быть пустым.` };
    if (п.value !== null && (!Number.isFinite(п.value) || п.value < 0)) {
      return { error: `«${спец.label}»: значение должно быть числом не меньше нуля.` };
    }
  }

  return transaction(async (client) => {
    /* Строки блокируются до чтения старых значений: две одновременные
       публикации иначе прочитали бы одно «было» и записали в журнал два
       перехода из одного состояния. */
    const журнал: { scope: string; object: string; field: string; old: string | null; new: string | null }[] = [];

    for (const п of правки) {
      const спец = ПОЛЯ[п.scope][п.field];

      if (п.scope === 'global') {
        const { rows } = await client.query(
          'SELECT oil_price FROM rec.econ_global WHERE id = 1 FOR UPDATE');
        if (!rows[0]) return { error: 'Общие параметры не заведены.' };
        const было = rows[0].oil_price === null ? null : Number(rows[0].oil_price);
        if (было === п.value) continue;
        await client.query(
          `UPDATE rec.econ_global SET ${спец.col} = $1, updated_at = now() WHERE id = 1`, [п.value]);
        журнал.push({ scope: 'global', object: 'Общие параметры', field: спец.label, old: текстом(было), new: текстом(п.value) });
        continue;
      }

      if (п.scope === 'field') {
        const { rows } = await client.query(
          `SELECT field_name, ${спец.col} AS v FROM rec.econ_field_rates WHERE field_id = $1 FOR UPDATE`,
          [п.id]);
        if (!rows[0]) return { error: 'Месторождение не найдено в модели.' };
        const было = rows[0].v === null ? null : Number(rows[0].v);
        if (было === п.value) continue;
        await client.query(
          `UPDATE rec.econ_field_rates SET ${спец.col} = $1, updated_at = now() WHERE field_id = $2`,
          [п.value, п.id]);
        журнал.push({ scope: 'field', object: rows[0].field_name, field: спец.label, old: текстом(было), new: текстом(п.value) });
        continue;
      }

      const { rows } = await client.query(
        `SELECT field_name, plast, ${спец.col} AS v FROM rec.econ_ndpi_rates WHERE id = $1 FOR UPDATE`,
        [п.id]);
      if (!rows[0]) return { error: 'Ставка НДПИ не найдена.' };
      const было = rows[0].v === null ? null : Number(rows[0].v);
      if (было === п.value) continue;
      await client.query(
        `UPDATE rec.econ_ndpi_rates SET ${спец.col} = $1, updated_at = now() WHERE id = $2`,
        [п.value, п.id]);
      журнал.push({
        scope: 'ndpi', object: `${rows[0].field_name} — ${rows[0].plast}`,
        field: спец.label, old: текстом(было), new: текстом(п.value),
      });
    }

    /* Пакет, где каждое значение совпало с текущим, версии не образует: пустая
       редакция в истории — шум, по которому потом не отличить настоящую. */
    if (!журнал.length) {
      return { error: 'Значения в базе уже такие: публиковать нечего. Обновите страницу.' };
    }

    /* Номер редакции — порядковый в пределах суток. Считается внутри той же
       транзакции по самой таблице версий: отдельный счётчик пришлось бы
       чинить всякий раз, когда транзакция откатится. */
    const { rows: сч } = await client.query(`
      SELECT count(*) AS n FROM rec.econ_versions WHERE at::date = now()::date
    `);
    const сегодня = new Date();
    const дата = `${сегодня.getFullYear()}${String(сегодня.getMonth() + 1).padStart(2, '0')}${String(сегодня.getDate()).padStart(2, '0')}`;
    const версия = `ЭМ-${дата}-${String(Number(сч[0].n) + 1).padStart(3, '0')}`;

    const { rows: в } = await client.query(`
      INSERT INTO rec.econ_versions (version, actor_id, actor_name, reason)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [версия, я!.id, я!.fullName, текстПричины]);

    for (const з of журнал) {
      await client.query(`
        INSERT INTO rec.econ_changes (version_id, scope, object_name, field, old_value, new_value)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [в[0].id, з.scope, з.object, з.field, з.old, з.new]);
    }

    revalidatePath('/economy');
    return { version: версия };
  });
}
