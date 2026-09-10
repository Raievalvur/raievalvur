function renderSyncPill(){
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  if(!SYNC_STATE){ txt.textContent = 'Andmeid pole veel laaditud'; dot.classList.add('stale'); return; }
  const t = SYNC_STATE.lastRunAt ? new Date(SYNC_STATE.lastRunAt) : null;
  const ageH = t ? (Date.now()-t.getTime())/3.6e6 : 999;
  dot.classList.toggle('stale', ageH > 6);
  txt.textContent = t ? `Uuendatud ${t.toLocaleString('et-EE')}` : 'Uuendamata';
}
