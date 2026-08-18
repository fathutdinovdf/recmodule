'use client';

/* Обёртка мастера для прямого захода по /rec/new (см. page.tsx) — там нет
   родителя с состоянием open, который сворачивал бы мастер, поэтому закрытие
   ведёт в реестр обычной навигацией. */

import { useRouter } from 'next/navigation';
import { RegistrationWizard } from './wizard';
import type {
  RegistrationDirection, RegistrationExecutor, RegistrationPriority,
} from '@/db/registration';

export function WizardStandalone(props: {
  directions: RegistrationDirection[];
  priorities: RegistrationPriority[];
  executors: RegistrationExecutor[];
  currentExecutorId: number | null;
}) {
  const router = useRouter();
  return <RegistrationWizard {...props} onClose={() => router.push('/')} />;
}
