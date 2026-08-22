'use client';

/* Выпадающий список: поведение Radix, вид макета.
 *
 * Нативный `<select>` рисуется средствами операционной системы и токенам не
 * подчиняется — на экране, собранном из переменных ВМАП, он выглядит вставкой
 * из другого приложения (об этом же комментарий в `макет/wizard.css`). Макет
 * поэтому рисовал список сам, но клавиатуру, фокус и портал поверх прокрутки
 * ему пришлось бы дописывать. Radix даёт ровно это, а оформление — классы
 * `.combo*` из `ui.css`, перенесённые из макета.
 *
 * Значение уходит в форму скрытым полем: Radix отдаёт его при указанном
 * `name`, поэтому список работает в обычной форме с серверным действием, без
 * состояния на клиенте.
 */

import { Select as RadixSelect } from 'radix-ui';
import { Icon } from '../Icons';

export interface SelectOption {
  value: string;
  label: string;
  /** Пояснение справа: у месторождения — сколько скважин, у скважины — куст. */
  note?: string;
  disabled?: boolean;
}

export function Select({
  name, options, defaultValue, value, placeholder = 'Выберите значение', required, disabled, id,
  onValueChange,
}: {
  /* Необязательно: список бывает и вне формы — на экране прав он применяет
     выбор серверным действием сразу, и скрытое поле там некому отправлять. */
  name?: string;
  options: SelectOption[];
  defaultValue?: string;
  /* Контролируемый режим: на экране прав список — часть черновика карточки, и
     «Отменить» должно возвращать его к прежней роли, а не оставлять
     показанной ту, которую выбрали и не сохранили. */
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  onValueChange?: (значение: string) => void;
}) {
  return (
    <RadixSelect.Root name={name} defaultValue={defaultValue} value={value} required={required}
                      disabled={disabled} onValueChange={onValueChange}>
      <span className="combo">
        <RadixSelect.Trigger className="inp combo__inp" id={id} aria-label={placeholder}>
          <RadixSelect.Value placeholder={placeholder} />
        </RadixSelect.Trigger>
        <RadixSelect.Icon asChild>
          <span className="combo__caret"><Icon id="caret" /></span>
        </RadixSelect.Icon>
      </span>

      <RadixSelect.Portal>
        <RadixSelect.Content className="combo__menu" position="popper" sideOffset={6}>
          <RadixSelect.ScrollUpButton className="combo__scroll combo__scroll--up">
            <Icon id="caret" />
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className="combo__list">
            {options.map((o) => (
              <RadixSelect.Item key={o.value} value={o.value} disabled={o.disabled}
                                className="combo__opt">
                <RadixSelect.ItemText>
                  <span className="combo__txt">{o.label}</span>
                </RadixSelect.ItemText>
                {o.note && <span className="combo__note">{o.note}</span>}
                {/* Место под галочку занято всегда, даже когда её нет.
                    Radix рисует индикатор только у выбранного пункта, и без
                    постоянного слота пояснение справа съезжало ровно на
                    ширину галочки — у выбранной строки оно стояло не там, где
                    у соседних. Combobox решает то же самое иначе: там иконка
                    всегда в разметке и прячется видимостью. */}
                <span className="combo__tickslot">
                  <RadixSelect.ItemIndicator asChild>
                    <span className="combo__tick"><Icon id="check" /></span>
                  </RadixSelect.ItemIndicator>
                </span>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="combo__scroll">
            <Icon id="caret" />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
