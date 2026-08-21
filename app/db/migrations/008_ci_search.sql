-- Регистронезависимый поиск по кириллице.
--
-- Кластер поднят с locale C (см. `docker exec recmodule-db psql ... SHOW lc_ctype`),
-- поэтому встроенные lower()/ILIKE/~* складывают регистр только для ASCII —
-- 'РАБОТА' ILIKE '%работа%' даёт false. Перекладывать кластер на ru_RU.UTF-8 или
-- ICU-локаль означало бы initdb заново, то есть пересоздание базы: слишком
-- дорого ради регистра поиска. Вместо этого — свой свёртыватель регистра:
-- ASCII отдаём стандартному lower(), кириллицу складываем translate()'ом по
-- явной паре алфавитов.

CREATE OR REPLACE FUNCTION rec.ci(text) RETURNS text AS $$
    SELECT lower(translate($1,
        'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
        'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
    ))
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
