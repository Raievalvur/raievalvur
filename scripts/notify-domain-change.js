// Raievalvur — ÜHEKORDNE teavituskiri olemasolevatele tellijatele domeenivahetuse kohta.
//
// Miks eraldi skript, mitte osa sync.js-ist: see on ühekordne ränne, mitte korduv
// tunnine tegevus — sync.js peaks jääma puhtaks tellimuse elutsükli (loomine/
// teavitamine/kustutamine) loogikast, ilma "kas domeen vahetus" erijuhtudeta, mis
// jääksid seal igaveseks kasutult vedelema.
//
// Mida see teeb:
//   1. Loeb koik aktiivsed tellimused, kellele "movedNoticeSent" veel puudub.
//   2. Saadab igaühele kirja, mis selgitab, et Raievalvur liikus uuele aadressile
//      (https://raievalvur.ee) ja et vana halduslink (mis viitas vanale
//      airport4.github.io aadressile) enam ei toimi — koos uue, toimiva lingiga.
//   3. Markeerib tellimuse "movedNoticeSent: true", et skripti saaks ohutult
//      uuesti kayivitada (nt kui esimene katse osaliselt ebaonnestus) ilma, et
//      kellelegi kirja kaks korda saadetaks.
//
// Kaivitamine: workflow_dispatch kaudu (.github/workflows/notify-domain-change.yml),
// samade GitHub Actions secretitega, mida sync.js kasutab
// (FIREBASE_SERVICE_ACCOUNT_KEY, SMTP_USER, SMTP_PASSWORD).
// Parast edukat kaivitamist voib nii see fail kui vastav workflow kustutada.

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const APP_URL = 'https://raievalvur.ee/';
const OLD_APP_URL = 'https://airport4.github.io/raievalvur/';

function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY puudub (GitHub Actions secret).');
  const creds = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  return admin.firestore();
}

function buildTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST || 'smtp.zone.eu';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function sendMovedEmail(transporter, toEmail, manageLink) {
  const body = [
    'Tere,',
    '',
    `Raievalvur liikus uuele veebiaadressile: ${APP_URL}`,
    '',
    `Sinu vana tellimuse haldamis-/kustutamislink viitas endisele aadressile (${OLD_APP_URL}) ja see ei toimi enam. Sinu tellimus ja valitud kriteeriumid on endiselt jõus muutumatult — muutus on ainult veebiaadressis.`,
    '',
    'Uus, toimiv link tellimuse vaatamiseks või kustutamiseks:',
    manageLink,
    '',
    APP_URL,
  ].join('\n');
  await transporter.sendMail({
    from: `Raievalvur <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Raievalvur: uus veebiaadress ja uus tellimuse haldamislink',
    text: body,
  });
}

async function main() {
  const db = initFirebase();
  const transporter = buildTransporter();
  if (!transporter) {
    console.error('SMTP_USER / SMTP_PASSWORD puudub — kirju ei saa saata.');
    process.exit(1);
  }

  const subsSnap = await db.collection('subscriptions').where('active', '==', true).get();
  console.log(`Aktiivseid tellimusi: ${subsSnap.size}.`);

  let sent = 0, skipped = 0;
  for (const subDoc of subsSnap.docs) {
    const sub = subDoc.data();
    if (sub.movedNoticeSent) { skipped++; continue; }
    const manageLink = `${APP_URL}?manage=${subDoc.id}`;
    try {
      await sendMovedEmail(transporter, sub.email, manageLink);
      await subDoc.ref.update({ movedNoticeSent: true });
      sent++;
      console.log(`Saadetud: ${sub.email}`);
    } catch (e) {
      console.error(`Ebaonnestus (${sub.email}):`, e.message);
    }
  }
  console.log(`Valmis. Saadetud: ${sent}, vahele jaetud (juba saadetud): ${skipped}.`);
}

main().catch((e) => {
  console.error('Skript ebaonnestus:', e);
  process.exit(1);
});
