'use client';

/* Вкладки с едущей подсветкой — компонент animate-ui поверх Radix Tabs.
 *
 * Взят из реестра как есть; правлены только цвета и геометрия. Что изменено
 * против оригинала и почему:
 *
 * 1. Цвета — через токены ВМАП. В оригинале подсветка описана парой
 *    `bg-background` + `dark:bg-input/30`, то есть тема переключается вариантом
 *    Tailwind `dark:`. У нас тема — атрибут `data-theme`, и `dark:` не
 *    сработал бы вовсе: тёмная тема осталась бы со светлой плашкой. Токены
 *    переключаются сами, поэтому обеих веток не нужно.
 *
 * 2. Полоса прозрачная, подсветка акцентная (`--component-accent-secondary`,
 *    текст `--text-accent`). В оригинале наоборот: серая полоса и белая плашка
 *    активного с рамкой и тенью. На белой карточке та плашка не читалась, а
 *    серая полоса выглядела вставкой; в макете же активная вкладка была
 *    акцентной — сюда и вернулись.
 *
 * 3. Переход текста — 90 мс вместо 500. Полсекунды на смену цвета надписи
 *    заметно отстают от самой подсветки: она приезжает пружиной за ~250 мс, и
 *    надпись догоняет её, когда движение уже кончилось.
 *
 * Пружина подсветки оставлена авторская: она даёт то самое ощущение, ради
 * которого компонент и брали.
 */

import * as React from 'react';

import {
  Tabs as TabsPrimitive,
  TabsList as TabsListPrimitive,
  TabsTrigger as TabsTriggerPrimitive,
  TabsContent as TabsContentPrimitive,
  TabsContents as TabsContentsPrimitive,
  TabsHighlight as TabsHighlightPrimitive,
  TabsHighlightItem as TabsHighlightItemPrimitive,
  type TabsProps as TabsPrimitiveProps,
  type TabsListProps as TabsListPrimitiveProps,
  type TabsTriggerProps as TabsTriggerPrimitiveProps,
  type TabsContentProps as TabsContentPrimitiveProps,
  type TabsContentsProps as TabsContentsPrimitiveProps,
} from '@/components/animate-ui/primitives/radix/tabs';
import { cn } from '@/lib/cn';

type TabsProps = TabsPrimitiveProps;

function Tabs({ className, ...props }: TabsProps) {
  return <TabsPrimitive className={cn('flex flex-col gap-2', className)} {...props} />;
}

type TabsListProps = TabsListPrimitiveProps;

function TabsList({ className, ...props }: TabsListProps) {
  return (
    /* exitDelay=0 против моргания при переключении. По умолчанию 200 мс: старая
       плашка держится на месте, пока новая уже проявилась, и вместо переезда
       видно две вспышки. С нулём старая гаснет сразу, а layoutId сшивает её с
       новой в одно движение. */
    <TabsHighlightPrimitive exitDelay={0}
                            className="absolute inset-0 z-0 rounded-md bg-[var(--component-accent-secondary)]">
      <TabsListPrimitive
        className={cn('inline-flex h-9 w-fit items-center justify-center gap-[2px] bg-transparent p-0', className)}
        {...props}
      />
    </TabsHighlightPrimitive>
  );
}

type TabsTriggerProps = TabsTriggerPrimitiveProps;

function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsHighlightItemPrimitive value={props.value} className="flex-1">
      <TabsTriggerPrimitive
        className={cn(
          'inline-flex h-full w-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1',
          /* Сброс браузерных умолчаний: preflight у нас выключен, поэтому
             кнопка приезжает с системной рамкой и серым фоном, а ссылка — с
             подчёркиванием. Без сброса неготовые вкладки (они button) выглядят
             постоянно выделенными, а готовые (они a) — подчёркнутыми. */
          'appearance-none border-0 bg-transparent no-underline',
          'text-sm font-medium text-[var(--text-tertiary)] transition-colors',
          'hover:text-[var(--text-secondary)]',
          'data-[state=active]:text-[var(--text-accent)]',
          'focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:outline-none',
          /* Неготовая вкладка — тот же сегмент, только бледнее: по ней видно
             объём модуля, но вести ей некуда. */
          'disabled:pointer-events-none disabled:text-[var(--text-quaternary)] disabled:opacity-100',
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        style={{ transitionDuration: 'var(--motion-fast)', transitionTimingFunction: 'var(--ease-out)' }}
        {...props}
      />
    </TabsHighlightItemPrimitive>
  );
}

type TabsContentsProps = TabsContentsPrimitiveProps;

function TabsContents(props: TabsContentsProps) {
  return <TabsContentsPrimitive {...props} />;
}

type TabsContentProps = TabsContentPrimitiveProps;

function TabsContent({ className, ...props }: TabsContentProps) {
  return <TabsContentPrimitive className={cn('flex-1 outline-none', className)} {...props} />;
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContents,
  TabsContent,
  type TabsProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentsProps,
  type TabsContentProps,
};
