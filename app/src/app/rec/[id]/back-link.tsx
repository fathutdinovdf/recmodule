/* Кнопка «К реестру» в шапке карточки. Клиентский компонент ради того же
   `from`, что несут вкладки (tabs.tsx) и листалка (pager.tsx): без него
   возврат вёл на «/» и терял активный отбор реестра, хотя тот же отбор всё
   это время ехал с карточкой по вкладкам и пейджеру — несогласованность,
   а не сознательный сброс. */

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icons';
import { Hint } from '@/components/ui/Hint';

export function BackLink() {
  const from = useSearchParams().get('from');
  const href = from ? `/?${from}` : '/';

  return (
    <Hint text="К реестру">
      <Link className="cnbtn" href={href} aria-label="К реестру"><Icon id="back" size={20} /></Link>
    </Hint>
  );
}
