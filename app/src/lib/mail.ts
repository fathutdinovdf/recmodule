/* Письмо администратору о новой заявке о проблеме.
 *
 * SMTP не обязателен: пока `SMTP_HOST` пуст в `.env.local`, функция молча
 * ничего не делает — заявка всё равно попадает в `rec.problem_reports` и
 * видна на /problems, письмо только ускоряет, что о ней узнают. Поэтому
 * отправка обёрнута в try/catch у вызывающего, а не роняет действие.
 */

import nodemailer from 'nodemailer';

export async function уведомитьОЗаявке({ автор, page, text, вложения }: {
  автор: string; page: string; text: string;
  вложения?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  const получатель = process.env.PROBLEM_REPORT_EMAIL;
  if (!host || !получатель) return;

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: получатель,
    subject: `Обратная связь — ${автор}`,
    text: `${автор} написал со страницы ${page}:\n\n${text}\n\nСписок заявок: /problems`,
    attachments: вложения,
  });
}

/* Письмо о входе в модуль. Получатель — тот же PROBLEM_REPORT_EMAIL, что и у
 * заявок о проблемах: отдельного адреса под это не заводили. */
export async function уведомитьОВходе({ логин, роль, userAgent }: {
  логин: string; роль: string; userAgent: string | null;
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  const получатель = process.env.PROBLEM_REPORT_EMAIL;
  if (!host || !получатель) return;

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  const время = new Date().toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: получатель,
    subject: `Вход в модуль — ${логин}`,
    text: `${логин} (${роль}) вошёл в модуль ${время}.${userAgent ? `\n\nUser-Agent: ${userAgent}` : ''}`,
  });
}
