/* Иконка по расширению файла.
 *
 * Тип различается на глаз до чтения имени: во вложениях по рекомендации почти
 * всегда одно из трёх — выгрузка тренда таблицей, снимок экрана с телеметрии
 * или расчёт документом, — и путать их дороже, чем кажется.
 */

import { File, FileArchive, FileImage, FileSpreadsheet, FileText } from 'lucide-react';

const ПО_РАСШИРЕНИЮ: Record<string, typeof File> = {
  xls: FileSpreadsheet, xlsx: FileSpreadsheet, xlsm: FileSpreadsheet, csv: FileSpreadsheet,
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage, bmp: FileImage, webp: FileImage,
  zip: FileArchive, rar: FileArchive, '7z': FileArchive,
  doc: FileText, docx: FileText, pdf: FileText, txt: FileText, rtf: FileText, md: FileText,
};

const расширение = (имя: string) => имя.split('.').pop()?.toLowerCase() ?? '';

export function ИконкаФайла({ имя }: { имя: string }) {
  const Icon = ПО_РАСШИРЕНИЮ[расширение(имя)] ?? File;
  return <Icon />;
}

/* Тип файла словом. Расширение заглавными, а не «Таблица Excel»: во вложениях
   ходят выгрузки и снимки, и человек их различает по расширению, а описание
   типа заняло бы всю строку и вытеснило размер. */
export function типФайла(имя: string): string {
  const р = расширение(имя);
  return р ? р.toUpperCase() : 'Файл';
}
