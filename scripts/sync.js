// Raievalvur — tunnine sunkroniseerimine.
//
// Mida see skript teeb (kaevab kordamoodi, tunnis uks kord, GitHub Actionsi kaudu):
//   1. Loeb raie.tallinn.ee nimekirjavaadet (100 varskeimat otsust), et leida uued
//      raieload, mida Firestore'i 'permits' kollektsioonis veel pole.
//   2. Iga uue loa jaoks laeb otsuse detailvaate, et saada aadress/linnaosa, otsus,
//      kuupaevad, puude liigid/pohjused/labimoodud ja vaartusklass (kui see on
//      selle otsuse tuubi jaoks olemas).
//   3. Geokodeerib uue aadressi Maa-ameti tasuta In-ADS teenusega (kui see veel
//      cache'is/andmebaasis pole).
//   4. Kirjutab uue loa Firestore'i 'permits' kollektsiooni ja uuendab 'state/sync'
//      dokumenti (lastRunAt, lastLoaNr).
//   5. Kontrollib uut luba koigi aktiivsete tellimuste (subscriptions) kriteeriumide
//      vastu ja saadab sobivate tellimuste omanikele koondatud e-kirja.
//
// Skript kasutab Firebase Admin SDK-d (teenusekonto voti), mis mooduab Firestore'i
// turvareegleid taielikult — see EI vaja avalikku kirjutuslube 'permits'/'permits_archive'
// kollektsioonidele (need voivad ja peaksidki jaada suletuks, vt firestore.rules.txt).

const cheerio = require('cheerio');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const BASE_URL = 'https://raie.tallinn.ee';
const APP_URL = 'https://airport4.github.io/raievalvur/';
const LIST_LIMIT = parseInt(process.env.LIST_LIMIT || '100', 10);
const DISTRICTS = ['Haabersti', 'Kesklinn', 'Kristiine', 'Lasnamäe', 'Mustamäe', 'Nõmme', 'Pirita', 'Põhja-Tallinn'];
const ROMAN_ORDER = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

// ---------- Firebase init ----------
function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY puudub (GitHub Actions secret).');
  const creds = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  return admin.firestore();
}

// ---------- HTTP fetch helper (Node 20+ has global fetch) ----------
async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RaievalvurBot/1.0; +https://airport4.github.io/raievalvur/)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} otsimisel ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ---------- List page: leia varskeimad load ----------
async function fetchLatestList(limit) {
  const url = `${BASE_URL}/otsused?sort=proceeding.id&direction=desc&page=1&limit=${limit}`;
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const rows = [];
  $('table').first().find('tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    const loaNr = $(tds[0]).text().trim();
    const link = $(tr).find('a[href*="/otsused/"]').first();
    const href = link.attr('href') || '';
    const m = href.match(/\/otsused\/(\d+)\//);
    if (!loaNr || !m) return;
    rows.push({ loaNr, detailId: m[1] });
  });
  return rows;
}

// ---------- Detail page: kogu ulejaanud info ----------
function normalizeDistrict(raw) {
  if (!raw) return null;
  if (DISTRICTS.includes(raw)) return raw;
  for (const d of DISTRICTS) {
    if (raw.indexOf(d) === 0 || raw.indexOf(d) !== -1) return d;
  }
  return null;
}

function splitAddress(raw) {
  if (!raw) return { district: null, address: null };
  const m = raw.match(/^(.+?)\s+linnaosa\s+(.+)$/i);
  if (m) return { district: normalizeDistrict(m[1].trim()), address: m[2].trim() };
  return { district: null, address: raw.trim() };
}

function extractValueClass(text) {
  if (!text) return null;
  const m = text.match(/\(([IV]+)\s*väärtusklass\)/i);
  return m ? m[1].toUpperCase() : null;
}

async function fetchDetail(detailId) {
  const detailUrl = `${BASE_URL}/otsused/${detailId}/vaata`;
  const html = await fetchText(detailUrl);
  const $ = cheerio.load(html);

  // "Uldandmed" — voti/vaartus tabel (th -> td)
  const kv = {};
  $('table.table_basic tr').each((_, tr) => {
    const th = $(tr).find('th').first().text().trim();
    const td = $(tr).find('td').first().text().trim();
    if (th) kv[th] = td;
  });

  const { district, address } = splitAddress(kv['Aadress']);
  const decidedAtRaw = kv['Otsus tehtud'] || null;
  const validUntilRaw = kv['Kehtib kuni'] || null;

  // "Puud" tabel — leiame selle pealkirjareast "Puu liik"
  let trees = [];
  $('table').each((_, table) => {
    const headerText = $(table).find('thead').text();
    if (!headerText.includes('Puu liik')) return;
    const headers = [];
    $(table).find('thead th').each((__, th) => headers.push($(th).text().trim()));
    $(table).find('tbody tr').each((__, tr) => {
      const cells = {};
      $(tr).find('td').each((idx, td) => {
        if (headers[idx]) cells[headers[idx]] = $(td).text().trim();
      });
      if (!cells['Puu liik']) return;
      const diamMatch = (cells['Läbimõõt'] || '').match(/(\d+(?:[.,]\d+)?)/);
      trees.push({
        species: cells['Puu liik'] || null,
        diameterCm: diamMatch ? parseFloat(diamMatch[1].replace(',', '.')) : null,
        reason: cells['Põhjus'] || null,
        valueClass: extractValueClass(cells['Väärtusklass'] || ''),
      });
    });
  });

  const species = [...new Set(trees.map((t) => t.species).filter(Boolean))];
  const permitTypes = [...new Set(trees.map((t) => t.reason).filter(Boolean))];
  const maxDiameterCm = trees.reduce((m, t) => (t.diameterCm && t.diameterCm > m ? t.diameterCm : m), 0) || null;
  let valueClass = null;
  trees.forEach((t) => {
    if (t.valueClass && (!valueClass || ROMAN_ORDER[t.valueClass] > ROMAN_ORDER[valueClass])) valueClass = t.valueClass;
  });

  return {
    district,
    address,
    decision: kv['Otsus'] || null,
    decidedAt: convertDate(decidedAtRaw),
    validUntil: convertDate(validUntilRaw),
    detailUrl,
    permitTypes,
    species,
    trees,
    maxDiameterCm,
    valueClass,
  };
}

// raie.tallinn.ee kuupaevad on kujul PP.KK.AAAA — teisendame ISO (AAAA-KK-PP) kujule,
// et sobituda olemasoleva andmestruktuuriga (vordlused, filtrid stringidena).
function convertDate(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ---------- Geokodeerimine (Maa-amet In-ADS, tasuta) ----------
async function geocodeAddress(address) {
  if (!address) return null;
  try {
    const q = `${address}, Tallinn`;
    const url = `https://inaadress.maaamet.ee/inaadress/gazetteer?address=${encodeURIComponent(q)}&tulem=json`;
    const text = await fetchText(url, 12000);
    const j = JSON.parse(text);
    const list = j.addresses || [];
    if (!list.length) return null;
    const best = list.find((a) => (a.omavalitsus || '').toLowerCase().includes('tallinn')) || list[0];
    const lat = parseFloat(best.viitepunkt_b);
    const lng = parseFloat(best.viitepunkt_l);
    if (isNaN(lat) || isNaN(lng)) return null;
    return [lat, lng];
  } catch (e) {
    console.warn('Geokodeerimine ebaonnestus:', address, e.message);
    return null;
  }
}

// ---------- Tellimuste vastavuskontroll ----------
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function matchesSubscription(sub, permit) {
  if (sub.districts && sub.districts.length && !sub.districts.includes(permit.district)) return false;
  if (sub.species && sub.species.length && !permit.species.some((s) => sub.species.includes(s))) return false;
  if (sub.reasons && sub.reasons.length && !permit.permitTypes.some((r) => sub.reasons.includes(r))) return false;
  if (sub.minDiameterCm && (!permit.maxDiameterCm || permit.maxDiameterCm < sub.minDiameterCm)) return false;
  if (sub.radiusM && sub.homeLat != null && sub.homeLng != null) {
    if (permit.lat == null || permit.lng == null) return false;
    if (haversineKm(sub.homeLat, sub.homeLng, permit.lat, permit.lng) * 1000 > sub.radiusM) return false;
  }
  const lastNotified = parseInt(sub.lastNotifiedLoaNr || 0, 10);
  const thisLoaNr = parseInt(permit.loaNr, 10);
  if (!isNaN(lastNotified) && !isNaN(thisLoaNr) && thisLoaNr <= lastNotified) return false;
  return true;
}

// ---------- E-posti saatmine (Zone.eu SMTP) ----------
function buildTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST || 'smtp.zone.eu';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // port 465 = otsene TLS; port 587 kasutaks STARTTLS-i (secure:false)
    auth: { user, pass },
  });
}

function permitToLine(p) {
  const trees = p.species.length ? p.species.join(', ') : '—';
  return `${p.address || '—'} (${p.district || 'linnaosa teadmata'}) — ${trees}, ${p.permitTypes.join(', ') || '—'}${p.valueClass ? `, väärtusklass ${p.valueClass}` : ''}\n${p.detailUrl}`;
}

function describeSubscription(sub) {
  const bits = [];
  if (sub.species && sub.species.length) bits.push(`Puuliigid: ${sub.species.join(', ')}`);
  if (sub.reasons && sub.reasons.length) bits.push(`Põhjused: ${sub.reasons.join(', ')}`);
  if (sub.districts && sub.districts.length) bits.push(`Linnaosad: ${sub.districts.join(', ')}`);
  if (sub.minDiameterCm) bits.push(`Läbimõõt alates ${sub.minDiameterCm} cm`);
  if (sub.radiusM && sub.homeAddress) bits.push(`Raadius ${sub.radiusM} m aadressist "${sub.homeAddress}"`);
  return bits.length ? bits.join('\n') : 'Kõik uued otsused (ühtegi filtrit ei valitud).';
}

async function sendWelcomeEmail(transporter, toEmail, sub, manageLink) {
  const body = [
    'Tere,',
    '',
    'Sinu Raievalvuri tellimus on loodud. Saad e-kirja, kui uus otsus vastab järgnevatele tingimustele:',
    '',
    describeSubscription(sub),
    '',
    'Tellimuse haldamiseks (peatamiseks) ava:',
    manageLink,
    '',
    APP_URL,
  ].join('\n');
  await transporter.sendMail({
    from: `Raievalvur <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Raievalvur: tellimus on kinnitatud',
    text: body,
  });
}

async function sendDigestEmail(transporter, toEmail, permits, manageLink) {
  const subject = permits.length === 1
    ? `Raievalvur: uus raieluba, mis vastab su tellimusele`
    : `Raievalvur: ${permits.length} uut raieluba, mis vastavad su tellimusele`;
  const body = [
    'Tere,',
    '',
    'Sinu tellimuse kriteeriumitele vastas Tallinna raielubade infosüsteemis uus otsus:',
    '',
    permits.map(permitToLine).join('\n\n'),
    '',
    'Tellimuse haldamiseks (peatamiseks) ava:',
    manageLink,
    '',
    APP_URL,
  ].join('\n');
  await transporter.sendMail({
    from: `Raievalvur <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject,
    text: body,
  });
}

// ---------- Peafunktsioon ----------
async function main() {
  const db = initFirebase();
  const now = new Date().toISOString();

  console.log(`[${now}] Loen ${LIST_LIMIT} varskeimat otsust...`);
  const listRows = await fetchLatestList(LIST_LIMIT);
  console.log(`Nimekirjast leitud ${listRows.length} rida.`);

  // Leiame, millised loaNr-id on Firestore's juba olemas.
  const newRows = [];
  for (const row of listRows) {
    const doc = await db.collection('permits').doc(row.loaNr).get();
    if (!doc.exists) newRows.push(row);
  }
  console.log(`Neist uusi (Firestore's veel pole): ${newRows.length}.`);

  const newPermits = [];
  if (!newRows.length) {
    await db.doc('state/sync').set({ lastRunAt: now, lastCheckedCount: listRows.length }, { merge: true });
    console.log('Uusi otsuseid ei leitud.');
  } else {
    for (const row of newRows) {
      try {
        const detail = await fetchDetail(row.detailId);
        const geo = await geocodeAddress(detail.address);
        const permit = {
          loaNr: row.loaNr,
          district: detail.district,
          address: detail.address,
          decision: detail.decision,
          decidedAt: detail.decidedAt,
          validUntil: detail.validUntil,
          detailUrl: detail.detailUrl,
          permitTypes: detail.permitTypes,
          species: detail.species,
          maxDiameterCm: detail.maxDiameterCm,
          valueClass: detail.valueClass,
          lat: geo ? geo[0] : null,
          lng: geo ? geo[1] : null,
        };
        await db.collection('permits').doc(row.loaNr).set(permit);
        newPermits.push(permit);
        console.log(`Lisatud: ${row.loaNr} — ${permit.address}`);
      } catch (e) {
        console.error(`Viga loa ${row.loaNr} tootlemisel:`, e.message);
      }
    }

    const maxLoaNr = Math.max(...newPermits.map((p) => parseInt(p.loaNr, 10)).filter((n) => !isNaN(n)), 0);
    const syncSnap = await db.doc('state/sync').get();
    const prevMax = parseInt((syncSnap.data() || {}).lastLoaNr || 0, 10) || 0;
    await db.doc('state/sync').set(
      {
        lastRunAt: now,
        lastCheckedCount: listRows.length,
        lastNewCount: newPermits.length,
        lastLoaNr: Math.max(prevMax, maxLoaNr),
      },
      { merge: true }
    );
  }

  // ---- Teavitused ----
  // See plokk jookseb iga tunni tagant soltumata sellest, kas seekord leiti
  // uusi lube — vastasel juhul voiks tervituskiri hiljutisele tellijale
  // viibida palju rohkem kui tund, kui portaal parajasti vaikib.
  const transporter = buildTransporter();
  if (!transporter) {
    console.warn('SMTP_USER / SMTP_PASSWORD puudub — e-kirju ei saadeta.');
  } else {
    const subsSnap = await db.collection('subscriptions').where('active', '==', true).get();
    console.log(`Aktiivseid tellimusi: ${subsSnap.size}.`);
    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data();
      const manageLink = `${APP_URL}?manage=${subDoc.id}`;
      try {
        if (!sub.welcomeSent) {
          await sendWelcomeEmail(transporter, sub.email, sub, manageLink);
          await subDoc.ref.update({ welcomeSent: true });
          console.log(`Tervituskiri saadetud: ${sub.email}`);
        }
      } catch (e) {
        console.error(`Tervituskirja saatmine ebaonnestus (${sub.email}):`, e.message);
      }
      if (!newPermits.length) continue;
      try {
        const matches = newPermits.filter((p) => matchesSubscription(sub, p));
        if (!matches.length) continue;
        await sendDigestEmail(transporter, sub.email, matches, manageLink);
        const maxMatched = Math.max(...matches.map((p) => parseInt(p.loaNr, 10)).filter((n) => !isNaN(n)), 0);
        await subDoc.ref.update({ lastNotifiedLoaNr: Math.max(parseInt(sub.lastNotifiedLoaNr || 0, 10), maxMatched) });
        console.log(`Saadetud: ${sub.email} (${matches.length} luba).`);
      } catch (e) {
        console.error(`E-kirja saatmine ebaonnestus (${sub.email}):`, e.message);
      }
    }
  }

  console.log('Valmis.');
}

main().catch((e) => {
  console.error('Skript ebaonnestus:', e);
  process.exit(1);
});
