/* Подсказки при опечатке — сравнение по расстоянию Левенштейна, а не по
 * PostgreSQL pg_trgm. Кластер поднят с locale C (см. rec.ci в
 * 008_ci_search.sql): под ним pg_trgm вообще не режет кириллицу на
 * триграммы (show_trgm возвращает {} на любой русской строке), так что
 * сравнение пришлось считать в приложении. Триграммное сходство (Dice
 * по общим n-граммам) тоже пробовали — для русского языка с его богатыми
 * окончаниями оно путает «отклоение» со «Снижение» из-за общих суффиксов
 * («-ение»/«-ание»), а расстояние редактирования — нет: оно меряет именно
 * то, что нужно для опечатки — вставку, удаление, замену буквы.
 */

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev.splice(0, prev.length, ...cur);
  }
  return prev[b.length];
}

/** Сколько опечаток в слове такой длины ещё не делают его другим словом —
 *  чем короче слово, тем меньше запас: одна лишняя буква в «КЭ» — уже не
 *  «КЭ». */
function typoBudget(len: number): number {
  return Math.max(1, Math.round(len / 4));
}

/** Похож ли запрос на фразу с точностью до опечатки: сравнивает запрос со
 *  всей фразой и с каждым её словом по отдельности (запрос обычно короче
 *  многословной формулировки проблемы) и проверяет лучшее совпадение по
 *  бюджету опечаток. */
export function isTypoOf(query: string, phrase: string): boolean {
  const q = query.toLowerCase();
  const budget = typoBudget(q.length);
  if (levenshtein(q, phrase.toLowerCase()) <= budget) return true;
  return phrase.split(/\s+/).some((word) => levenshtein(q, word.toLowerCase()) <= budget);
}
