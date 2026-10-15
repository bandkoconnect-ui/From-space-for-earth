(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const toastEl = $('toast');
  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  const map = L.map('map', { zoomControl: false, preferCanvas: true, scrollWheelZoom: true }).setView([27.72, 85.32], 8);
  const baseTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);

  // Clearly illustrative geometry for interaction design; not derived from satellite analysis.
  const illustrativeFlood = L.polygon([
    [27.86,84.98],[27.93,85.10],[27.87,85.22],[27.92,85.31],[27.81,85.40],
    [27.79,85.55],[27.68,85.49],[27.62,85.35],[27.66,85.24],[27.58,85.12],
    [27.68,85.03],[27.74,84.92],[27.86,84.98]
  ], { color:'#86e4ff', weight:1.4, opacity:.95, fillColor:'#3cbde8', fillOpacity:.3, className:'flood-polygon' }).addTo(map);

  const placeGroup = L.layerGroup();
  const places = [
    {name:'Kathmandu', point:[27.7172,85.3240], type:'Capital · place context'},
    {name:'Trishuli River corridor', point:[27.89,85.08], type:'River corridor · investigate'},
    {name:'Nuwakot area', point:[27.91,85.16], type:'Area of interest · investigate'}
  ];
  places.forEach((place, i) => {
    const icon = L.divIcon({className:'echo-map-pin', html:`<span style="display:block;width:${i===0?9:7}px;height:${i===0?9:7}px;background:${i===0?'#b9f8d8':'#dcebf0'};border:1px solid #14232a;border-radius:50%;box-shadow:0 0 0 4px #a5edcf24,0 0 14px #9af3c699"></span>`, iconSize:[12,12], iconAnchor:[6,6]});
    L.marker(place.point,{icon}).bindPopup(`<div style="font-family:Manrope,sans-serif;color:#eaf2f5;background:#14212a;padding:2px"><b>${place.name}</b><br><span style="color:#9cb0b9;font-size:11px">${place.type}</span><br><small style="color:#8eeac1">Context only — not an impact assessment</small></div>`, {className:'echo-popup'}).addTo(placeGroup);
  });
  placeGroup.addTo(map);

  const dates = [
    {date:'12 AUG 2026', desc:'Before the event · baseline imagery reported by ESA', center:[27.72,85.32], zoom:8},
    {date:'20 AUG 2026', desc:'Between observations · inspect archive coverage', center:[27.78,85.25], zoom:8},
    {date:'27 AUG 2026', desc:'After the event · water visible beyond the usual river channel', center:[27.80,85.22], zoom:9},
    {date:'03 SEP 2026', desc:'Follow-up window · check for persistence and recovery', center:[27.77,85.28], zoom:8}
  ];
  const timeline = $('timeline');
  const progress = $('timelineProgress');
  let playTimer = null;
  function setDate(value, moveMap = false) {
    const i = Number(value);
    $('dateChip').textContent = dates[i].date;
    $('timelineDescription').textContent = dates[i].desc;
    progress.style.width = `${(i/3)*100}%`;
    if (moveMap) map.flyTo(dates[i].center, dates[i].zoom, {duration:.8});
    illustrativeFlood.setStyle({fillOpacity: i === 0 ? .08 : i === 1 ? .18 : i === 2 ? .3 : .2, opacity: i === 0 ? .35 : .95});
    $('playTimeline').textContent = playTimer ? 'Ⅱ' : '▶';
  }
  timeline.addEventListener('input', () => setDate(timeline.value, true));
  $('playTimeline').addEventListener('click', () => {
    if (playTimer) {
      clearInterval(playTimer); playTimer = null; $('playTimeline').textContent = '▶'; return;
    }
    $('playTimeline').textContent = 'Ⅱ';
    playTimer = setInterval(() => {
      const next = (Number(timeline.value) + 1) % 4;
      timeline.value = String(next); setDate(next, true);
    }, 1800);
  });
  function stopTimeline() { if (playTimer) { clearInterval(playTimer); playTimer = null; $('playTimeline').textContent = '▶'; } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTimeline(); });

  $('zoomIn').addEventListener('click', () => map.zoomIn());
  $('zoomOut').addEventListener('click', () => map.zoomOut());
  $('resetView').addEventListener('click', () => map.flyTo([27.72,85.32],8,{duration:.8}));
  map.on('mousemove', (e) => $('coordinates').textContent = `${Math.abs(e.latlng.lat).toFixed(4)}° ${e.latlng.lat >= 0 ? 'N' : 'S'}, ${Math.abs(e.latlng.lng).toFixed(4)}° ${e.latlng.lng >= 0 ? 'E' : 'W'}`);
  map.on('mouseout', () => $('coordinates').textContent = '27.7172° N, 85.3240° E');

  $('baseLayer').addEventListener('change', (e) => {
    if (e.target.checked) baseTiles.addTo(map); else map.removeLayer(baseTiles);
    toast(e.target.checked ? 'Basemap enabled' : 'Basemap hidden');
  });
  $('floodLayer').addEventListener('change', (e) => {
    if (e.target.checked) illustrativeFlood.addTo(map); else map.removeLayer(illustrativeFlood);
    toast(e.target.checked ? 'Illustrative flood layer enabled' : 'Flood layer hidden');
  });
  $('placesLayer').addEventListener('change', (e) => {
    if (e.target.checked) placeGroup.addTo(map); else map.removeLayer(placeGroup);
    toast(e.target.checked ? 'Place context enabled' : 'Place context hidden');
  });
  $('terrainLayer').addEventListener('change', (e) => {
    document.body.classList.toggle('terrain-on', e.target.checked);
    toast(e.target.checked ? 'Relief-style visual filter enabled' : 'Relief-style visual filter disabled');
  });
  $('resetLayers').addEventListener('click', () => {
    $('baseLayer').checked = true; $('floodLayer').checked = true; $('placesLayer').checked = true; $('terrainLayer').checked = false;
    if (!map.hasLayer(baseTiles)) baseTiles.addTo(map);
    if (!map.hasLayer(illustrativeFlood)) illustrativeFlood.addTo(map);
    if (!map.hasLayer(placeGroup)) placeGroup.addTo(map);
    document.body.classList.remove('terrain-on'); toast('Layers reset');
  });

  const compareModal = $('compareModal');
  function openModal(el) { el.classList.add('open'); el.setAttribute('aria-hidden','false'); }
  function closeModal(el) { el.classList.remove('open'); el.setAttribute('aria-hidden','true'); }
  $('compareButton').addEventListener('click', () => openModal(compareModal));
  $('closeCompare').addEventListener('click', () => closeModal(compareModal));
  compareModal.addEventListener('click', e => { if (e.target === compareModal) closeModal(compareModal); });
  const infoModal = $('infoModal');
  $('dataButton').addEventListener('click', () => openModal(infoModal));
  $('closeInfo').addEventListener('click', () => closeModal(infoModal));
  infoModal.addEventListener('click', e => { if (e.target === infoModal) closeModal(infoModal); });
  $('savedButton').addEventListener('click', () => toast('Your first investigation is open. Saved investigations are coming next.'));
  $('newInvestigation').addEventListener('click', () => toast('Investigation builder is planned for the next version.'));

  const inspector = $('inspector');
  function showInspector() { inspector.classList.add('open'); }
  $('closeInspector').addEventListener('click', () => inspector.classList.remove('open'));
  const echoPanel = $('echoPanel');
  function openEcho() { echoPanel.classList.add('open'); echoPanel.setAttribute('aria-hidden','false'); setTimeout(() => $('chatInput').focus(), 120); }
  function closeEcho() { echoPanel.classList.remove('open'); echoPanel.setAttribute('aria-hidden','true'); }
  $('askEchoTop').addEventListener('click', openEcho);
  $('askEchoReport').addEventListener('click', openEcho);
  $('closeEcho').addEventListener('click', closeEcho);
  $('shareButton').addEventListener('click', () => {
    const snapshot = {
      app:'ECHO — Earth Intelligence for Everyone',
      investigation:'Nepal flash flood',
      selectedDate:dates[Number(timeline.value)].date,
      selectedLayers:{basemap:$('baseLayer').checked,floodExtent:$('floodLayer').checked,places:$('placesLayer').checked,terrainStyle:$('terrainLayer').checked},
      status:'Prototype only. The flood polygon is illustrative and is not a validated satellite-derived result.',
      evidence:[
        'https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites',
        'https://dataspace.copernicus.eu/',
        'https://gpm.nasa.gov/data/imerg'
      ],
      exportedAt:new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='echo-nepal-investigation.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('Investigation snapshot exported');
  });

  const responseBank = [
    {keys:['sure','know','evidence','fact','confirmed'], title:'What the sources support', text:'ESA published a before/after Sentinel-2 comparison: 12 August 2026 before the event and 27 August 2026 after it. ESA describes a dramatic increase in river water. That is a reported observation. This prototype does not calculate the inundation boundary or verify damage.', links:[['ESA before / after report','https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites']]},
    {keys:['extent','map','delineat','water','flood'], title:'A defensible flood-mapping workflow', text:'Start with co-registered Sentinel-1 radar scenes before and after the event, then compare backscatter and mask permanent water, steep terrain and radar-shadow effects. If cloud-free Sentinel-2 scenes exist, add optical water indices as a second line of evidence. Validate the result against reference data before reporting area. The blue shape on this map is only illustrative.', links:[['Copernicus Data Space','https://dataspace.copernicus.eu/'],['ESA flood mapping context','https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites']]},
    {keys:['exposed','place','road','building','village','impact','damage'], title:'Exposure needs a spatial overlay', text:'Once a validated flood polygon exists, intersect it with OpenStreetMap roads and buildings, and with authoritative settlement or population data where available. Report counts as potentially intersecting assets—not confirmed damage. Check map completeness, positional accuracy and licensing before publishing.', links:[['OpenStreetMap attribution and license','https://www.openstreetmap.org/copyright']]},
    {keys:['rain','precipitation','weather','cause','why'], title:'Rainfall is context, not proof of cause', text:'NASA GPM IMERG provides satellite-based precipitation estimates that can help describe rainfall around an event. Pair it with local gauges, official reports and catchment context where available. A rainfall overlay alone cannot establish the cause of a specific flood.', links:[['NASA GPM IMERG','https://gpm.nasa.gov/data/imerg']]},
    {keys:['planet','high resolution','commercial'], title:'Where Planet fits', text:'Planet imagery could add finer-grained optical context when the relevant scenes are available and the project has appropriate access. It is commercial data, so API credentials, product availability and licensing need to be handled separately. This demo does not access Planet APIs.', links:[['Planet developer documentation','https://docs.planet.com/develop/apis/data/']]},
    {keys:['source','satellite','data','sentinel'], title:'A practical source stack', text:'Use Sentinel-1 for radar observations that work through cloud cover, Sentinel-2 for optical context when clouds allow, NASA IMERG for precipitation context, a terrain model for slope and elevation, and OpenStreetMap for roads and places. Each layer answers a different question; none should be treated as a complete ground truth on its own.', links:[['Copernicus Data Space','https://dataspace.copernicus.eu/'],['NASA GPM IMERG','https://gpm.nasa.gov/data/imerg'],['OpenStreetMap copyright','https://www.openstreetmap.org/copyright']]}
  ];
  function answerFor(question) {
    const q = question.toLowerCase();
    const found = responseBank.find(item => item.keys.some(key => q.includes(key)));
    return found || {title:'Let’s make the question testable', text:'I would turn that into a specific check: define the location and date window, retrieve the relevant source scenes, record acquisition dates and processing steps, then compare observations and validate the result. I can’t verify live scene availability or compute a real flood result from this front-end prototype.', links:[['ESA Nepal event report','https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites'],['Copernicus Data Space','https://dataspace.copernicus.eu/']]};
  }
  function addUserMessage(text) {
    const div=document.createElement('div'); div.className='user-message'; div.textContent=text; $('chatMessages').appendChild(div);
  }
  function addAssistantMessage(answer) {
    const wrapper=document.createElement('div'); wrapper.className='assistant-message';
    const icon=document.createElement('span'); icon.className='message-icon'; icon.textContent='✳';
    const body=document.createElement('div');
    const title=document.createElement('strong'); title.textContent=answer.title;
    const p=document.createElement('p'); p.textContent=answer.text;
    body.append(title,p);
    if(answer.links && answer.links.length){
      const links=document.createElement('div'); links.style.cssText='display:flex;flex-direction:column;gap:6px;margin-top:9px';
      answer.links.forEach(([label,url])=>{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noreferrer';a.textContent=label+' ↗';a.style.cssText='font-size:9px;color:#9af3c6;text-decoration:none';links.appendChild(a)});
      body.appendChild(links);
    }
    wrapper.append(icon,body); $('chatMessages').appendChild(wrapper); $('chatMessages').scrollTop=$('chatMessages').scrollHeight;
  }
  function submitQuestion(question) {
    const q=question.trim(); if(!q) return;
    addUserMessage(q); $('suggestions').style.display='none'; $('chatInput').value='';
    setTimeout(()=>addAssistantMessage(answerFor(q)),180);
  }
  $('chatForm').addEventListener('submit',e=>{e.preventDefault();submitQuestion($('chatInput').value)});
  $('suggestions').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>submitQuestion(btn.textContent)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal(compareModal);closeModal(infoModal);closeEcho();inspector.classList.remove('open')}});

  setDate(timeline.value, false);
  // Keep the report panel accessible on smaller screens through a top-bar gesture.
  if (window.matchMedia('(max-width: 1250px)').matches) {
    const crumb = document.querySelector('.breadcrumb');
    crumb.style.cursor='pointer'; crumb.title='Open field report'; crumb.addEventListener('click',showInspector);
  }
  window.addEventListener('resize',()=>map.invalidateSize());
})();
