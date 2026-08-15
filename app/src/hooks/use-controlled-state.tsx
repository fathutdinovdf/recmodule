import * as React from 'react';

interface CommonControlledStateProps<T> {
  value?: T;
  defaultValue?: T;
}

/* Служебный hook Animate UI: Radix может управлять открытостью сам или получать
 * её снаружи. В обоих случаях AnimatePresence нужен один фактический state,
 * иначе содержимое исчезает раньше, чем успевает проиграть exit-анимацию. */
export function useControlledState<T, Rest extends unknown[] = []>(
  props: CommonControlledStateProps<T> & {
    onChange?: (value: T, ...args: Rest) => void;
  },
): readonly [T, (next: T, ...args: Rest) => void] {
  const { value, defaultValue, onChange } = props;
  const [state, setInternalState] = React.useState<T>(
    value !== undefined ? value : (defaultValue as T),
  );

  React.useEffect(() => {
    if (value !== undefined) setInternalState(value);
  }, [value]);

  const setState = React.useCallback((next: T, ...args: Rest) => {
    setInternalState(next);
    onChange?.(next, ...args);
  }, [onChange]);

  return [state, setState] as const;
}
