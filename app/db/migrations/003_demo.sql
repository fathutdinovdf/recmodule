-- Механизм «вечно свежего» демо.
--
-- Задача: на дев-версии всегда настоящие дата и время, но статусы
-- демо-записей при этом не протухают. Рекомендация, которая вчера ждала
-- ответа Заказчика четыре часа, сегодня не должна оказаться просроченной на
-- сутки, а окно эффекта, открытое «месяц назад», не должно однажды закрыться
-- само и обнулить весь показ.
--
-- Решение: у демо-набора есть якорь — момент, относительно которого он
-- сгенерирован. Скрипт refresh-demo сдвигает все даты набора на разницу между
-- якорем и сегодняшним днём и переставляет якорь. Взаимное расположение
-- событий при этом сохраняется полностью: кто когда зарегистрирован, сколько
-- у кого осталось до срока, какие окна закрылись, — меняется только привязка
-- к календарю.
--
-- Почему сдвиг, а не перегенерация: перегенерация затёрла бы то, что сделали
-- руками. Модуль показывают, в нём принимают решения и пишут комментарии, и
-- терять их при каждом обновлении даты нельзя.
--
-- Сдвиг всегда кратен суткам. Иначе «утро понедельника» превратилось бы в
-- «ночь понедельника», и расчёт норматива в рабочих часах поехал бы вместе
-- с ним.

CREATE TABLE rec.demo_state (
    id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    -- Момент, относительно которого сгенерирован набор.
    anchor       timestamptz NOT NULL,
    -- Когда последний раз двигали. Нужно, чтобы понять, работает ли
    -- обновление вообще: если дата старая, значит скрипт не запускается.
    shifted_at   timestamptz,
    total_shift_days integer NOT NULL DEFAULT 0
);

-- Пометка «это демо-запись». Настоящие рекомендации, созданные в интерфейсе,
-- сдвигать нельзя: их даты — правда, а не декорация.
ALTER TABLE rec.recommendations ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE rec.claims          ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX ON rec.recommendations (is_demo) WHERE is_demo;

-- Сдвиг демо-набора на заданное число суток.
--
-- Собран одной функцией, а не разбросан по скрипту: список сдвигаемых полей
-- должен лежать в одном месте, иначе при добавлении новой таблицы с датой её
-- забудут, и часть набора уедет, а часть останется.
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
