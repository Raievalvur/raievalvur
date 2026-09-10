// ---- Asukoha hüpikaken (Google Maps / Street View) ----
function openLocationPopup({title, lat, lng}){
  const hasCoord = lat!=null && lng!=null && !isNaN(lat) && !isNaN(lng);
  if(!hasCoord && !title) return;
  const q = encodeURIComponent(`${title||''}, Tallinn`);
  const mapsUrl = hasCoord ? `https://www.google.com/maps?q=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
  const svUrl = hasCoord ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
  document.getElementById('geoPopupTitle').textContent = title || 'Valitud asukoht';
  document.getElementById('geoPopupSub').textContent = hasCoord ? `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}` : 'Täpne asukoht (GPS) pole veel teada — avaneb aadressiotsing Google Mapsis';
  document.getElementById('geoPopupMapsLink').href = mapsUrl;
  document.getElementById('geoPopupSvLink').href = svUrl;
  document.getElementById('geoPopupUrlField').value = svUrl;
  document.getElementById('geoPopupBackdrop').hidden = false;
  document.getElementById('geoPopup').hidden = false;
}
function closeLocationPopup(){
  document.getElementById('geoPopupBackdrop').hidden = true;
  document.getElementById('geoPopup').hidden = true;
}
document.getElementById('geoPopupBackdrop').addEventListener('click', closeLocationPopup);
document.getElementById('geoPopupClose').addEventListener('click', closeLocationPopup);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeLocationPopup(); });
document.getElementById('geoPopupCopyBtn').addEventListener('click', async ()=>{
  const field = document.getElementById('geoPopupUrlField');
  const btn = document.getElementById('geoPopupCopyBtn');
  try{
    await navigator.clipboard.writeText(field.value);
    const old = btn.textContent; btn.textContent = 'Kopeeritud!';
    setTimeout(()=>{ btn.textContent = old; }, 1500);
  }catch(e){
    field.removeAttribute('readonly'); field.focus(); field.select();
    try{ field.setSelectionRange(0, 99999); }catch(e2){}
  }
});
document.getElementById('permitBody').addEventListener('click', (e)=>{
  const btn = e.target.closest('.geo-open-btn');
  if(!btn) return;
  openLocationPopup({title: btn.dataset.addr, lat: parseFloat(btn.dataset.lat), lng: parseFloat(btn.dataset.lng)});
});
