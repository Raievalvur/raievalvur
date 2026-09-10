// ---- Kaart: aerofoto + raielubade asukohatäpid ----
const MAP_BBOX = {minLon:24.55, maxLon:24.92, minLat:59.35, maxLat:59.50};
function mercY(latDeg){ const r = latDeg*Math.PI/180; return Math.log(Math.tan(Math.PI/4 + r/2)); }
const MERC_TOP = mercY(MAP_BBOX.maxLat), MERC_BOTTOM = mercY(MAP_BBOX.minLat);
function latLngToPct(lat,lng){
  const x = (lng - MAP_BBOX.minLon) / (MAP_BBOX.maxLon - MAP_BBOX.minLon) * 100;
  const y = (MERC_TOP - mercY(lat)) / (MERC_TOP - MERC_BOTTOM) * 100;
  return {x,y};
}
let mapPinData = [];

// ---- Kaardi suum ja liigutamine (vanilla JS — CSS transform lõuendil, täpid liiguvad kaasa) ----
const MAP_ZOOM_MIN = 1, MAP_ZOOM_MAX = 7;
let mapZoom = 1, mapPanX = 0, mapPanY = 0;
let mapDragging = false, mapDragMoved = false, mapDragStartX = 0, mapDragStartY = 0, mapPanStartX = 0, mapPanStartY = 0;

function applyMapTransform(){
  const canvas = document.getElementById('mapCanvas');
  if(canvas) canvas.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
  document.getElementById('mapTooltip').hidden = true;
  updateMapPinScale();
}
function updateMapPinScale(){
  // täpid jäävad suumist hoolimata ühesuurusteks: liigume kaanevaate suurendusega
  // kaasa (parent scale(mapZoom)), aga korrutame iga täpi enda skaala pöördväärtusega,
  // nii et lõplik ekraanisuurus jääb konstantseks.
  const inv = 1 / mapZoom;
  document.querySelectorAll('#mapPins .map-pin').forEach(dot=>{
    dot.style.transform = `translate(-50%,-50%) scale(${inv})`;
  });
}
function clampMapPan(w, h){
  const minPanX = -(w * (mapZoom - 1)), minPanY = -(h * (mapZoom - 1));
  mapPanX = Math.min(0, Math.max(minPanX, mapPanX));
  mapPanY = Math.min(0, Math.max(minPanY, mapPanY));
}
function setMapZoom(newZoom, cx, cy){
  const viewport = document.getElementById('mapWrap');
  if(!viewport) return;
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if(!w || !h) return;
  newZoom = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, newZoom));
  if(cx==null || cy==null){ cx = w/2; cy = h/2; }
  const canvasX = (cx - mapPanX) / mapZoom;
  const canvasY = (cy - mapPanY) / mapZoom;
  mapZoom = newZoom;
  mapPanX = cx - canvasX * mapZoom;
  mapPanY = cy - canvasY * mapZoom;
  clampMapPan(w, h);
  applyMapTransform();
}
function mapPctToScreenPx(xPct, yPct){
  const viewport = document.getElementById('mapWrap');
  const w = viewport.clientWidth, h = viewport.clientHeight;
  const canvasX = (xPct/100) * w, canvasY = (yPct/100) * h;
  return { x: canvasX * mapZoom + mapPanX, y: canvasY * mapZoom + mapPanY };
}
(function wireMapZoomPan(){
  const viewport = document.getElementById('mapWrap');
  if(!viewport) return;
  viewport.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    setMapZoom(mapZoom * factor, cx, cy);
  }, {passive:false});
  viewport.addEventListener('mousedown', (e)=>{
    if(e.button !== 0) return;
    mapDragging = true; mapDragMoved = false;
    mapDragStartX = e.clientX; mapDragStartY = e.clientY;
    mapPanStartX = mapPanX; mapPanStartY = mapPanY;
    viewport.classList.add('dragging');
  });
  window.addEventListener('mousemove', (e)=>{
    if(!mapDragging) return;
    const dx = e.clientX - mapDragStartX, dy = e.clientY - mapDragStartY;
    if(Math.abs(dx) > 3 || Math.abs(dy) > 3) mapDragMoved = true;
    if(mapDragMoved){
      mapPanX = mapPanStartX + dx; mapPanY = mapPanStartY + dy;
      const rect = viewport.getBoundingClientRect();
      clampMapPan(rect.width, rect.height);
      applyMapTransform();
    }
  });
  window.addEventListener('mouseup', ()=>{
    if(mapDragging){ mapDragging = false; viewport.classList.remove('dragging'); }
  });
  // Puuteseadmed: ühe sõrmega liigutamine, kahe sõrmega suum
  let touchMode = null, touchStartDist = 0, touchStartZoom = 1;
  viewport.addEventListener('touchstart', (e)=>{
    if(e.touches.length === 1){
      touchMode = 'pan'; mapDragMoved = false;
      mapDragStartX = e.touches[0].clientX; mapDragStartY = e.touches[0].clientY;
      mapPanStartX = mapPanX; mapPanStartY = mapPanY;
    } else if(e.touches.length === 2){
      touchMode = 'zoom';
      const [t1,t2] = e.touches;
      touchStartDist = Math.hypot(t2.clientX-t1.clientX, t2.clientY-t1.clientY);
      touchStartZoom = mapZoom;
    }
  }, {passive:true});
  viewport.addEventListener('touchmove', (e)=>{
    if(touchMode === 'pan' && e.touches.length === 1){
      const dx = e.touches[0].clientX - mapDragStartX, dy = e.touches[0].clientY - mapDragStartY;
      if(Math.abs(dx) > 3 || Math.abs(dy) > 3) mapDragMoved = true;
      mapPanX = mapPanStartX + dx; mapPanY = mapPanStartY + dy;
      const rect = viewport.getBoundingClientRect();
      clampMapPan(rect.width, rect.height);
      applyMapTransform();
    } else if(touchMode === 'zoom' && e.touches.length === 2){
      const [t1,t2] = e.touches;
      const dist = Math.hypot(t2.clientX-t1.clientX, t2.clientY-t1.clientY);
      const rect = viewport.getBoundingClientRect();
      const cx = (t1.clientX+t2.clientX)/2 - rect.left, cy = (t1.clientY+t2.clientY)/2 - rect.top;
      setMapZoom(touchStartZoom * (dist/touchStartDist), cx, cy);
    }
  }, {passive:true});
  viewport.addEventListener('touchend', ()=>{ touchMode = null; });
  document.getElementById('mapZoomIn').addEventListener('click', ()=> setMapZoom(mapZoom * 1.4));
  document.getElementById('mapZoomOut').addEventListener('click', ()=> setMapZoom(mapZoom / 1.4));
  document.getElementById('mapZoomReset').addEventListener('click', ()=>{ mapZoom = 1; mapPanX = 0; mapPanY = 0; applyMapTransform(); });
})();

function renderMap(){
  const wrap = document.getElementById('mapPins');
  if(!wrap) return;
  const from = document.getElementById('mapFrom').value;
  const to = document.getElementById('mapTo').value;
  const species = selectedValues(document.getElementById('mSpecies'));
  const reasons = selectedValues(document.getElementById('mReason'));
  const districts = selectedValues(document.getElementById('mDistrict'));
  const minDiam = parseFloat(document.getElementById('mDiam').value)||0;
  const note = document.getElementById('mapNote');
  let shown = 0, skippedNoGeo = 0, skippedOutOfRange = 0, skippedOffMap = 0, skippedFilter = 0;
  wrap.innerHTML = '';
  mapPinData = [];
  const tip = document.getElementById('mapTooltip');
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
    const {x,y} = latLngToPct(p.lat, p.lng);
    if(x<0||x>100||y<0||y>100){ skippedOffMap++; return; }
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'map-pin ' + valueClassDot(p.valueClass);
    dot.style.left = x+'%'; dot.style.top = y+'%';
    dot.style.transform = `translate(-50%,-50%) scale(${1/mapZoom})`;
    // Kui otsiti konkreetset puuliiki/põhjust, näitame hüpikaknas seda, mitte esimest
    // juhuslikku puud samalt loalt (nt kui otsid "tamm", aga loal on ka kuusk ja pärn,
    // ei tohi tooltip näidata "kuusk" — see tekitab asjatut segadust).
    let matchedTree = hasTrees && species.length ? p.trees.find(t=>species.includes(t.species)) : null;
    if(!matchedTree && hasTrees && reasons.length) matchedTree = p.trees.find(t=>reasons.includes(t.reason));
    const matchedSpeciesFallback = species.length ? (p.species||[]).find(s=>species.includes(s)) : null;
    const matchedReasonFallback = reasons.length ? (p.permitTypes||[]).find(r=>reasons.includes(r)) : null;
    const sp = (matchedTree && matchedTree.species) || matchedSpeciesFallback || (p.trees && p.trees[0] && p.trees[0].species) || (p.species||[])[0] || '—';
    const rs = (matchedTree && matchedTree.reason) || matchedReasonFallback || (p.trees && p.trees[0] && p.trees[0].reason) || (p.permitTypes||[])[0] || '—';
    dot.addEventListener('mouseenter', ()=>{
      tip.innerHTML = `<strong>${p.address||'—'}</strong><br>${sp}<br>${rs}${p.valueClass?`<br>väärtusklass ${p.valueClass}`:''}`;
      const {x:px, y:py} = mapPctToScreenPx(x, y);
      tip.style.left = px+'px'; tip.style.top = py+'px';
      tip.hidden = false;
    });
    dot.addEventListener('mouseleave', ()=>{ tip.hidden = true; });
    dot.addEventListener('click', ()=>{
      if(mapDragMoved) return;
      openLocationPopup({title: p.address, lat: p.lat, lng: p.lng});
    });
    wrap.appendChild(dot);
    mapPinData.push({x,y});
    shown++;
  });
  const bits = [`Kaardil ${shown} luba`];
  if(skippedOutOfRange) bits.push(`${skippedOutOfRange} jääb valitud ajavahemikust välja`);
  if(skippedFilter) bits.push(`${skippedFilter} ei vasta valitud filtritele`);
  if(skippedNoGeo) bits.push(`${skippedNoGeo} ilma täpse aadressita (geo-andmeta)`);
  note.textContent = bits.join(', ') + '. Suumi hiirerattaga või +/- nuppudega, lohista kaardi liigutamiseks.';
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

