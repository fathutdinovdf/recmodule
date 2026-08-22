const fs = require('fs');
const path = require('path');
const dns = require('dns');
const envPath = path.join('C:\\Работа\\Оценка эффектов\\проект сопровождения\\app', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line);
  if (m) process.env[m[1]] = m[2];
}
const nodemailer = require(path.join('C:\\Работа\\Оценка эффектов\\проект сопровождения\\app', 'node_modules', 'nodemailer'));

dns.lookup(process.env.SMTP_HOST, { family: 4 }, (err, address) => {
  if (err) { console.error('DNS FAIL', err.message); process.exit(1); }
  console.log('resolved', process.env.SMTP_HOST, '->', address);

  const t = nodemailer.createTransport({
    host: address,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE !== 'false',
    tls: { servername: process.env.SMTP_HOST },
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  t.sendMail({
    from: process.env.SMTP_FROM,
    to: process.env.PROBLEM_REPORT_EMAIL,
    subject: 'Тест SMTP — модуль рекомендаций',
    text: 'Если это письмо дошло, SMTP для заявок о проблемах настроен верно.',
  }).then((info) => { console.log('OK', info.response); process.exit(0); })
    .catch((e) => { console.error('FAIL', e.message); process.exit(1); });
});
