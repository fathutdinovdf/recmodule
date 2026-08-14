-- Вид кружка статуса. Перенесено из STATUS_TONE макета без изменений.
--
-- Кружок кодирует две вещи сразу: цвет — чья сторона держит процесс, заливка —
-- доведён ли шаг до конца. Полый кружок значит «состояние промежуточное»,
-- сплошной — «шаг закрыт». Своей цветовой семантики интерфейс не выдумывает.
--
-- Тон не выводится из side: «Зарегистрировано» и «На уточнении» держит
-- Исполнитель, но нейтральны по цвету, потому что процесс на них ещё не
-- перешёл к другой стороне.

ALTER TABLE rec.statuses ADD COLUMN tone text NOT NULL DEFAULT 'neutral'
    CHECK (tone IN ('neutral', 'wait', 'work', 'done', 'reject'));
ALTER TABLE rec.statuses ADD COLUMN filled boolean NOT NULL DEFAULT false;

UPDATE rec.statuses SET tone = v.tone, filled = v.filled FROM (VALUES
    ('draft',        'neutral', false),
    ('registered',   'neutral', true),
    ('sent',         'wait',    false),
    ('review',       'wait',    true),
    ('clarify',      'neutral', false),
    ('approved',     'work',    false),
    ('windowOpen',   'done',    false),
    ('windowClosed', 'done',    true),
    ('rejected',     'reject',  true),
    ('cancelled',    'neutral', false)
) AS v(code, tone, filled) WHERE rec.statuses.code = v.code;
