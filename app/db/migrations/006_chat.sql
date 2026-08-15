-- Обсуждение рекомендации: вложения к репликам, упоминания и оповещение
-- подписчиков ленты.

-- Содержимое файла кладём в базу. Тома у модуля нет, а при встраивании в ВМАП
-- не будет и своего диска: контур Заказчика даёт базу, а не файловую систему.
-- Цена решения известна — тяжёлая выгрузка тренда раздувает бэкап, — поэтому
-- размер ограничен в приложении, а не только договорённостью.
ALTER TABLE rec.attachments ADD COLUMN content bytea;

-- Файл, приложенный к реплике, а не к рекомендации целиком: у него свой
-- контекст ('comment') и своя строка в ленте.
ALTER TABLE rec.attachments ADD COLUMN comment_id bigint
    REFERENCES rec.comments(id) ON DELETE CASCADE;

CREATE INDEX ON rec.attachments (comment_id);

-- storage_key придуман под внешнее хранилище, которого нет. Пока файл лежит
-- в самой строке, ключ не нужен — но колонку не удаляем: она понадобится,
-- когда содержимое переедет в S3, и тогда content станет NULL.
ALTER TABLE rec.attachments ALTER COLUMN storage_key DROP NOT NULL;

-- Упоминания хранятся отдельно от текста. В тексте @Фамилия — это набор
-- символов, который завтра поменяется вместе с фамилией; связь же нужна
-- настоящая: по ней потом строятся уведомления «вас упомянули».
CREATE TABLE rec.comment_mentions (
    comment_id bigint NOT NULL REFERENCES rec.comments(id) ON DELETE CASCADE,
    user_id    bigint NOT NULL REFERENCES rec.users(id),
    PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX ON rec.comment_mentions (user_id);

-- Живая лента. Оповещение идёт через LISTEN/NOTIFY, а не через общую память
-- процесса: dev-сервер, будущий прод и любой фоновой скрипт пишут в одну базу,
-- и подписчик в другом процессе иначе не узнает о новой реплике.
--
-- В полезной нагрузке только id рекомендации и id реплики: у NOTIFY предел
-- 8000 байт, а текст реплики подписчик всё равно перечитает из базы — иначе
-- пришлось бы дублировать в канале права доступа и вложения.
CREATE OR REPLACE FUNCTION rec.notify_comment() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('rec_comment', NEW.rec_id || ':' || NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_notify
    AFTER INSERT ON rec.comments
    FOR EACH ROW EXECUTE FUNCTION rec.notify_comment();
