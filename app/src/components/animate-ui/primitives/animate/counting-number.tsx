'use client';

/* Пружинный счётчик для плиток KPI реестра — аналог
 * animate-ui.com/docs/primitives/animate/counting-number. Исходник взять из
 * реестра не удалось (сайт в моменте отдавал 404 на прямые запросы), поэтому
 * компонент написан заново по тому же принципу: motion-value с пружиной,
 * округление и форматирование на каждый кадр через useTransform.
 *
 * Плитки считаются на сервере при каждой навигации (фильтр, страница,
 * период) — прежнее число уже стоит в DOM, а не 0, так что пружина всегда
 * едет от старого значения к новому, а не «с нуля». */

import * as React from 'react';
import { motion, useSpring, useTransform, useMotionValue, type SpringOptions } from 'motion/react';

type CountingNumberProps = {
  value: number;
  className?: string;
  transition?: SpringOptions;
};

function CountingNumber({
  value, className,
  transition = { stiffness: 170, damping: 26, bounce: 0 },
}: CountingNumberProps) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, transition);
  const текст = useTransform(spring, (v) => Math.round(v).toLocaleString('ru-RU'));

  React.useEffect(() => { motionValue.set(value); }, [value, motionValue]);

  return <motion.span className={className}>{текст}</motion.span>;
}

export { CountingNumber };
