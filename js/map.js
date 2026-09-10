// ---- Kaart: Leaflet + Esri World Imagery kaardiplaadid + suumipõhine klasterdamine ----
// Varem oli siin käsitsi kirjutatud pan/suum ühe staatilise aerofoto peal — see
// nägi suurel suumil hägune välja, sest üks pilt lihtsalt CSS-iga suurendati.
// Leaflet laadib õige resolutsiooniga kaardiplaadi iga suumitaseme jaoks eraldi
// ja Leaflet.markercluster hoolitseb suumipõhise klasterdamise eest.
const TALLINN_BOUNDS = L.latLngBounds([59.35,24.55],[59.50,24.92]);
function valueClassColor(vc){
  if(vc==='V') return '#d1453b';
  if(vc==='IV') return '#e0a83c';
  return '#3fae5c';
}
const VALUE_CLASS_RANK = {V:3, IV:2}; // kõik muu (sh teadmata) on 1 — klastri jaoks valime "halvima" väärtusklassi
function escapeMapText(s){
  return String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

const rvMap = L.map('leafletMap', {minZoom:9, maxZoom:19, zoomControl:true});
rvMap.fitBounds(TALLINN_BOUNDS);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Aerofoto: &copy; Esri, Maxar, Earthstar Geographics'
}).addTo(rvMap);

const rvClusterGroup = L.markerClusterGroup({
  maxClusterRadius: 50,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  iconCreateFunction: function(cluster){
    const children = cluster.getAllChildMarkers();
    let worstRank = 1, worstVc = null;
    children.forEach(m=>{
      const rank = VALUE_CLASS_RANK[m.options.valueClass] || 1;
      if(rank > worstRank || worstVc===null){ worstRank = rank; worstVc = m.options.valueClass; }
    });
    const count = children.length;
    const size = Math.round(Math.min(44, 26 + Math.sqrt(count)*3));
    return L.divIcon({
      html: `<div class="rv-cluster-dot" style="background:${valueClassColor(worstVc)}">${count}</div>`,
      className: '',
      iconSize: [size, size]
    });
  }
});
rvMap.addLayer(rvClusterGroup);

function pinIcon(vc){
  return L.divIcon({
    html: `<div class="rv-pin-dot" style="background:${valueClassColor(vc)}"></div>`,
    className: '',
    iconSize: [14, 14]
  });
}

// Kaardi vahekaart oli laadimise ajal peidetud (display:none), mistõttu Leaflet
// arvutas oma kaardiplaatide võrgu vale (0x0) konteineri suuruse peale —
// mõõdistame ja (esimesel avamisel) kaadreerime kaardi uuesti, kui vahekaart avatakse.
let rvMapEverShown = false;
const mapTabBtn = document.querySelector('.tab-btn[data-view="map"]');
if(mapTabBtn) mapTabBtn.addEventListener('click', ()=>{
  requestAnimationFrame(()=>{
    rvMap.invalidateSize();
    if(!rvMapEverShown){ rvMap.fitBounds(TALLINN_BOUNDS); rvMapEverShown = true; }
  });
});
window.addEventListener('resize', ()=> rvMap.invalidateSize());
document.getElementById('mapZoomReset').addEventListener('click', ()=> rvMap.fitBounds(TALLINN_BOUNDS));

function renderMap(){
  const from = document.getElementById('mapFrom').value;
  const to = document.getElementById('mapTo').value;
  const species = selectedValues(document.getElementById('mSpecies'));
  const reasons = selectedValues(document.getElementById('mReason'));
  const districts = selectedValues(document.getElementById('mDistrict'));
  const minDiam = parseFloat(document.getElementById('mDiam').value)||0;
  const note = document.getElementById('mapNote');
  let shown = 0, skippedNoGeo = 0, skippedOutOfRange = 0, skippedFilter = 0;
  const markers = [];
  const seenLoaNr = new Set(PERMITS.map(p=>p.loaNr));
  const source = ARCHIVE_PERMITS.length ? PERMITS.concat(ARCHIVE_PERMITS.filter(p=>!seenLoaNr.has(p.loaNr))) : PERMITS;
  source.forEach(p=>{
    if(p.lat==null || p.lng==null){ skippedNoGeo++; return; }
    if(from && p.decidedAt && p.decidedAt < from){ skippedOutOfRange++; return; }
    if(to && p.decidedAt && p.decidedAt > to){ skippedOutOfRange++; return; }
    if(districts.length && !districts.includes(p.district)){ skippedFilter++; return; }
    const hasTrees = p.trees && p.trees.length;
    const speciesList = hasTrees ? p.trees.map(t=>t.species) : (p.species||[]);
    const reasonList = hasTrees ? p.trees.map(t=>t.reason) : (p.permitTypes||[]);
    if(species.length && !speciesList.some(s=>species.includes(s))){ skippedFilter++; return; }
    if(reasons.length && !reasonList.some(r=>reasons.includes(r))){ skippedFilter++; return; }
    if(minDiam){
      if(hasTrees){
        if(!p.trees.some(t=>(t.diameterCm||0)>=minDiam)){ skippedFilter++; return; }
      } else if(p.maxDiameterCm!=null && p.maxDiameterCm < minDiam){ skippedFilter++; return; }
    }
    // Kui otsiti konkreetset puuliiki/põhjust, näitame hüpikaknas seda, mitte esimest
    // juhuslikku puud samalt loalt (nt kui otsid "tamm", aga loal on ka kuusk ja pärn,
    // ei tohi tooltip näidata "kuusk" — see tekitab asjatut segadust).
    let matchedTree = hasTrees && species.length ? p.trees.find(t=>species.includes(t.species)) : null;
    if(!matchedTree && hasTrees && reasons.length) matchedTree = p.trees.find(t=>reasons.includes(t.reason));
    const matchedSpeciesFallback = species.length ? (p.species||[]).find(s=>species.includes(s)) : null;
    const matchedReasonFallback = reasons.length ? (p.permitTypes||[]).find(r=>reasons.includes(r)) : null;
    const sp = (matchedTree && matchedTree.species) || matchedSpeciesFallback || (p.trees && p.trees[0] && p.trees[0].species) || (p.species||[])[0] || '—';
    const rs = (matchedTree && matchedTree.reason) || matchedReasonFallback || (p.trees && p.trees[0] && p.trees[0].reason) || (p.permitTypes||[])[0] || '—';

    const marker = L.marker([p.lat, p.lng], {icon: pinIcon(p.valueClass), valueClass: p.valueClass});
    marker.bindTooltip(
      `<strong>${escapeMapText(p.address||'—')}</strong><br>${escapeMapText(sp)}<br>${escapeMapText(rs)}${p.valueClass?`<br>väärtusklass ${escapeMapText(p.valueClass)}`:''}`,
      {direction:'top', className:'rv-tooltip'}
    );
    marker.on('click', ()=> openLocationPopup({title: p.address, lat: p.lat, lng: p.lng}));
    markers.push(marker);
    shown++;
  });

  rvClusterGroup.clearLayers();
  rvClusterGroup.addLayers(markers);

  const bits = [`Kaardil ${shown} luba`];
  if(skippedOutOfRange) bits.push(`${skippedOutOfRange} jääb valitud ajavahemikust välja`);
  if(skippedFilter) bits.push(`${skippedFilter} ei vasta valitud filtritele`);
  if(skippedNoGeo) bits.push(`${skippedNoGeo} ilma täpse aadressita (geo-andmeta)`);
  note.textContent = bits.join(', ') + '. Lähedased load koondatakse suumitasemest sõltuvalt punktideks — suumi hiirerattaga või kaardi + / - nuppudega, lohista kaardi liigutamiseks.';
}
fillMultiSelect(document.getElementById('mSpecies'), SPECIES_LIST, 'Puuliik');
fillMultiSelect(document.getElementById('mReason'), REASON_LIST, 'Põhjus');
fillMultiSelect(document.getElementById('mDistrict'), DISTRICTS, 'Linnaosa');
document.getElementById('mSearchBtn').addEventListener('click', renderMap);
document.getElementById('mapFrom').addEventListener('change', renderMap);
document.getElementById('mapTo').addEventListener('change', renderMap);
document.getElementById('mapPresetRow').innerHTML = ['30 päeva','90 päeva','Kõik'].map(l=>`<button type="button" class="preset-chip" data-preset="${l}">${l}</button>`).join('');
document.getElementById('mapPresetRow').addEventListener('click', (e)=>{
  const chip = e.target.closest('.preset-chip');
  if(!chip) return;
  if(chip.dataset.preset==='Kõik'){
    document.getElementById('mapFrom').value = '';
    document.getElementById('mapTo').value = '';
  } else {
    const days = chip.dataset.preset.startsWith('30') ? 30 : 90;
    const today = new Date();
    const from = new Date(today.getTime() - days*86400000);
    document.getElementById('mapFrom').value = from.toISOString().slice(0,10);
    document.getElementById('mapTo').value = today.toISOString().slice(0,10);
  }
  renderMap();
});
