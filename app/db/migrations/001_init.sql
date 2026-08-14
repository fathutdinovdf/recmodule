-- Схема модуля управления рекомендациями.
--
-- Всё лежит в схеме rec, а не в public. Причина практическая: модуль однажды
-- поедет в контур Заказчика, где в базе уже живёт ois_vmap, и таблица с именем
-- «users» в public — это столкновение, которое разбирать дороже, чем один раз
-- написать префикс схемы.
--
-- Данные ВМАП (скважины, месторождения, замеры) здесь НЕ дублируются: они
-- читаются из своей базы по well_id. Исключение — денормализованные номер
-- скважины, куст и месторождение в рекомендации: реестр должен открываться,
-- даже когда ВМАП недоступен, а номер скважины в выданной рекомендации не
-- должен меняться задним числом, если объект переименуют.

CREATE SCHEMA IF NOT EXISTS rec;

-- ============================ справочники ============================

-- Направления рекомендаций. Список закрытый, из договора, но храним таблицей,
-- а не enum: добавление направления не должно требовать миграции.
CREATE TABLE rec.directions (
    id          smallint PRIMARY KEY,
    name        text NOT NULL UNIQUE,
    sort_order  smallint NOT NULL,
    archived_at timestamptz
);

-- Десять статусов. «Реализуется», «Реализовано» и «Частично реализовано»
-- статусами не являются: полнота реализации — поле рекомендации (см.
-- recommendations.completeness), потому что статус её терял при переходе
-- к окну эффекта, а в отчётности по договору она нужна.
CREATE TABLE rec.statuses (
    code        text PRIMARY KEY,
    name        text NOT NULL,
    sort_order  smallint NOT NULL,
    -- Чья сторона держит процесс и доведён ли шаг до конца: цвет и заливка
    -- кружка в реестре. Своей семантики интерфейс не выдумывает, берёт отсюда.
    side        text NOT NULL CHECK (side IN ('executor', 'customer', 'none')),
    is_final    boolean NOT NULL DEFAULT false,
    -- Приоритет и контроль срока показываются только на этих статусах:
    -- на остальных норматив ответа уже не идёт и число вводило бы в заблуждение.
    shows_sla   boolean NOT NULL DEFAULT false
);

-- Приоритеты и нормативы ответа Заказчика в рабочих часах.
-- 4/8/24 — из договора в редакции от 30.07.2026 (SL1/SL2/SL3).
CREATE TABLE rec.priorities (
    code            text PRIMARY KEY,
    name            text NOT NULL,
    sort_order      smallint NOT NULL,
    response_hours  smallint NOT NULL
);

-- Причины отклонения и уточнения — отдельными таблицами, а не одной с типом:
-- списки живут независимо, и общий справочник пришлось бы всё время фильтровать.
CREATE TABLE rec.reject_reasons (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL,
    sort_order  smallint NOT NULL,
    archived_at timestamptz
);

CREATE TABLE rec.clarify_reasons (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL,
    sort_order  smallint NOT NULL,
    archived_at timestamptz
);

-- Числа, задающие поведение модуля, но не принадлежащие ни одной строке
-- справочника. Держим таблицей, потому что подбирать их будут по ходу работы,
-- не дожидаясь релиза. Горизонт окна лежит здесь же, но правке не подлежит:
-- 90 суток зафиксированы договором.
CREATE TABLE rec.module_params (
    key         text PRIMARY KEY,
    value       numeric NOT NULL,
    name        text NOT NULL,
    unit        text,
    hint        text,
    editable    boolean NOT NULL DEFAULT true,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text
);

-- ============================ пользователи ============================

CREATE TABLE rec.users (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login           text NOT NULL UNIQUE,
    full_name       text NOT NULL,
    position        text,
    -- Сторона договора. От неё зависит не право, а смысл действий: фиксировать
    -- реализацию может только Исполнитель, принимать решение — только Заказчик.
    side            text NOT NULL CHECK (side IN ('executor', 'customer')),
    -- Право решения по рекомендации не выводится из стороны: у Заказчика есть
    -- и наблюдатели без права принимать.
    can_decide      boolean NOT NULL DEFAULT false,
    -- Право правки экономической модели выделено отдельно: ставки влияют на
    -- расчёт денег по договору, и администратор справочников им не наделяется.
    can_edit_economy boolean NOT NULL DEFAULT false,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Зона ответственности — набор месторождений. Пустая зона означает «все»:
-- так устроены руководители, и хранить им список из восемнадцати строк,
-- который надо дополнять при каждом новом месторождении, — лишняя работа.
-- Месторождение задаётся идентификатором узла ВМАП, а не названием: названия
-- меняются, идентификатор нет.
CREATE TABLE rec.user_fields (
    user_id     bigint NOT NULL REFERENCES rec.users(id) ON DELETE CASCADE,
    field_id    bigint NOT NULL,
    field_name  text NOT NULL,
    PRIMARY KEY (user_id, field_id)
);

-- История выдачи и снятия доступа. Нужна не для аудита ради аудита: когда
-- рекомендация не дошла до исполнителя, первый вопрос — была ли скважина
-- в его зоне на тот момент.
CREATE TABLE rec.user_access_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES rec.users(id) ON DELETE CASCADE,
    at          timestamptz NOT NULL DEFAULT now(),
    actor       text NOT NULL,
    action      text NOT NULL,
    details     text
);

CREATE INDEX ON rec.user_access_log (user_id, at DESC);

-- ============================ рекомендации ============================

CREATE TABLE rec.recommendations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Номер выдаётся при регистрации, у черновика его нет. Формат
    -- «КОД-ГГ-NNNN», где КОД — буквенный код месторождения: номер читается
    -- как адрес объекта, поэтому код месторождения после выдачи неизменен.
    number          text UNIQUE,
    status          text NOT NULL REFERENCES rec.statuses(code),
    direction_id    smallint NOT NULL REFERENCES rec.directions(id),
    priority        text REFERENCES rec.priorities(code),

    -- Объект. well_id — ссылка в ВМАП; остальное денормализовано намеренно
    -- (см. шапку файла).
    well_id         bigint,
    well_number     text NOT NULL,
    kust            text,
    field_id        bigint,
    field_name      text NOT NULL,

    -- Содержание рекомендации.
    problem         text NOT NULL,
    action          text NOT NULL,
    rationale       text,

    -- Ожидаемый результат. Прирост жидкости в м³/сут, нефти в т/сут,
    -- энергопотребление в кВт·ч/сут; у энергии минус — это экономия.
    expect_qzh      numeric(10,2),
    expect_qn       numeric(10,2),
    expect_ee       numeric(10,2),

    -- Полнота реализации — поле, а не статус (см. комментарий к statuses).
    completeness    text CHECK (completeness IN ('full', 'partial')),
    completeness_note text,

    author_id       bigint NOT NULL REFERENCES rec.users(id),
    executor_id     bigint REFERENCES rec.users(id),

    registered_at   timestamptz,
    sent_at         timestamptz,
    -- Срок ответа Заказчика. Считается рабочими часами от передачи; при
    -- запросе уточнения приостанавливается и продолжается с остатка, а не
    -- начинается заново, — редакция договора от 30.07.2026.
    due_at          timestamptz,
    sla_hours_left  numeric(6,2),

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    -- Мягкое удаление, как во всей базе ВМАП: рекомендация с историей решений
    -- физически не удаляется никогда.
    deleted_at      timestamptz
);

CREATE INDEX ON rec.recommendations (status) WHERE deleted_at IS NULL;
CREATE INDEX ON rec.recommendations (well_id);
CREATE INDEX ON rec.recommendations (field_id);
CREATE INDEX ON rec.recommendations (registered_at DESC);
CREATE INDEX ON rec.recommendations (due_at) WHERE due_at IS NOT NULL;

-- Счётчик номеров по месторождению и году. Отдельной таблицей, а не max(number):
-- при двух одновременных регистрациях max() выдаст один номер дважды.
CREATE TABLE rec.number_counters (
    field_code  text NOT NULL,
    year        smallint NOT NULL,
    last_number integer NOT NULL DEFAULT 0,
    PRIMARY KEY (field_code, year)
);

-- Хронология. Одна таблица на все события рекомендации: смена статуса,
-- решение, комментарий системы. Разносить по типам смысла нет — читаются они
-- всегда вместе, одной лентой.
CREATE TABLE rec.recommendation_events (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rec_id      bigint NOT NULL REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    at          timestamptz NOT NULL DEFAULT now(),
    kind        text NOT NULL,
    actor_id    bigint REFERENCES rec.users(id),
    actor_name  text NOT NULL,
    from_status text,
    to_status   text,
    text        text
);

CREATE INDEX ON rec.recommendation_events (rec_id, at);

CREATE TABLE rec.comments (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rec_id      bigint NOT NULL REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    at          timestamptz NOT NULL DEFAULT now(),
    author_id   bigint NOT NULL REFERENCES rec.users(id),
    author_name text NOT NULL,
    text        text NOT NULL,
    deleted_at  timestamptz
);

CREATE INDEX ON rec.comments (rec_id, at);

CREATE TABLE rec.attachments (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rec_id      bigint REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    file_name   text NOT NULL,
    mime_type   text,
    size_bytes  bigint,
    storage_key text NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    uploaded_by bigint REFERENCES rec.users(id),
    -- К чему приложен файл: к самой рекомендации, к решению, к фиксации факта.
    context     text NOT NULL DEFAULT 'recommendation'
);

-- ============================ решения Заказчика ============================

-- Решений по одной рекомендации может быть несколько: запрос уточнения
-- возвращает её Исполнителю, и следующий круг заканчивается новым решением.
-- Поэтому таблица, а не поля в рекомендации.
CREATE TABLE rec.decisions (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rec_id      bigint NOT NULL REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    at          timestamptz NOT NULL DEFAULT now(),
    kind        text NOT NULL CHECK (kind IN ('accept', 'reject', 'clarify')),
    actor_id    bigint NOT NULL REFERENCES rec.users(id),
    actor_name  text NOT NULL,
    reason_id   smallint,
    reason_text text,
    -- Обоснование обязательно при отклонении и уточнении: это единственное,
    -- чем Заказчик объясняет отказ в отчётности по договору. Проверка на
    -- уровне приложения, а не CHECK: текст причины у принятия необязателен.
    comment     text,
    planned_at  date,
    -- Сколько рабочих часов норматива было израсходовано к моменту решения.
    -- Считается один раз и хранится: пересчитывать задним числом нельзя,
    -- производственный календарь может измениться.
    sla_spent   numeric(6,2)
);

CREATE INDEX ON rec.decisions (rec_id, at);

-- ============================ реализация и окно эффекта ============================

-- Факт реализации определяет Исполнитель по телеметрии, а не Заказчик.
-- Фиксация в тот же момент открывает окно подтверждения эффекта, поэтому
-- реализация и окно — одна запись, а не две.
CREATE TABLE rec.implementations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rec_id          bigint NOT NULL UNIQUE REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    -- Дата фактической реализации: окно отсчитывается от неё, а не от момента
    -- фиксации — эксперт может заметить смену режима через день-другой.
    fact_date       date NOT NULL,
    fixed_at        timestamptz NOT NULL DEFAULT now(),
    fixed_by        bigint NOT NULL REFERENCES rec.users(id),
    fixed_by_name   text NOT NULL,
    note            text,
    window_open_at  date NOT NULL,
    window_close_at date NOT NULL,
    closed_at       timestamptz,
    closed_early    boolean NOT NULL DEFAULT false
);

CREATE INDEX ON rec.implementations (window_close_at) WHERE closed_at IS NULL;

-- ============================ базовые значения ============================

-- База, от которой считается эффект. Вводится при регистрации рекомендации
-- Исполнителем и потом может быть оспорена Заказчиком — поэтому это версии,
-- а не поля рекомендации: спор должен показывать, что было и что предлагают.
--
-- Действующей считается последняя запись со статусом accepted; пока идёт спор,
-- расчёт помечается предварительным, но не останавливается.
CREATE TABLE rec.baselines (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rec_id      bigint NOT NULL REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    -- Базовый дебит жидкости, м³/сут; нефти, т/сут; энергопотребление, кВт·ч/сут.
    base_qzh    numeric(10,3),
    base_qn     numeric(10,3),
    base_ee     numeric(10,2),
    -- Откуда взята база: введена руками при регистрации, посчитана по замерам
    -- до мероприятия или предложена Заказчиком в споре.
    source      text NOT NULL CHECK (source IN ('manual', 'measured', 'disputed')),
    -- Период, по которому база посчитана, если она из замеров.
    period_from date,
    period_to   date,
    status      text NOT NULL DEFAULT 'accepted'
                CHECK (status IN ('accepted', 'proposed', 'rejected', 'superseded')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  bigint REFERENCES rec.users(id),
    author_name text NOT NULL,
    note        text
);

CREATE INDEX ON rec.baselines (rec_id, created_at DESC);

-- Споры. Два предмета: дата реализации и базовые значения. Общая таблица,
-- потому что жизненный цикл у них один — открыт, принят, отклонён, — и
-- показываются они в карточке одним блоком.
--
-- Спор не останавливает окно эффекта: оно продолжает идти, а расчёт
-- помечается предварительным. Иначе Заказчику было бы выгодно спорить, чтобы
-- остановить отсчёт.
CREATE TABLE rec.disputes (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rec_id          bigint NOT NULL REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    subject         text NOT NULL CHECK (subject IN ('fact_date', 'baseline')),
    opened_at       timestamptz NOT NULL DEFAULT now(),
    opened_by       bigint NOT NULL REFERENCES rec.users(id),
    opened_by_name  text NOT NULL,
    reason          text NOT NULL,
    -- Что предлагает Заказчик взамен. Для даты — proposed_date, для базы —
    -- ссылка на предложенную версию в baselines.
    proposed_date   date,
    proposed_baseline_id bigint REFERENCES rec.baselines(id),
    state           text NOT NULL DEFAULT 'open'
                    CHECK (state IN ('open', 'accepted', 'rejected')),
    resolved_at     timestamptz,
    resolved_by     bigint REFERENCES rec.users(id),
    resolution_note text
);

CREATE INDEX ON rec.disputes (rec_id, opened_at DESC);
CREATE INDEX ON rec.disputes (state) WHERE state = 'open';

-- ============================ заявки Заказчика ============================

CREATE TABLE rec.claims (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          text UNIQUE NOT NULL,
    kind            text NOT NULL,
    status          text NOT NULL,
    priority        text REFERENCES rec.priorities(code),
    well_id         bigint,
    well_number     text,
    field_name      text,
    subject         text NOT NULL,
    body            text,
    author_id       bigint NOT NULL REFERENCES rec.users(id),
    author_name     text NOT NULL,
    assignee_id     bigint REFERENCES rec.users(id),
    registered_at   timestamptz NOT NULL DEFAULT now(),
    -- Два независимых срока: первичная проверка полноты данных и ответ по
    -- существу. Второй начинается не с регистрации, а с момента, когда данных
    -- стало достаточно, — иначе Исполнитель отвечает за задержку Заказчика.
    checked_at      timestamptz,
    check_due_at    timestamptz,
    complete_at     timestamptz,
    answer_due_at   timestamptz,
    answered_at     timestamptz,
    answer          text,
    -- Рекомендация, выпущенная по этой заявке, если дело кончилось ею.
    rec_id          bigint REFERENCES rec.recommendations(id),
    deleted_at      timestamptz
);

CREATE INDEX ON rec.claims (status) WHERE deleted_at IS NULL;
CREATE INDEX ON rec.claims (answer_due_at) WHERE answered_at IS NULL;

-- ============================ экономическая модель ============================

-- Параметры, общие для всех месторождений. Таблица на одну строку — чтобы
-- правка шла тем же путём, что и правка ставок, и попадала в ту же историю.
CREATE TABLE rec.econ_global (
    id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    oil_price   numeric(12,4) NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Ставки затрат по узлам ВМАП. Три статьи — столько в рабочем шаблоне
-- Заказчика; прежний набор из девяти (подъём, ППД, транспорт, подготовка,
-- обслуживание ГНО) остался в более ранней модели, которой он не пользуется.
-- Держать статьи, которых нет у Заказчика, значит заранее разойтись с ним
-- в цифрах при сверке.
--
-- NULL — это не ноль. Ноль означает «затрат нет», NULL — «ставка не заведена»,
-- и расчёт по такому месторождению не делается вовсе.
CREATE TABLE rec.econ_field_rates (
    field_id    bigint PRIMARY KEY,
    field_name  text NOT NULL,
    -- Как месторождение называется в модели Заказчика. NULL значит, что узла
    -- ВМАП в модели нет и расчёт по нему невозможен.
    source_name text,
    ee_liquid   numeric(12,4),   -- руб/т жидкости
    ee_oil      numeric(12,4),   -- руб/т нефти
    chem        numeric(12,4),   -- руб/т нефти
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Ставки НДПИ по паре «месторождение + пласт». Именно по паре, а не по
-- месторождению: внутри одного месторождения ставка расходится до двух с
-- лишним раз, и средняя заложила бы в расчёт ошибку в разы на самой большой
-- статье.
--
-- key — сцепка названий в том виде, в каком её строит сама модель Заказчика:
-- по нему в её листах идёт VLOOKUP. Переписывать ключ под наши названия
-- нельзя, иначе связь с источником потеряется при следующей выгрузке.
CREATE TABLE rec.econ_ndpi_rates (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key         text NOT NULL UNIQUE,
    field_name  text NOT NULL,
    plast       text NOT NULL,
    rate        numeric(12,4) NOT NULL,   -- руб/т нефти, сводно НДПИ+НДД
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Привязка скважины к ставке НДПИ. Ключ — пара «месторождение + номер», а не
-- один номер: номер уникален внутри месторождения, но не между ними, и по
-- одному номеру 77 скважин получили бы ставку соседнего промысла молча.
CREATE TABLE rec.econ_well_rates (
    field_id    bigint NOT NULL,
    well_number text NOT NULL,
    ndpi_id     bigint NOT NULL REFERENCES rec.econ_ndpi_rates(id),
    -- Пласт по объекту разработки, из ВМАП. Справочный: ставка выбирается не
    -- по нему, а по налоговому ключу.
    plast       text,
    PRIMARY KEY (field_id, well_number)
);

-- Версии экономической модели. Расчёт запоминает версию, по которой сделан:
-- договор требует считать по параметрам, действующим на дату расчёта, значит
-- правка ставки не должна пересчитывать прошлые расчёты задним числом.
CREATE TABLE rec.econ_versions (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version         text NOT NULL UNIQUE,
    at              timestamptz NOT NULL DEFAULT now(),
    effective_from  timestamptz NOT NULL DEFAULT now(),
    actor_id        bigint REFERENCES rec.users(id),
    actor_name      text NOT NULL,
    -- Причина обязательна: без неё изменение ставок нельзя ни восстановить,
    -- ни проверить.
    reason          text NOT NULL
);

CREATE TABLE rec.econ_changes (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version_id  bigint NOT NULL REFERENCES rec.econ_versions(id) ON DELETE CASCADE,
    scope       text NOT NULL CHECK (scope IN ('global', 'field', 'ndpi')),
    object_name text NOT NULL,
    field       text NOT NULL,
    old_value   text,
    new_value   text
);

CREATE INDEX ON rec.econ_changes (version_id);

-- ============================ расчёт эффекта ============================

-- Суточный расчёт по окну эффекта. Хранится, а не считается на лету каждый
-- раз, по двум причинам: замеры приходят задним числом и меняют уже
-- посчитанные сутки, и расчёт должен быть воспроизводим — в споре с Заказчиком
-- нужно показать, из чего сложилась цифра, а не пересчитать её заново по
-- сегодняшним данным.
CREATE TABLE rec.effect_daily (
    rec_id          bigint NOT NULL REFERENCES rec.recommendations(id) ON DELETE CASCADE,
    day             date NOT NULL,

    -- Факт за сутки: среднее по времени, интегралом ступенчатой функции.
    fact_qzh        numeric(10,3),
    fact_qn         numeric(10,3),
    fact_ee         numeric(10,2),
    -- Сколько замеров пришлось на эти сутки и какая доля суток опирается на
    -- них, а не на протянутое значение прошлых. По этому числу видно, чему
    -- в расчёте верить.
    points          smallint NOT NULL DEFAULT 0,
    coverage        numeric(4,3) NOT NULL DEFAULT 0,

    -- Дельты к действующей базе.
    delta_qzh       numeric(10,3),
    delta_qn        numeric(10,3),
    delta_ee        numeric(10,2),

    -- Разложение по статьям, руб. Хранится целиком: спор с Заказчиком идёт
    -- по статьям, а не по итогу.
    revenue         numeric(14,2),
    ndpi            numeric(14,2),
    cost_ee_liquid  numeric(14,2),
    cost_ee_oil     numeric(14,2),
    cost_chem       numeric(14,2),
    total           numeric(14,2),

    -- По какой базе и версии ставок посчитано.
    baseline_id     bigint REFERENCES rec.baselines(id),
    econ_version_id bigint REFERENCES rec.econ_versions(id),
    calculated_at   timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (rec_id, day)
);

CREATE INDEX ON rec.effect_daily (rec_id, day);

-- ============================ обновление updated_at ============================

CREATE OR REPLACE FUNCTION rec.touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch BEFORE UPDATE ON rec.users
    FOR EACH ROW EXECUTE FUNCTION rec.touch_updated_at();
CREATE TRIGGER recommendations_touch BEFORE UPDATE ON rec.recommendations
    FOR EACH ROW EXECUTE FUNCTION rec.touch_updated_at();
