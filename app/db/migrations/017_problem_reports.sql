-- Заявки о проблемах модуля — кнопка «Сообщить о проблеме» в подвале навигации.
--
-- Отдельная таблица, а не запись в rec.log: журнал рекомендации привязан к
-- конкретной рекомендации (rec_id NOT NULL), а жалоба на модуль ни к одной
-- рекомендации не относится — иногда её вообще не открывали.

CREATE TABLE rec.problem_reports (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES rec.users(id),
    -- Путь экрана, с которого отправили заявку: часто это половина описания
    -- проблемы, а вспомнить его самостоятельно после отправки уже нельзя.
    page        text NOT NULL,
    text        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON rec.problem_reports (created_at DESC);

-- Скриншот стоит тысячи слов описания. rec.attachments уже хранит содержимое
-- файла в самой строке (миграция 006) и уже умеет второй контекст помимо
-- рекомендации — comment_id для реплик обсуждения. Та же схема для заявки:
-- rec_id остаётся NULL, а привязка идёт через problem_report_id.
ALTER TABLE rec.attachments ADD COLUMN problem_report_id bigint
    REFERENCES rec.problem_reports(id) ON DELETE CASCADE;

CREATE INDEX ON rec.attachments (problem_report_id);
