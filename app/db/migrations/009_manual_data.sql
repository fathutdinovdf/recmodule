-- Данные для режима DATA_SOURCE=manual: работа без стенда ВМАП (облачный
-- сервер первого этапа). Схема повторяет то, что сейчас отдаёт vmap.ts,
-- чтобы src/db/manual.ts могло подставляться на его место без изменения
-- потребителей.

-- Дерево объектов (ДО → ТПП → ЦДНГ → месторождение → куст → скважина) плюс
-- статические параметры скважины (плотности, пласт) — то, что сейчас отдают
-- listRegistrationWells/getRegistrationWell/getWell в vmap.ts. Наполняется
-- дампом со стенда, см. scripts/dump-wells-ref.mjs и scripts/load-wells-ref.mjs.
CREATE TABLE rec.ref_wells (
  well_id        bigint PRIMARY KEY,
  well_number    text NOT NULL,
  code           text,
  kust           text NOT NULL,
  field_id       bigint NOT NULL,
  field_name     text NOT NULL,
  oil_density    numeric,
  water_density  numeric,
  plast          text,
  operation_mode int,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ref_wells_field_idx ON rec.ref_wells (field_id, lower(well_number));

-- Суточный факт, вводимый вручную взамен замеров ВМАП. parameter_id — те же
-- коды, что в vmap.ts PARAM (QZH_MEASURED=1, WATERCUT=7): один нормализованный
-- вид на оба параметра, а не два отдельных столбца, чтобы manual.ts читал
-- их тем же запросом, что и vmap.ts читает WellData.
CREATE TABLE rec.daily_facts (
  well_id      bigint NOT NULL,
  parameter_id smallint NOT NULL,
  date         date NOT NULL,
  value        numeric NOT NULL,
  entered_by   bigint REFERENCES rec.users(id),
  entered_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (well_id, parameter_id, date)
);
