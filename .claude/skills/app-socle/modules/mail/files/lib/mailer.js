// E-mails : SMTP si __ENV___SMTP_HOST est defini, sinon sendmail local.
// __ENV___MAIL=log : rien n'est envoye, les messages sont gardes dans `outbox` (tests).
const nodemailer = require('nodemailer');

const outbox = [];
let transport = null;

function getTransport() {
  if (transport) return transport;
  const host = process.env.__ENV___SMTP_HOST;
  transport = host
    ? nodemailer.createTransport({ host, port: Number(process.env.__ENV___SMTP_PORT || 587), secure: process.env.__ENV___SMTP_PORT === '465',
      auth: process.env.__ENV___SMTP_USER ? { user: process.env.__ENV___SMTP_USER, pass: process.env.__ENV___SMTP_PASS } : undefined })
    : nodemailer.createTransport({ sendmail: true, newline: 'unix' });
  return transport;
}

async function send({ to, subject, text, html }) {
  const message = { from: process.env.__ENV___MAIL_FROM || '__SLUG__@localhost', to, subject, text, html };
  if (process.env.__ENV___MAIL === 'log') { outbox.push(message); return; }
  await getTransport().sendMail(message);
}

module.exports = { send, outbox };
