-- Уникальность события «карточка открыта» на уровне БД.
--
-- До этого единственная защита от дубля была `INSERT ... WHERE NOT EXISTS`
-- внутри транзакции — а это не атомарно под READ COMMITTED: два запроса,
-- пришедшие почти одновременно (открытие в двух вкладках, либо prefetch
-- Next.js вплотную к настоящей навигации), оба видят «записи ещё нет» до
-- того, как первый закоммитится, и оба вставляют строку. Партиционный
-- уникальный индекс делает вторую вставку невозможной физически, а не по
-- убеждению приложения.
-- Существующие дубли (уже накопленные багом) чистим перед тем, как индекс
-- запретит их физически — иначе CREATE UNIQUE упадёт на первой же паре.
DELETE FROM rec.recommendation_events e
    USING rec.recommendation_events e2
    WHERE e.kind = 'opened' AND e2.kind = 'opened'
      AND e.rec_id = e2.rec_id AND e.id > e2.id;

CREATE UNIQUE INDEX recommendation_events_opened_once
    ON rec.recommendation_events (rec_id) WHERE kind = 'opened';
