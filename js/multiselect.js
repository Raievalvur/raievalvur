// ---- multi-select dropdowns (species/reason/district) — rippmenüü koos linnukestega ----
function fillMultiSelect(container, items, labelSingular){
  container.classList.add('ms-dropdown');
  container.innerHTML = `
    <button type="button" class="ms-toggle">${labelSingular}: kõik</button>
    <div class="ms-panel" hidden>
      <input type="text" class="ms-search" placeholder="Otsi…">
      <div class="ms-options">${items.map(i=>`<label class="ms-option"><input type="checkbox" value="${i}"><span>${i}</span></label>`).join('')}</div>
      <div class="ms-actions"><button type="button" class="ms-clear-btn">Tühjenda valik</button></div>
    </div>`;
  const toggle = container.querySelector('.ms-toggle');
  const panel = container.querySelector('.ms-panel');
  const search = container.querySelector('.ms-search');
  const optionsWrap = container.querySelector('.ms-options');
  const clearBtn = container.querySelector('.ms-clear-btn');

  function updateLabel(){
    const checked = optionsWrap.querySelectorAll('input:checked');
    if(checked.length===0) toggle.textContent = `${labelSingular}: kõik`;
    else if(checked.length===1) toggle.textContent = checked[0].value;
    else toggle.textContent = `${labelSingular}: ${checked.length} valitud`;
    toggle.classList.toggle('has-selection', checked.length>0);
  }
  function closePanel(){ panel.hidden = true; toggle.classList.remove('open'); }
  function openPanel(){
    document.querySelectorAll('.ms-panel').forEach(p=>{ if(p!==panel) p.hidden = true; });
    document.querySelectorAll('.ms-toggle').forEach(t=>{ if(t!==toggle) t.classList.remove('open'); });
    panel.hidden = false; toggle.classList.add('open'); search.value=''; filterOptions(); search.focus();
  }
  toggle.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(panel.hidden) openPanel(); else closePanel();
  });
  panel.addEventListener('click', e=>e.stopPropagation());
  function filterOptions(){
    const q = search.value.trim().toLowerCase();
    let anyVisible = false;
    optionsWrap.querySelectorAll('.ms-option').forEach(opt=>{
      const match = opt.textContent.trim().toLowerCase().includes(q);
      opt.style.display = match ? '' : 'none';
      if(match) anyVisible = true;
    });
    let noMatch = optionsWrap.querySelector('.no-match');
    if(!anyVisible){
      if(!noMatch){ noMatch = document.createElement('div'); noMatch.className='no-match'; noMatch.textContent='Vasteid ei leitud'; optionsWrap.appendChild(noMatch); }
    } else if(noMatch){ noMatch.remove(); }
  }
  search.addEventListener('input', filterOptions);
  optionsWrap.addEventListener('change', ()=>{ updateLabel(); container.dispatchEvent(new Event('change')); });
  clearBtn.addEventListener('click', ()=>{
    optionsWrap.querySelectorAll('input:checked').forEach(cb=>cb.checked=false);
    updateLabel();
    container.dispatchEvent(new Event('change'));
  });
  container._closeMsPanel = closePanel;
  updateLabel();
}
document.addEventListener('click', ()=>{
  document.querySelectorAll('.ms-dropdown').forEach(d=>{ if(d._closeMsPanel) d._closeMsPanel(); });
});
fillMultiSelect(document.getElementById('fSpecies'), SPECIES_LIST, 'Puuliik');
fillMultiSelect(document.getElementById('subSpecies'), SPECIES_LIST, 'Puuliik');
fillMultiSelect(document.getElementById('fReason'), REASON_LIST, 'Põhjus');
fillMultiSelect(document.getElementById('subReason'), REASON_LIST, 'Põhjus');
fillMultiSelect(document.getElementById('fDistrict'), DISTRICTS, 'Linnaosa');
fillMultiSelect(document.getElementById('subDistrict'), DISTRICTS, 'Linnaosa');
function selectedValues(container){
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb=>cb.value);
}

document.getElementById('presetRow').innerHTML = DISTRICTS.map(d=>`<button type="button" class="preset-chip" data-lat="${DISTRICT_CENTERS[d][0]}" data-lng="${DISTRICT_CENTERS[d][1]}" data-label="${d} (linnaosa keskus)">${d} keskus</button>`).join('');
