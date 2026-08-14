/* Тексты запросов к ВМАП — отдельно от подключения.
 *
 * Файл намеренно ни от чего не зависит: его импортируют и приложение
 * (db/vmap.ts), и служебные скрипты, которые ходят на стенд своим
 * подключением. Иначе знание о том, что по DeleteDate фильтровать нельзя, а
 * время замера — COALESCE(FactDate, LEAST(CreateDate, UpdateDate)), пришлось бы
 * держать в двух местах. Один раз в этом проекте так уже вышло: питоновская
 * выгрузка повторяет тот же SQL, и любая правка здесь про неё забудет.
 */

/**
 * Замеры параметра по скважине за период.
 * Параметры: $1 wellId, $2 parameterId, $3 от, $4 до.
 *
 * DISTINCT нужен: один и тот же замер лежит в нескольких строках истории,
 * отличающихся только служебными полями.
 */
export function measurementsSql(schema: string): string {
  return `
    SELECT DISTINCT
           COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) AS at,
           d."Value" AS value
    FROM ${schema}."WellData" d
    WHERE d."WellId" = $1
      AND d."ParameterId" = $2
      AND COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) >= $3
      AND COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) <= $4
    ORDER BY at
  `;
}

/**
 * Плотности нефти и воды по скважине. Параметры: $1 wellId.
 * Здесь DeleteDate IS NULL уместен: это статичный параметр, нужно текущее
 * значение, а не история.
 */
export function densitiesSql(schema: string, oilParam: number, waterParam: number): string {
  return `
    SELECT (SELECT d."Value" FROM ${schema}."WellData" d
             WHERE d."WellId" = $1 AND d."ParameterId" = ${oilParam}
               AND d."DeleteDate" IS NULL LIMIT 1) AS oil_density,
           (SELECT d."Value" FROM ${schema}."WellData" d
             WHERE d."WellId" = $1 AND d."ParameterId" = ${waterParam}
               AND d."DeleteDate" IS NULL LIMIT 1) AS water_density
  `;
}
