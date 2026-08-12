/* Раскрытие справочников нативно делает details. Скрипт добавляет ожидаемое
   для прикладного меню закрытие по Escape и возвращает фокус на родительский
   пункт; без этого клавиатурой список можно открыть, но нельзя быстро убрать. */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = document.activeElement.closest?.('[data-refs-menu]');
  if (!menu || !menu.open) return;
  menu.open = false;
  menu.querySelector('summary').focus();
});
