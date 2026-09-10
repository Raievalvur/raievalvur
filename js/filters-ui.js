// Tabs
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
  });
});

// Geo toggle
let geoMode = 'all';
document.querySelectorAll('.geo-toggle button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.geo-toggle button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    geoMode = btn.dataset.geo;
    document.getElementById('geoFields').style.display = geoMode==='radius' ? 'flex' : 'none';
    document.getElementById('geoAdvanced').style.display = geoMode==='radius' ? 'block' : 'none';
  });
});
document.getElementById('presetRow').addEventListener('click', (e)=>{
  const chip = e.target.closest('.preset-chip');
  if(!chip) return;
  document.getElementById('fLocationInput').value = chip.dataset.label;
  selectedLat = parseFloat(chip.dataset.lat);
  selectedLng = parseFloat(chip.dataset.lng);
});
['fLat','fLng'].forEach(id=>{
  document.getElementById(id).addEventListener('input', ()=>{
    const lat = parseFloat(document.getElementById('fLat').value);
    const lng = parseFloat(document.getElementById('fLng').value);
    if(!isNaN(lat) && !isNaN(lng)){ selectedLat = lat; selectedLng = lng; }
  });
});
// Kõiki filtreid (puuliik, põhjus, linnaosa, läbimõõt, asukoht/raadius) rakendatakse
// korraga, kui vajutatakse "Otsi" — mitte iga üksiku muudatuse peale eraldi.
document.getElementById('fSearchBtn').addEventListener('click', renderPermits);
document.getElementById('fDateFrom').addEventListener('change', renderPermits);
document.getElementById('fDateTo').addEventListener('change', renderPermits);
document.getElementById('fDatePresetRow').innerHTML = ['30 päeva','90 päeva','1 aasta','Alates 2020','Kõik'].map(l=>`<button type="button" class="preset-chip" data-preset="${l}">${l}</button>`).join('');
document.getElementById('fDatePresetRow').addEventListener('click', (e)=>{
  const chip = e.target.closest('.preset-chip');
  if(!chip) return;
  const today = new Date();
  if(chip.dataset.preset==='Kõik'){
    document.getElementById('fDateFrom').value = '';
    document.getElementById('fDateTo').value = '';
  } else if(chip.dataset.preset==='Alates 2020'){
    document.getElementById('fDateFrom').value = '2020-01-01';
    document.getElementById('fDateTo').value = '';
  } else {
    const days = chip.dataset.preset.startsWith('30') ? 30 : (chip.dataset.preset.startsWith('90') ? 90 : 365);
    const from = new Date(today.getTime() - days*86400000);
    document.getElementById('fDateFrom').value = from.toISOString().slice(0,10);
    document.getElementById('fDateTo').value = today.toISOString().slice(0,10);
  }
  renderPermits();
});
document.querySelector('#view-browse .filters').closest('.panel').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && e.target.tagName !== 'TEXTAREA'){
    e.preventDefault();
    renderPermits();
  }
});
