-- Уведомления: колокольчик в шапке и персистентный бейдж «непрочитано» на
-- вкладке «История и обсуждение».
--
-- До этой миграции «непрочитано» существовало только как состояние открытой
-- сессии (SSE-счётчик в tabs.tsx) — оно не переживало перелогин и разные
-- устройства. Таблица ниже даёт то же самое, но на пользователя и навсегда,
-- пока запись не прочитана явно.
--
-- Получатели зависят от типа события, но правило одно для comment и
-- status_change: Исполнитель (эксперты и руководитель экспертов) в курсе
-- ВСЕГДА — так и задумана роль руководителя экспертов («видит работу всей
-- команды»), а Заказчик подключается только там, где уже участвовал
-- перепиской. mention — исключение из правила: получатель ровно тот, кого
-- упомянули, независимо от участия.

CREATE TABLE rec.notifications (
    id         bigserial PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES rec.users(id) ON DELETE CASCADE,
    rec_id     bigint NOT NULL REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    -- Есть у mention/comment, NULL у status_change: смена статуса не привязана
    -- к конкретной реплике.
    comment_id bigint REFERENCES rec.comments(id) ON DELETE CASCADE,
    type       text NOT NULL CHECK (type IN ('mention', 'comment', 'status_change')),
    actor_id   bigint REFERENCES rec.users(id),
    actor_name text NOT NULL,
    text       text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at    timestamptz
);

-- Список для колокольчика (все записи пользователя, свежие сверху) и счёт
-- непрочитанного — один индекс закрывает оба запроса.
CREATE INDEX ON rec.notifications (user_id, created_at DESC);
-- Бейдж вкладки: непрочитанное по конкретной рекомендации.
CREATE INDEX ON rec.notifications (user_id, rec_id) WHERE read_at IS NULL;

-- comment и mention рождаются из одной реплики, но получатель у них разный
-- (mention — только упомянутый, comment — все остальные заинтересованные), и
-- набор упомянутых на момент вставки самого комментария ещё неизвестен —
-- rec.comment_mentions заполняется отдельным запросом сразу после. Поэтому
-- обе вставки в rec.notifications делает не триггер, а приёмник реплики
-- (api/rec/[id]/comment/route.ts, через db/notifications.ts): там оба списка
-- уже разведены явно, без гадания по порядку выполнения триггеров.
--
-- Смена статуса — наоборот, ровно один момент и один-единственный автор,
-- поэтому ей триггер подходит: событие в rec.recommendation_events пишут
-- четыре разных файла (lifecycle.ts, actions.ts, impl/actions.ts,
-- effect/actions.ts), и обрастать вызовом «уведомить получателей» в каждом —
-- значит один раз забыть. Тот же приём, что у comment_notify (миграция 006).
CREATE OR REPLACE FUNCTION rec.notify_status_change() RETURNS trigger AS $$
BEGIN
    IF NEW.kind <> 'status' OR NEW.to_status IS NULL OR NEW.actor_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO rec.notifications (user_id, rec_id, type, actor_id, actor_name, text)
    SELECT u.id, NEW.rec_id, 'status_change', NEW.actor_id, NEW.actor_name, NEW.text
      FROM rec.users u
     WHERE u.is_active
       AND u.id <> NEW.actor_id
       AND (
             u.role_key IN ('expert', 'expertLead')
          OR EXISTS (SELECT 1 FROM rec.comments c WHERE c.rec_id = NEW.rec_id AND c.author_id = u.id)
       );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recommendation_events_notify
    AFTER INSERT ON rec.recommendation_events
    FOR EACH ROW EXECUTE FUNCTION rec.notify_status_change();
