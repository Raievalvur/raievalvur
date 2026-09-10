function valueClassBadge(vc){
  return vc ? `<span class="vclass-badge vclass-${vc}">${vc}</span>` : '<span class="empty-note" style="padding:0;">&mdash;</span>';
}
function valueClassDot(vc){
  if(vc==='V') return 'dot-red';
  if(vc==='IV') return 'dot-yellow';
  return 'dot-green';
}
function haversineKm(lat1,lng1,lat2,lng2){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.asin(Math.sqrt(a));
}
function fmtDate(s){ return s || '—'; }

let PERMITS = [];
let ARCHIVE_PERMITS = [];
let LEADERBOARD = {issuers:{}, species:{}, reasons:{}, dendrologists:{ready:false, entries:[]}};
let SYNC_STATE = null;

function renderBoard(){
  const mk = (counts, target, maxItems)=>{
    const entries = Object.entries(counts||{}).sort((a,b)=>b[1]-a[1]).slice(0,maxItems);
    const el = document.getElementById(target);
    if(entries.length===0){ el.innerHTML = '<div class="empty-note">Andmeid pole veel kogutud.</div>'; return; }
    const max = entries[0][1];
    el.innerHTML = entries.map((e,i)=>`
      <div class="rank-row">
        <div class="rank">${i+1}</div>
        <div class="bar-wrap"><div class="bar" style="width:${Math.max(6,(e[1]/max*100))}%"></div>
          <div class="bar-label"><span>${e[0]}</span><span class="bar-count">${e[1]}</span></div>
        </div>
      </div>`).join('');
  };
  mk(LEADERBOARD.issuers, 'boardIssuers', 8);
  mk(LEADERBOARD.species, 'boardSpecies', 10);
  mk(LEADERBOARD.reasons, 'boardReasons', 10);
  renderDendro();

  document.getElementById('statPermits').textContent = PERMITS.length;
  const totalTrees = PERMITS.reduce((s,p)=>s+(p.trees?p.trees.length:1),0);
  document.getElementById('statTrees').textContent = totalTrees;
  document.getElementById('statDistricts').textContent = Object.keys(LEADERBOARD.issuers||{}).length || DISTRICTS.length;
}

function renderPermits(){
  const species = selectedValues(document.getElementById('fSpecies'));
  const reasons = selectedValues(document.getElementById('fReason'));
  const districts = selectedValues(document.getElementById('fDistrict'));
  const minDiam = parseFloat(document.getElementById('fDiam').value)||0;
  const lat = selectedLat, lng = selectedLng;
  const radiusM = parseFloat(document.getElementById('fRadius').value)||0;
  const dateFrom = document.getElementById('fDateFrom').value;
  const dateTo = document.getElementById('fDateTo').value;

  const seenLoaNr = new Set(PERMITS.map(p=>p.loaNr));
  const source = ARCHIVE_PERMITS.length ? PERMITS.concat(ARCHIVE_PERMITS.filter(p=>!seenLoaNr.has(p.loaNr))) : PERMITS;

  let rows = source.filter(p=>{
    if(districts.length && !districts.includes(p.district)) return false;
    // Live lubadel on täpne trees[] (üks kirje puu kohta). Arhiivikirjetel on ainult
    // eraldi species[] ja permitTypes[] nimekirjad (mitteseotud puude kaupa), seega
    // kontrollime liiki ja põhjust neist otse, mitte kunstlikult kokku pandud "puust" —
    // vastasel juhul kaob nt mitme liigiga otsus (kuusk+tamm+pärn), kui filtreeritakse "tamm" järgi.
    const hasTrees = p.trees && p.trees.length;
    const speciesList = hasTrees ? p.trees.map(t=>t.species) : (p.species||[]);
    const reasonList = hasTrees ? p.trees.map(t=>t.reason) : (p.permitTypes||[]);
    if(species.length && !speciesList.some(s=>species.includes(s))) return false;
    if(reasons.length && !reasonList.some(r=>reasons.includes(r))) return false;
    // Arhiivi (vanematel) otsustel pole läbimõõtu üldse teada — neid ei tohi
    // diameetri-filtriga automaatselt välja jätta, muidu kaovad kõik vanemad load.
    if(minDiam){
      if(hasTrees){
        if(!p.trees.some(t=>(t.diameterCm||0)>=minDiam)) return false;
      } else if(p.maxDiameterCm!=null && p.maxDiameterCm < minDiam){
        return false;
      }
    }
    if(dateFrom && (!p.decidedAt || p.decidedAt < dateFrom)) return false;
    if(dateTo && (!p.decidedAt || p.decidedAt > dateTo)) return false;
    if(geoMode==='radius' && lat!=null && lng!=null && !isNaN(lat) && !isNaN(lng)){
      if(p.lat==null || p.lng==null) return false;
      if(haversineKm(lat,lng,p.lat,p.lng)*1000 > radiusM) return false;
    }
    return true;
  });
  rows.sort((a,b)=> (b.decidedAt||'').localeCompare(a.decidedAt||''));

  const tbody = document.getElementById('permitBody');
  if(rows.length===0){
    tbody.innerHTML = '<tr><td colspan="7" class="empty-note">Ühtegi luba ei vasta valitud tingimustele.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.slice(0,150).map(p=>{
    const trees = p.trees && p.trees.length ? p.trees
      : (p.species && p.species.length ? p.species.map(sp=>({species:sp, diameterCm:p.maxDiameterCm||null})) : [{species:'—', diameterCm:null}]);
    const treeChips = trees.map(t=>`<span class="tree-chip">${t.species||'—'}${t.diameterCm?` <span class="d">${t.diameterCm}cm</span>`:''}</span>`).join('');
    const reasonTxt = [...new Set(trees.map(t=>t.reason).filter(Boolean))].join(', ') || (p.permitTypes||[]).join(', ');
    const geoBtn = `<button type="button" class="geo-open-btn" data-lat="${p.lat!=null?p.lat:''}" data-lng="${p.lng!=null?p.lng:''}" data-addr="${(p.address||'').replace(/"/g,'&quot;')}">📍 Ava kaardil / Street View</button>`;
    const docLink = p.detailUrl ? `<a class="doclink" href="${p.detailUrl}" target="_blank" rel="noopener">Otsus ${p.loaNr}</a>` : `Otsus ${p.loaNr}`;
    return `<tr>
      <td><div class="addr">${p.address||'—'}</div><span class="district-pill">${p.district||'—'}</span></td>
      <td>${treeChips}</td>
      <td><span class="reason-tag">${reasonTxt||'—'}</span></td>
      <td>${valueClassBadge(p.valueClass)}</td>
      <td>${p.decision||'—'}</td>
      <td class="date-cell">${fmtDate(p.decidedAt)}${p.validUntil?`<br>kuni ${fmtDate(p.validUntil)}`:''}</td>
      <td>
        <div class="linkrow">${docLink}</div>
        <div class="linkrow">${geoBtn}</div>
      </td>
    </tr>`;
  }).join('') + (rows.length>150 ? `<tr><td colspan="7" class="empty-note">Näidatakse esimesed 150 tulemust ${rows.length}-st. Täpsusta otsingut (linnaosa, puuliik, kuupäevad), et kitsendada.</td></tr>` : '');
}

function renderDendro(){
  const wrap = document.getElementById('boardDendro');
  const entries = (LEADERBOARD.dendrologists && LEADERBOARD.dendrologists.entries) || [];
  if(!entries.length){ wrap.innerHTML = '<div class="empty-note">Andmeid pole veel.</div>'; return; }
  const max = Math.max(...entries.map(e=>e.decisionsCount));
  wrap.innerHTML = entries.map((e,i)=>`
    <div class="rank-row dendro-row" data-name="${e.name}" style="cursor:pointer;">
      <div class="rank">${i+1}</div>
      <div class="bar-wrap"><div class="bar" style="width:${Math.max(6,(e.decisionsCount/max*100))}%"></div>
        <div class="bar-label"><span>${e.name}</span><span class="bar-count">${e.decisionsCount}</span></div>
      </div>
    </div>`).join('');
}
document.getElementById('boardDendro').addEventListener('click', (e)=>{
  const row = e.target.closest('.dendro-row');
  if(!row) return;
  const name = row.dataset.name;
  const list = PERMITS.filter(p=>p.dendrologist===name);
  const detail = document.getElementById('dendroDetail');
  if(!list.length){
    detail.innerHTML = `<div class="empty-note">${name}: seotud otsuseid pole veel laaditud.</div>`;
  } else {
    detail.innerHTML = `<div class="desc" style="margin-bottom:8px;"><strong>${name}</strong> &mdash; ${list.length} otsust:</div>` +
      '<div class="sub-list">' + list.slice(0,20).map(p=>`
        <div class="sub-row">
          <div class="meta">${p.address||'—'} &middot; väärtusklass ${p.valueClass||'—'} &middot; ${p.decidedAt||''}</div>
          ${p.detailUrl?`<a href="${p.detailUrl}" target="_blank" rel="noopener">Otsus ${p.loaNr}</a>`:''}
        </div>`).join('') + '</div>';
  }
});
