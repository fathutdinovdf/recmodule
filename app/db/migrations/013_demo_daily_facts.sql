-- Демо-набор для суточных данных.
--
-- Зачем признак. rec.daily_facts привязан к СКВАЖИНЕ, а не к рекомендации, и
-- сгенерированные строки лежат вперемешку с настоящими, которые кто-то внёс
-- руками. Сдвиг демо-набора (rec.shift_demo) двигает даты — и двигать он
-- вправе только своё: правило проекта «записи без is_demo не двигаются, их
-- даты правда» действует и здесь.

ALTER TABLE rec.daily_facts
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

-- Функция пересоздаётся целиком: тело plpgsql не патчится по частям.
-- Изменение против 003_demo.sql ровно одно — блок rec.daily_facts ниже.
CREATE OR REPLACE FUNCTION rec.shift_demo(days integer) RETURNS void AS $$
DECLARE
    d interval := make_interval(days => days);
BEGIN
    IF days = 0 THEN RETURN; END IF;

    UPDATE rec.recommendations SET
        registered_at = registered_at + d,
        sent_at       = sent_at + d,
        due_at        = due_at + d,
        created_at    = created_at + d,
        updated_at    = updated_at + d
    WHERE is_demo;

    UPDATE rec.recommendation_events e SET at = e.at + d
    FROM rec.recommendations r WHERE r.id = e.rec_id AND r.is_demo;

    UPDATE rec.comments c SET at = c.at + d
    FROM rec.recommendations r WHERE r.id = c.rec_id AND r.is_demo;

    UPDATE rec.decisions dc SET at = dc.at + d
    FROM rec.recommendations r WHERE r.id = dc.rec_id AND r.is_demo;

    UPDATE rec.implementations i SET
        fact_date       = i.fact_date + days,
        fixed_at        = i.fixed_at + d,
        window_open_at  = i.window_open_at + days,
        window_close_at = i.window_close_at + days,
        closed_at       = i.closed_at + d
    FROM rec.recommendations r WHERE r.id = i.rec_id AND r.is_demo;

    UPDATE rec.baselines b SET
        created_at  = b.created_at + d,
        period_from = b.period_from + days,
        period_to   = b.period_to + days
    FROM rec.recommendations r WHERE r.id = b.rec_id AND r.is_demo;

    UPDATE rec.disputes ds SET
        opened_at   = ds.opened_at + d,
        resolved_at = ds.resolved_at + d,
        proposed_date = ds.proposed_date + days
    FROM rec.recommendations r WHERE r.id = ds.rec_id AND r.is_demo;

    UPDATE rec.claims SET
        registered_at = registered_at + d,
        checked_at    = checked_at + d,
        check_due_at  = check_due_at + d,
        complete_at   = complete_at + d,
        answer_due_at = answer_due_at + d,
        answered_at   = answered_at + d
    WHERE is_demo;

    -- Суточный факт демо-набора сдвигается вместе с окнами. Иначе первый же
    -- refresh отвязал бы данные от окон, к которым они сгенерированы: окно
    -- уехало вперёд, а сутки остались на месте, и весь набор стал бы пустым.
    --
    -- Сдвиг в два шага, и это не перестраховка. Первичный ключ здесь
    -- (well_id, parameter_id, date), а уникальность PostgreSQL проверяет
    -- ПОСТРОЧНО, а не в конце оператора: при сдвиге на N суток строка за
    -- 20-е налетает на ещё не сдвинутую строку за 21-е, и весь UPDATE падает.
    -- Порядком обновления управлять нельзя — ORDER BY в подзапросе его не
    -- задаёт. Поэтому набор сначала уезжает на заведомо пустой участок
    -- календаря целиком, а оттуда возвращается уже со сдвигом.
    UPDATE rec.daily_facts SET date = date + 100000 WHERE is_demo;
    UPDATE rec.daily_facts SET date = date - 100000 + days WHERE is_demo;

    -- Посуточный расчёт эффекта не сдвигаем, а удаляем: он привязан к реальным
    -- замерам ВМАП, у которых свои даты. Сдвинутый расчёт разошёлся бы с
    -- замерами, по которым сделан. Пересчитается при следующем открытии окна.
    DELETE FROM rec.effect_daily ed
    USING rec.recommendations r WHERE r.id = ed.rec_id AND r.is_demo;

    UPDATE rec.demo_state SET
        anchor = anchor + d,
        shifted_at = now(),
        total_shift_days = total_shift_days + days
    WHERE id = 1;
END;
$$ LANGUAGE plpgsql;
