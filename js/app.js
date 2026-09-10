// ---- db wiring (Firebase Firestore) ----
(async function init(){
  let db = null;
  try{ db = FIRESTORE_DB; }catch(e){ db = null; }
  if(!db){
    document.getElementById('syncText').textContent = 'Andmebaas pole hetkel kättesaadav';
    document.getElementById('permitBody').innerHTML = '<tr><td colspan="7" class="empty-note">Andmebaas pole hetkel kättesaadav. Proovi lehte hiljem uuesti värskendada.</td></tr>';
    return;
  }

  db.collection('permits').orderBy('loaNr','desc').limit(300).onSnapshot(snap=>{
    PERMITS = snap.docs.map(d=>d.data());
    PERMITS.forEach(p=>{
      if(p.lat!=null && p.lng!=null && p.address){
        LOCATION_INDEX[`${p.address}, ${p.district}`] = [p.lat, p.lng];
      }
    });
    rebuildLocationOptions();
    renderBoard(); renderPermits(); renderMap();
  }, err=>{ console.error('permits', err); });

  // Historical archive (2020–) — loaded once, sharded across multiple documents
  db.collection('permits_archive').get().then(snap=>{
    const recs = [];
    snap.docs.forEach(d=>{
      const data = d.data() || {};
      (data.records||[]).forEach(r=>{
        recs.push({
          loaNr: r.loaNr,
          district: normalizeDistrict(r.district),
          address: r.address,
          permitTypes: r.permitTypes||[],
          species: r.species||[],
          decision: r.outcome,
          decidedAt: r.decidedAt,
          validUntil: r.validUntil,
          detailUrl: r.detailUrl,
          lat: r.lat!=null ? r.lat : null,
          lng: r.lng!=null ? r.lng : null,
          valueClass: r.valueClass || null,
          archived: true
        });
      });
    });
    ARCHIVE_PERMITS = recs;
    ARCHIVE_PERMITS.forEach(p=>{
      if(p.lat!=null && p.lng!=null && p.address){
        LOCATION_INDEX[`${p.address}, ${p.district}`] = [p.lat, p.lng];
      }
    });
    rebuildLocationOptions();
    renderPermits(); renderMap();
  }).catch(err=>{ console.error('permits_archive', err); });

  db.doc('leaderboard/issuers').onSnapshot(s=>{ LEADERBOARD.issuers = (s.data()||{}).counts || {}; renderBoard(); });
  db.doc('leaderboard/species').onSnapshot(s=>{ LEADERBOARD.species = (s.data()||{}).counts || {}; renderBoard(); });
  db.doc('leaderboard/reasons').onSnapshot(s=>{ LEADERBOARD.reasons = (s.data()||{}).counts || {}; renderBoard(); });
  db.doc('leaderboard/dendrologists').onSnapshot(s=>{ LEADERBOARD.dendrologists = s.data() || {ready:false, entries:[]}; renderBoard(); });
  db.doc('state/sync').onSnapshot(s=>{ SYNC_STATE = s.data()||null; renderSyncPill(); });

  db.collection('subscriptions').where('active','==',true).onSnapshot(s=>{
    document.getElementById('statSubs').textContent = s.size;
  }, err=>{ document.getElementById('statSubs').textContent = '—'; });

  // subscribe form
  document.getElementById('subForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = document.getElementById('subSubmitBtn');
    const toast = document.getElementById('subToast');
    toast.className = 'toast';
    const email = document.getElementById('subEmail').value.trim();
    if(!email){ return; }
    btn.disabled = true; btn.textContent = 'Salvestan…';
    try{
      const lastLoaNr = SYNC_STATE ? (SYNC_STATE.lastLoaNr||0) : 0;
      const addrVal = document.getElementById('subAddress').value.trim();
      const knownLoc = LOCATION_INDEX[addrVal];
      await db.collection('subscriptions').add({
        email,
        minDiameterCm: parseFloat(document.getElementById('subDiam').value)||0,
        species: selectedValues(document.getElementById('subSpecies')),
        reasons: selectedValues(document.getElementById('subReason')),
        districts: selectedValues(document.getElementById('subDistrict')),
        homeAddress: addrVal,
        homeLat: knownLoc ? knownLoc[0] : null,
        homeLng: knownLoc ? knownLoc[1] : null,
        radiusM: parseFloat(document.getElementById('subRadiusM').value)||0,
        active: true,
        createdAt: new Date().toISOString(),
        lastNotifiedLoaNr: lastLoaNr
      });
      toast.textContent = 'Tellimus salvestatud. Teavitused hakkavad tulema järgmiste uute otsuste kohta.';
      toast.className = 'toast ok';
      document.getElementById('subForm').reset();
      document.getElementById('subAddressMatch').textContent = '';
    }catch(err){
      toast.textContent = 'Salvestamine ebaõnnestus: ' + (err && err.message ? err.message : 'tundmatu viga');
      toast.className = 'toast err';
    }
    btn.disabled = false; btn.textContent = 'Telli teavitus';
  });

  document.getElementById('lookupBtn').addEventListener('click', async ()=>{
    const email = document.getElementById('lookupEmail').value.trim();
    const list = document.getElementById('subList');
    if(!email){ return; }
    list.innerHTML = '<div class="empty-note">Otsin&hellip;</div>';
    try{
      const snap = await db.collection('subscriptions').where('email','==',email).get();
      if(snap.empty){ list.innerHTML = '<div class="empty-note">Selle e-postiga tellimusi ei leitud.</div>'; return; }
      list.innerHTML = '';
      snap.docs.forEach(doc=>{
        const d = doc.data();
        const row = document.createElement('div');
        row.className = 'sub-row';
        const bits = [];
        if(d.minDiameterCm) bits.push(`≥${d.minDiameterCm}cm`);
        if(d.districts && d.districts.length) bits.push(d.districts.join(', '));
        if(d.species && d.species.length) bits.push(d.species.join(', '));
        if(d.radiusM) bits.push(`raadius ${d.radiusM}m`);
        row.innerHTML = `<div class="meta">${d.active?'Aktiivne':'Peatatud'} &middot; ${bits.join(' &middot; ') || 'kõik load'}</div>`;
        const btn = document.createElement('button');
        btn.className = 'ghost-btn';
        btn.textContent = d.active ? 'Tühista' : 'Tühistatud';
        btn.disabled = !d.active;
        btn.addEventListener('click', async ()=>{
          btn.disabled = true; btn.textContent = 'Tühistan…';
          try{ await doc_ref_update(doc.id); btn.textContent = 'Tühistatud'; row.querySelector('.meta').textContent = 'Peatatud';}
          catch(e){ btn.textContent = 'Viga'; }
        });
        async function doc_ref_update(id){ await db.doc('subscriptions/'+id).update({active:false}); }
        row.appendChild(btn);
        list.appendChild(row);
      });
    }catch(err){
      list.innerHTML = '<div class="empty-note">Otsimine ebaõnnestus.</div>';
    }
  });
})();
