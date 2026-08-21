/* Тексты запросов к ВМАП — отдельно от подключения.
 *
 * Файл намеренно ни от чего не зависит: его импортируют и приложение
 * (db/vmap.ts), и служебные скрипты, которые ходят на стенд своим
 * подключением. Иначе знание о том, что по DeleteDate фильтровать нельзя, а
 * время замера — COALESCE(FactDate, LEAST(CreateDate, UpdateDate)), пришлось бы
 * держать в двух местах. Один раз в этом проекте так уже вышло: питоновская
 * выгрузка повторяет тот же SQL, и любая правка здесь про неё забудет.
 */

/** Параметры ВМАП, которые нужны модулю.
 *
 * Живут здесь, а не в vmap.ts, ровно по той же причине, что и запросы: vmap.ts
 * тянет next/cache и из голого node не импортируется, а служебным скриптам
 * коды параметров нужны. Разъехавшись в двух местах, они дают молча пустые
 * плотности — так уже вышло в rebase-demo.mjs. vmap.ts их реэкспортирует,
 * поэтому в приложении по-прежнему `import { PARAM } from '@/db/vmap'`. */
export const PARAM = {
  /** Дебит жидкости замерной — фактический дебит для расчёта эффекта. */
  QZH_MEASURED: 1,
  /** Обводнённость объёмная — из неё получается нефть. */
  WATERCUT: 7,
  /** Плотность нефти в стандартных условиях, кг/м³. */
  OIL_DENSITY: 13,
  /** Плотность воды в стандартных условиях, кг/м³. Нужна, чтобы перевести
   *  замеренный объём жидкости в тонны: ставка ЭЭ на жидкость заведена на
   *  массу. На фонде значения 1000–1198, у 3079 скважин из 3190. */
  WATER_DENSITY: 12,
  /** Фактическое потребление электроэнергии, кВт·ч/сут.
   *  Договор называет её третьим базовым показателем наравне с дебитами.
   *  На стенде заполнена не по всему фонду — только там, где на станции
   *  управления стоит выносной прибор учёта (вопрос 1.5 к Заказчику).
   *  В расчёт денег ПОКА не входит: реализованная модель АЛЬМА списывает
   *  энергию удельными ставками от объёма добычи, а не по замеру. */
  EE_FACT: 93,
  /** Пласт(ы), на которые работает скважина. */
  PLAST: 50,
  /** Тип скважины: добывающий фонд — значение 1. */
  WELL_TYPE: 20,
  /* Режимные параметры — утверждённый технологический режим. Договор,
     Приложение № 2, называет их основным способом формирования базы; в
     расчёте пока не используются, база берётся по замерам. */
  QZH_MODE: 0,
  WATERCUT_MODE: 6,
} as const;

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
 * Полный справочник добывающего фонда ТПП одним запросом: дерево объектов и
 * статические параметры скважины. Из него живёт rec.ref_wells в режиме
 * DATA_SOURCE=manual, см. scripts/dump-wells-ref.mjs.
 *
 * Дерево и параметры берутся вместе, а не двумя выгрузками: врозь они
 * расходятся во времени, и скважина может приехать без плотности, которая на
 * стенде была.
 */
export function wellsRefSql(schema: string, tpp: string): string {
  const param = PARAM;
  return `
    SELECT w."Id"::text AS well_id, w."Name" AS well_number, w."Code" AS code,
           w."OperationMode" AS operation_mode,
           k."Name" AS kust, f."Id"::text AS field_id, f."Name" AS field_name,
           (SELECT d."Value" FROM ${schema}."WellData" d
             WHERE d."WellId" = w."Id" AND d."ParameterId" = ${param.OIL_DENSITY}
               AND d."DeleteDate" IS NULL LIMIT 1) AS oil_density,
           (SELECT d."Value" FROM ${schema}."WellData" d
             WHERE d."WellId" = w."Id" AND d."ParameterId" = ${param.WATER_DENSITY}
               AND d."DeleteDate" IS NULL LIMIT 1) AS water_density,
           (SELECT d."Value" FROM ${schema}."WellData" d
             WHERE d."WellId" = w."Id" AND d."ParameterId" = ${param.PLAST}
               AND d."DeleteDate" IS NULL LIMIT 1) AS plast
    FROM ${schema}."Wells" w
    JOIN ${schema}."OrganizationUnits" k
      ON k."Id" = w."OrganizationUnitId" AND k."OrganizationUnitType" = 4
     AND k."DeleteDate" IS NULL
    JOIN ${schema}."OrganizationUnits" f
      ON f."Id" = k."ParentId" AND f."OrganizationUnitType" = 3
     AND f."DeleteDate" IS NULL
    JOIN ${schema}."OrganizationUnits" c
      ON c."Id" = f."ParentId" AND c."OrganizationUnitType" = 2
     AND c."DeleteDate" IS NULL
    JOIN ${schema}."OrganizationUnits" t
      ON t."Id" = c."ParentId" AND t."OrganizationUnitType" = 1
     AND t."DeleteDate" IS NULL
    WHERE w."DeleteDate" IS NULL
      AND t."Name" = '${tpp}'
      AND EXISTS (
        SELECT 1 FROM ${schema}."WellData" well_type
        WHERE well_type."WellId" = w."Id"
          AND well_type."ParameterId" = ${param.WELL_TYPE}
          AND well_type."DeleteDate" IS NULL
          AND well_type."Value" = '1'
      )
    ORDER BY f."Name", lower(w."Name"), w."Name"
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
