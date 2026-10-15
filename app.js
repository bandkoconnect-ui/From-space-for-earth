(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const toastEl = $('toast');
  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  const map = L.map('map', { zoomControl: false, preferCanvas: true, scrollWheelZoom: true }).setView([27.72, 85.32], 8);
  // Satellite imagery is the default basemap; the English street-map layer has been removed.
  const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagery &copy; Esri and its imagery providers'
  }).addTo(map);
  map.createPane('nasaBeforePane'); map.getPane('nasaBeforePane').style.zIndex = 410;
  map.createPane('nasaAfterPane'); map.getPane('nasaAfterPane').style.zIndex = 420;
  map.getPane('nasaAfterPane').style.clipPath = 'inset(0 0 0 50%)';
  const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
  const GIBS_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor';
  // Use NASA's documented WMS TIME dimension instead of composing WMTS tile URLs.
  // WMS is more tolerant of date changes and lets Leaflet request the correct tile bounds.
  const nasaWmsOptions = { layers:GIBS_LAYER, styles:'', format:'image/png', transparent:false, version:'1.1.1', time:'2026-08-12', uppercase:false, pane:'nasaBeforePane', attribution:'NASA Global Imagery Browse Services (GIBS) · MODIS Terra', crossOrigin:true, keepBuffer:2 };
  const nasaBeforeTiles = L.tileLayer.wms(GIBS_WMS, {...nasaWmsOptions, pane:'nasaBeforePane'});
  const nasaAfterTiles = L.tileLayer.wms(GIBS_WMS, {...nasaWmsOptions, pane:'nasaAfterPane'});
  let nasaTileErrorNotified = false;
  function handleNasaTileError() {
    $('compareSource').textContent = 'NASA GIBS · some imagery tiles unavailable';
    if (!nasaTileErrorNotified) {
      nasaTileErrorNotified = true;
      toast('Some NASA imagery tiles could not load. Try another date or zoom level.');
    }
  }
  function handleNasaTileLoad() {
    $('compareSource').textContent = 'NASA GIBS · MODIS TRUE COLOUR · DAILY COMPOSITE';
    nasaTileErrorNotified = false;
  }
  nasaBeforeTiles.on('tileerror', handleNasaTileError);
  nasaAfterTiles.on('tileerror', handleNasaTileError);
  nasaBeforeTiles.on('tileload', handleNasaTileLoad);
  nasaAfterTiles.on('tileload', handleNasaTileLoad);
  function toIsoDate(displayDate) {
    const match = String(displayDate).match(/^(\d{2}) ([A-Z]{3}) (\d{4})$/);
    if (!match) return new Date().toISOString().slice(0,10);
    const months = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
    return `${match[3]}-${months[match[2]] || '01'}-${match[1]}`;
  }
  function setNasaDateLayers() {
    const beforeDate = toIsoDate(active.dates[0].date);
    const selectedDate = active.dates[Number($('timeline')?.value || 2)].date;
    const afterDate = toIsoDate(selectedDate);
    nasaBeforeTiles.setParams({time:beforeDate}, false);
    nasaAfterTiles.setParams({time:afterDate}, false);
    if (map.hasLayer(nasaBeforeTiles)) nasaBeforeTiles.redraw();
    if (map.hasLayer(nasaAfterTiles)) nasaAfterTiles.redraw();
    $('beforeLabel').textContent = `BEFORE · ${active.dates[0].date}`;
    $('afterLabel').textContent = `AFTER · ${selectedDate}`;
  }
  function setCompare(value) {
    const v = Math.max(0,Math.min(100,Number(value)));
    map.getPane('nasaAfterPane').style.clipPath = `inset(0 0 0 ${v}%)`;
    $('compareDivider').style.left = `${v}%`;
  }
  function setCompareVisibility(open) {
    const el = $('mapCompare'); el.classList.toggle('open',open); el.setAttribute('aria-hidden',String(!open));
    if (open) {
      setNasaDateLayers();
      if (!map.hasLayer(nasaBeforeTiles)) nasaBeforeTiles.addTo(map);
      if (!map.hasLayer(nasaAfterTiles)) nasaAfterTiles.addTo(map);
      setCompare($('compareSlider').value);
    } else { map.removeLayer(nasaBeforeTiles); map.removeLayer(nasaAfterTiles); }
    $('compareLayer').checked = open;
    $('compareButton').innerHTML = open ? '× Close comparison' : '<span>◫</span> Compare before / after';
  }

  const investigations = {
    nepal: {
      id:'001', title:'Nepal · Flash flood', crumb:'Nepal flash flood', mapTitle:'When the river<br/>rewrote the map.', subtitle:'Central Nepal <span>·</span> August 2026', legend:'Potential inundation', legendSub:'Conceptual overlay · not a validated flood map', center:[27.72,85.32], zoom:8,
      points:[
        {name:'Kathmandu', point:[27.7172,85.3240], type:'Capital · place context'},
        {name:'Trishuli River corridor', point:[27.89,85.08], type:'River corridor · investigate'},
        {name:'Nuwakot area', point:[27.91,85.16], type:'Area of interest · investigate'},
        {name:'Dhading corridor', point:[27.86,84.91], type:'River valley · inspect source imagery'},
        {name:'Gorkha area', point:[28.00,84.63], type:'Regional context · not an impact assessment'}
      ], dates:[
        {date:'12 AUG 2026', desc:'Before the event · baseline observation window', center:[27.72,85.32], zoom:8},
        {date:'20 AUG 2026', desc:'Between observations · check source archive coverage', center:[27.78,85.25], zoom:8},
        {date:'27 AUG 2026', desc:'After the event · compare river water in the source imagery', center:[27.80,85.22], zoom:9},
        {date:'03 SEP 2026', desc:'Follow-up window · investigate persistence and recovery', center:[27.77,85.28], zoom:8}
      ], evidence:[
        ['ESA','Before / after satellite images','12 Aug vs 27 Aug · reported observation','https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites'],
        ['EU','Copernicus Data Space','Explore Sentinel archive','https://dataspace.copernicus.eu/'],
        ['N','NASA GPM / IMERG','Satellite precipitation estimates','https://gpm.nasa.gov/data/imerg']
      ], pointsHtml:[
        ['Verify the event boundary','Compare source scenes and record acquisition dates.'],['Check exposed places','Overlay roads and settlements only after validation.'],['Review rainfall context','Compare satellite estimates with local reports.']
      ], sourceText:'ESA reports expanded river water in imagery. The blue map shape is illustrative only and does not represent a measured flood boundary.'
    },
    amazon: {
      id:'002', title:'Amazon · Forest change', crumb:'Amazon forest change', mapTitle:'A forest in<br/>transition.', subtitle:'Brazilian Amazon <span>·</span> Illustrative case study', legend:'Areas to investigate', legendSub:'Illustrative focus area · not a deforestation map', center:[-3.4653,-62.2159], zoom:7,
      points:[
        {name:'Manaus', point:[-3.1190,-60.0217], type:'Regional hub · place context'},
        {name:'Rio Negro corridor', point:[-2.95,-62.1], type:'River corridor · inspect imagery'},
        {name:'Forest edge · west', point:[-3.48,-63.0], type:'Illustrative area of interest'},
        {name:'Forest edge · south', point:[-4.1,-62.4], type:'Illustrative area of interest'},
        {name:'Amazonas region', point:[-3.7,-61.6], type:'Regional context · not an impact assessment'}
      ], dates:[
        {date:'01 JUN 2025', desc:'Baseline window · establish a comparable forest-cover reference', center:[-3.4653,-62.2159], zoom:7},
        {date:'01 JUL 2025', desc:'Comparison window · inspect cloud-free optical coverage', center:[-3.55,-62.45], zoom:7},
        {date:'01 AUG 2025', desc:'Review window · compare possible land-cover changes', center:[-3.65,-62.3], zoom:8},
        {date:'01 SEP 2025', desc:'Follow-up window · validate any change against source data', center:[-3.5,-62.1], zoom:7}
      ], evidence:[
        ['EU','Copernicus Data Space','Sentinel-2 optical archive','https://dataspace.copernicus.eu/'],
        ['GFW','Global Forest Watch','Forest monitoring context and datasets','https://www.globalforestwatch.org/'],
        ['N','NASA Earthdata','Earth observation data access','https://earthdata.nasa.gov/']
      ], pointsHtml:[
        ['Find comparable scenes','Check acquisition dates, cloud cover and resolution.'],['Separate change from seasonality','Compare like-for-like periods before drawing conclusions.'],['Validate potential loss','Cross-check a change signal with trusted reference data.']
      ], sourceText:'This is a demonstration investigation for exploring a forest-change workflow. No actual deforestation detection has been run, and all focus areas are illustrative.'
    }
  };
  try { const saved=JSON.parse(localStorage.getItem('echo-custom-investigations')||'{}'); Object.assign(investigations,saved); } catch(_) {}
  let activeKey = 'nepal';
  let active = investigations[activeKey];
  let markerLayer = L.layerGroup().addTo(map);
  let activeEventLayer = null;
  let rainLayer = L.layerGroup();
  let playTimer = null;

  function makeMarkerIcon(isPrimary) {
    const size = isPrimary ? 10 : 7;
    return L.divIcon({className:'echo-map-pin', html:`<span style="display:block;width:${size}px;height:${size}px;background:${isPrimary?'#b9f8d8':'#dcebf0'};border:1px solid #14232a;border-radius:50%;box-shadow:0 0 0 4px #a5edcf24,0 0 14px #9af3c699"></span>`, iconSize:[size+4,size+4], iconAnchor:[(size+4)/2,(size+4)/2]});
  }
  function addMarkers() {
    markerLayer.clearLayers();
    active.points.forEach((point, i) => {
      const html = `<div style="font-family:Arial,sans-serif;color:#eaf2f5;background:#14212a;padding:4px"><b>${point.name}</b><br><span style="color:#9cb0b9;font-size:11px">${point.type}</span><br><small style="color:#8eeac1">Investigation point · verify with source data</small></div>`;
      L.marker(point.point,{icon:makeMarkerIcon(i===0)}).bindPopup(html,{className:'echo-popup'}).addTo(markerLayer);
    });
  }
  function drawEventLayer() {
    if (activeEventLayer) map.removeLayer(activeEventLayer);
    if (activeKey === 'nepal') {
      activeEventLayer = L.polygon([[27.86,84.98],[27.93,85.10],[27.87,85.22],[27.92,85.31],[27.81,85.40],[27.79,85.55],[27.68,85.49],[27.62,85.35],[27.66,85.24],[27.58,85.12],[27.68,85.03],[27.74,84.92],[27.86,84.98]],{color:'#86e4ff',weight:1.2,opacity:.8,fillColor:'#3cbde8',fillOpacity:.22,className:'flood-polygon'});
    } else if (activeKey === 'amazon') {
      activeEventLayer = L.polygon([[-3.22,-62.78],[-3.0,-62.54],[-3.28,-62.23],[-3.18,-61.95],[-3.62,-61.8],[-3.9,-62.08],[-3.8,-62.45],[-3.52,-62.72],[-3.22,-62.78]],{color:'#a7e8ae',weight:1.2,opacity:.8,fillColor:'#6abf7b',fillOpacity:.2,className:'forest-polygon'});
    } else {
      activeEventLayer = L.circle(active.center,{radius:12000,color:'#9af3c6',weight:1.2,opacity:.8,fillColor:'#9af3c6',fillOpacity:.12,className:'custom-area'}).bindTooltip('User-defined area of interest · illustrative only');
    }
    if ($('floodLayer').checked) activeEventLayer.addTo(map);
    rainLayer.clearLayers();
    const rainCenter = active.center;
    [[-.18,-.15],[.12,.2],[-.04,.32]].forEach((delta,i)=>L.circle([rainCenter[0]+delta[0],rainCenter[1]+delta[1]],{radius:activeKey==='nepal'?11000+i*3000:18000+i*4000,color:'#f3bd70',weight:1,fillColor:'#f3bd70',fillOpacity:.10}).bindTooltip('Illustrative rainfall context — not measured data').addTo(rainLayer));
    if ($('rainLayer').checked) rainLayer.addTo(map);
  }
  function renderInvestigation() {
    document.querySelectorAll('.investigation-card').forEach(el=>el.classList.toggle('selected',el.dataset.key===activeKey));
    document.querySelector('.breadcrumb strong').textContent=active.crumb;
    $('mapTitle').innerHTML=active.mapTitle;
    $('mapSubtitle').innerHTML=active.subtitle;
    document.querySelectorAll('.timeline-labels span').forEach((el,i)=>{el.textContent=active.dates[i].date.replace(' 2026','').replace(' 2025','');});
    setNasaDateLayers();
    $('legendTitle').textContent=active.legend;
    $('legendSubtitle').textContent=active.legendSub;
    document.querySelector('.inspector-head .eyebrow').textContent=`FIELD REPORT · ${active.id}`;
    document.querySelector('.report-date strong').textContent=active.dates[Number($('timeline').value)].date.replace(/(\d{2}) (\w{3}) (\d{4})/,'$1 $2 $3');
    document.querySelector('.insight-callout strong').textContent=activeKey==='nepal'?'A river, out of bounds.':activeKey==='amazon'?'A forest under observation.':'A place to investigate.';
    document.querySelector('.insight-callout p').textContent=active.sourceText;
    document.querySelector('.insight-callout a').href=active.evidence[0][3];
    document.querySelector('.metric-grid .metric strong').textContent=activeKey==='nepal'?'12–27':`${active.dates[0].date.slice(0,6)}–${active.dates[2].date.slice(0,6)}`;
    document.querySelector('.metric-grid .metric small').textContent='Before / after date windows';
    document.querySelector('.metric-grid .metric:nth-child(2) strong').textContent='MODIS Terra';
    document.querySelector('.metric-grid .metric:nth-child(2) small').textContent='Daily composite · coarse resolution';
    const evidence = document.querySelector('.report-section .section-heading');
    const evidenceSection = [...document.querySelectorAll('.report-section')].find(el=>el.querySelector('.evidence-row'));
    evidenceSection.querySelectorAll('.evidence-row').forEach((row,i)=>{
      const item=active.evidence[i]; if(!item) return;
      row.href=item[3]; row.querySelector('.source-badge').textContent=item[0]; row.querySelector('strong').textContent=item[1]; row.querySelector('small').textContent=item[2];
    });
    $('evidenceCount').textContent=`${String(active.evidence.length).padStart(2,'0')} SOURCES`;
    $('investigationPoints').innerHTML=active.pointsHtml.map((point,i)=>`<button class="investigation-point" data-point="${i}"><span>${String(i+1).padStart(2,'0')}</span><span><strong>${point[0]}</strong><small>${point[1]}</small></span><i>↗</i></button>`).join('');
    $('investigationPoints').querySelectorAll('button').forEach((button,i)=>button.addEventListener('click',()=>{openEcho();$('chatInput').value=active.pointsHtml[i][0];toast('Investigation question ready in Ask ECHO');}));
    $('echo-context').innerHTML=`<span class="live-dot"></span> CONTEXT: ${active.crumb.toUpperCase()} · ${active.id}`;
    $('chatMessages').innerHTML=`<div class="assistant-message"><span class="message-icon">✳</span><div><strong>Let's investigate, not guess.</strong><p>${activeKey==='nepal'?'I can help explore flood evidence and plan a defensible analysis.':'I can help plan a forest-change investigation and separate potential signals from verified change.'} I’ll flag what this prototype cannot verify.</p></div></div>`;
    addMarkers(); drawEventLayer();
    if ($('satelliteLayer').checked && !map.hasLayer(satelliteTiles)) satelliteTiles.addTo(map);
    map.flyTo(active.center,active.zoom,{duration:.7});
    setDate($('timeline').value,false);
    renderDashboard();
  }

  const dates = active.dates;
  const timeline = $('timeline');
  const progress = $('timelineProgress');
  function setDate(value, moveMap = false) {
    const i = Number(value); const d=active.dates[i];
    $('dateChip').textContent=d.date;
    $('timelineDescription').textContent=d.desc;
    progress.style.width=`${(i/3)*100}%`;
    // Timeline changes imagery only. The user's map center and zoom stay exactly where they are.
    if(activeEventLayer) activeEventLayer.setStyle({fillOpacity:i===0?.08:i===1?.14:i===2?.22:.16,opacity:i===0?.35:.8});
    document.querySelector('.report-date strong').textContent=d.date.replace(/(\d{2}) (\w{3}) (\d{4})/,'$1 $2 $3');
    $('playTimeline').textContent=playTimer?'Ⅱ':'▶';
    setNasaDateLayers();
  }
  timeline.addEventListener('input',()=>setDate(timeline.value,false));
  $('playTimeline').addEventListener('click',()=>{
    if(playTimer){clearInterval(playTimer);playTimer=null;$('playTimeline').textContent='▶';return;}
    if(Number(timeline.value)>=3) timeline.value='0';
    $('playTimeline').textContent='Ⅱ';
    playTimer=setInterval(()=>{
      const next=Number(timeline.value)+1;
      if(next>3){clearInterval(playTimer);playTimer=null;$('playTimeline').textContent='▶';return;}
      timeline.value=String(next);setDate(next,false);
    },1500);
  });
  function stopTimeline(){if(playTimer){clearInterval(playTimer);playTimer=null;$('playTimeline').textContent='▶';}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTimeline();});

  $('zoomIn').addEventListener('click',()=>map.zoomIn());
  $('zoomOut').addEventListener('click',()=>map.zoomOut());
  $('resetView').addEventListener('click',()=>map.flyTo(active.center,active.zoom,{duration:.6}));
  map.on('mousemove',e=>$('coordinates').textContent=`${Math.abs(e.latlng.lat).toFixed(4)}° ${e.latlng.lat>=0?'N':'S'}, ${Math.abs(e.latlng.lng).toFixed(4)}° ${e.latlng.lng>=0?'E':'W'}`);
  map.on('mouseout',()=>$('coordinates').textContent=`${active.center[0].toFixed(4)}° ${active.center[0]>=0?'N':'S'}, ${Math.abs(active.center[1]).toFixed(4)}° ${active.center[1]>=0?'E':'W'}`);

  $('satelliteLayer').addEventListener('change',e=>{
    if(e.target.checked){satelliteTiles.addTo(map);}else{map.removeLayer(satelliteTiles);}
    toast(e.target.checked?'Satellite basemap enabled':'Satellite basemap hidden');
  });
  $('compareLayer').addEventListener('change',e=>{setCompareVisibility(e.target.checked);if(e.target.checked)toast('Real NASA MODIS imagery loaded where available');});
  $('floodLayer').addEventListener('change',e=>{if(!activeEventLayer)drawEventLayer();else if(e.target.checked)activeEventLayer.addTo(map);else map.removeLayer(activeEventLayer);toast(e.target.checked?'Illustrative event overlay enabled':'Event overlay hidden');});
  $('placesLayer').addEventListener('change',e=>{if(e.target.checked)markerLayer.addTo(map);else map.removeLayer(markerLayer);toast(e.target.checked?'Investigation points shown':'Investigation points hidden');});
  $('rainLayer').addEventListener('change',e=>{if(e.target.checked)rainLayer.addTo(map);else map.removeLayer(rainLayer);toast(e.target.checked?'Illustrative rainfall context shown':'Illustrative rainfall context hidden');});
  $('resetLayers').addEventListener('click',()=>{
    $('satelliteLayer').checked=true;satelliteTiles.addTo(map);
    $('compareLayer').checked=false;setCompareVisibility(false);
    $('floodLayer').checked=false;if(activeEventLayer)map.removeLayer(activeEventLayer);
    $('placesLayer').checked=true;markerLayer.addTo(map);$('rainLayer').checked=false;map.removeLayer(rainLayer);
    toast('Layers reset to satellite basemap and investigation points');
  });

  // Dated NASA GIBS imagery lives in map panes; swipe clipping never changes map zoom or position.
  const compareSlider=$('compareSlider');
  compareSlider.addEventListener('input',()=>setCompare(compareSlider.value));
  $('compareButton').addEventListener('click',()=>setCompareVisibility(!$('mapCompare').classList.contains('open')));

  function openModal(el){el.classList.add('open');el.setAttribute('aria-hidden','false');}
  function closeModal(el){el.classList.remove('open');el.setAttribute('aria-hidden','true');}
  const infoModal=$('infoModal');
  $('dataButton').addEventListener('click',()=>openModal(infoModal));
  $('closeInfo').addEventListener('click',()=>closeModal(infoModal));
  infoModal.addEventListener('click',e=>{if(e.target===infoModal)closeModal(infoModal);});
  const dashboardView=$('dashboardView');
  const appShell=document.querySelector('.app-shell');
  const brandMark=document.querySelector('.brand-mark');
  function showDashboard(view='home'){
    stopTimeline();
    const investigationsOnly=view==='investigations';
    document.querySelector('.breadcrumb strong').textContent=investigationsOnly?'My investigations':'Dashboard';
    document.querySelector('.workspace').classList.add('dashboard-mode');
    appShell.classList.add('dashboard-mode');
    dashboardView.classList.add('active');
    dashboardView.classList.toggle('investigations-only',investigationsOnly);
    dashboardView.setAttribute('aria-hidden','false');
    document.querySelectorAll('.rail-button').forEach(b=>b.classList.remove('active'));
    $('savedButton').classList.toggle('active',investigationsOnly);
    brandMark.classList.toggle('active',!investigationsOnly);
    renderDashboard();
    if(!investigationsOnly)loadPlanetPulse();
    setTimeout(()=>map.invalidateSize(),80);
  }
  function showMap(){
    document.querySelector('.breadcrumb strong').textContent=active.crumb;
    document.querySelector('.workspace').classList.remove('dashboard-mode');
    appShell.classList.remove('dashboard-mode');
    dashboardView.classList.remove('active','investigations-only');
    dashboardView.setAttribute('aria-hidden','true');
    document.querySelectorAll('.rail-button').forEach(b=>b.classList.remove('active'));
    $('exploreButton').classList.add('active');
    brandMark.classList.remove('active');
    setTimeout(()=>map.invalidateSize(),80);
  }
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  const caseImages={
    nepal:'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=85',
    amazon:'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=1200&q=85',
    custom:'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&q=85'
  };
  function renderDashboard(){
    const entries=Object.entries(investigations);$('dashboardCount').textContent=String(entries.length).padStart(2,'0');
    $('dashboardInvestigations').innerHTML=entries.map(([key,item],i)=>{const image=caseImages[key]||caseImages.custom;const kind=key==='nepal'?'Nepal · flood & river systems':key==='amazon'?'Amazon · forest monitoring':(item.subtitle||'Earth observation').replace(/<[^>]+>/g,'');return `<button class="dashboard-investigation" data-key="${escapeHtml(key)}"><span class="dashboard-card-art ${key==='nepal'?'nepal-art':key==='amazon'?'amazon-art':'custom-art'}" style="--case-image:url('${image}')"><span>FIELD NOTE ${String(i+1).padStart(3,'0')}</span><i>↗</i><b class="case-image-caption">${escapeHtml(kind)}</b></span><span class="dashboard-card-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle.replace(/<[^>]+>/g,''))}</small><em>${escapeHtml(item.isCustom?'Personal workspace':key==='nepal'?'Historical event':'Case study')}</em></span></button>`;}).join('');
  }
  function selectInvestigation(key){if(!investigations[key])return;stopTimeline();activeKey=key;active=investigations[key];timeline.value=key==='nepal'?'2':(investigations[key].isCustom?'3':'2');timeline.max='3';showMap();renderInvestigation();$('echo-context').innerHTML=`<span class="live-dot"></span> CONTEXT: ${escapeHtml(active.crumb.toUpperCase())} · ${escapeHtml(active.id)}`;toast(`${active.title} opened`);}
  $('exploreButton').addEventListener('click',showMap);
  $('savedButton').addEventListener('click',()=>showDashboard('investigations'));
  document.querySelector('.brand-mark').addEventListener('click',e=>{e.preventDefault();showDashboard('home');});
  document.querySelector('.sidebar').addEventListener('click',e=>{const card=e.target.closest('.investigation-card');if(card&&card.dataset.key)selectInvestigation(card.dataset.key);});
  $('dashboardInvestigations').addEventListener('click',e=>{const card=e.target.closest('.dashboard-investigation');if(card)selectInvestigation(card.dataset.key);});
  $('dashboardViewAll').addEventListener('click',showMap);
  $('newInvestigation').addEventListener('click',()=>openModal(newInvestigationModal));
  $('dashboardNewInvestigation').addEventListener('click',()=>openModal(newInvestigationModal));
  $('dashboardNewFromList').addEventListener('click',()=>openModal(newInvestigationModal));

  const inspector=$('inspector');
  function showInspector(){inspector.classList.add('open');}
  $('closeInspector').addEventListener('click',()=>inspector.classList.remove('open'));
  const echoPanel=$('echoPanel');
  function openEcho(){echoPanel.classList.add('open');echoPanel.setAttribute('aria-hidden','false');setTimeout(()=>$('chatInput').focus(),100);}
  function closeEcho(){echoPanel.classList.remove('open');echoPanel.setAttribute('aria-hidden','true');}
  $('askEchoTop').addEventListener('click',openEcho);$('askEchoReport').addEventListener('click',openEcho);$('closeEcho').addEventListener('click',closeEcho);

  const newInvestigationModal=$('newInvestigationModal');
  $('closeNewInvestigation').addEventListener('click',()=>closeModal(newInvestigationModal));
  newInvestigationModal.addEventListener('click',e=>{if(e.target===newInvestigationModal)closeModal(newInvestigationModal);});
  $('newInvestigationForm').addEventListener('submit',e=>{
    e.preventDefault();
    const title=$('newTitle').value.trim(),lat=Number($('newLat').value),lng=Number($('newLng').value),topic=$('newTopic').value;
    if(!title||!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -85||lat > 85||lng < -180||lng > 180){toast('Please enter a name and valid coordinates');return;}
    const key='custom_'+Date.now().toString(36);const now=new Date();const dates=[0,1,2,3].map((offset)=>{const d=new Date(now);d.setUTCDate(d.getUTCDate()-offset*16);const month=d.toLocaleString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase();return {date:`${String(d.getUTCDate()).padStart(2,'0')} ${month} ${d.getUTCFullYear()}`,desc:offset===0?'Current observation window · inspect available imagery':`Historical comparison window · ${offset*16} days earlier`,center:[lat,lng],zoom:7};}).reverse();
    const topicLabel=({environment:'Environmental change',flood:'Water and flood watch',forest:'Forest change',fire:'Wildfire monitoring',urban:'Urban growth',other:'Earth observation'})[topic]||'Earth observation';
    const item={id:String(Object.keys(investigations).length+1).padStart(3,'0'),title,crumb:title,mapTitle:'A new question.<br/>A changing planet.',subtitle:`${lat.toFixed(3)}°, ${lng.toFixed(3)}° <span>·</span> ${topicLabel}`,legend:'Area to investigate',legendSub:'No automated change detection has been run',center:[lat,lng],zoom:7,isCustom:true,topic,points:[{name:'Selected location',point:[lat,lng],type:'User-defined area of interest'},{name:'Northwest context',point:[Math.min(84,lat+.12),lng-.15],type:'Nearby context · inspect imagery'},{name:'Southeast context',point:[Math.max(-84,lat-.12),lng+.15],type:'Nearby context · inspect imagery'}],dates,evidence:[['NASA','NASA GIBS imagery','Daily MODIS true-colour composite','https://nasa-gibs.github.io/gibs-api-docs/'],['EU','Copernicus Data Space','Sentinel archive for higher-resolution follow-up','https://dataspace.copernicus.eu/'],['EONET','NASA EONET','Active Earth events','https://eonet.gsfc.nasa.gov/']],pointsHtml:[['Inspect available imagery','Check dates, cloud cover and native resolution.'],['Compare change signals','Treat visible differences as hypotheses, not verified change.'],['Validate with source data','Use higher-resolution sources and independent reference data.']],sourceText:'This is a new user-created investigation workspace. NASA MODIS imagery can provide broad context, but no event detection or change measurement has been run.'};
    investigations[key]=item;try{localStorage.setItem('echo-custom-investigations',JSON.stringify(Object.fromEntries(Object.entries(investigations).filter(([k,v])=>v.isCustom))));}catch(_){}
    const card=document.createElement('button');card.className='investigation-card';card.dataset.key=key;card.innerHTML=`<div class="thumb custom-thumb"><span class="thumb-tag">FIELD NOTE ${item.id}</span><span class="thumb-contour"></span></div><div class="investigation-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(topicLabel)} <i class="status-dot"></i> Personal workspace</span></div><svg class="chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>`;$('newInvestigation').before(card);
    closeModal(newInvestigationModal);$('newInvestigationForm').reset();$('newLat').value=lat;$('newLng').value=lng;renderDashboard();selectInvestigation(key);toast('Investigation created in this browser');
  });
  let planetPulseLoaded=false;
  async function loadPlanetPulse(){if(planetPulseLoaded)return;planetPulseLoaded=true;const holder=$('planetNews');try{const res=await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=6',{headers:{Accept:'application/json'}});if(!res.ok)throw new Error('NASA EONET unavailable');const data=await res.json();const events=(data.events||[]).slice(0,6);if(!events.length)throw new Error('No active events returned');holder.innerHTML=events.map(ev=>{const geom=(ev.geometry||[]).slice(-1)[0];const date=geom?.date?new Date(geom.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Date not provided';const category=(ev.categories||[]).map(c=>c.title).join(' · ')||'Earth event';const source=(ev.sources||[])[0]?.url||'https://eonet.gsfc.nasa.gov/';return `<a class="planet-news-card" href="${escapeHtml(source)}" target="_blank" rel="noreferrer"><span class="news-type">${escapeHtml(category)}</span><strong>${escapeHtml(ev.title||'Untitled event')}</strong><small>Updated ${escapeHtml(date)}</small><i>Open source ↗</i></a>`;}).join('');}catch(err){holder.innerHTML='<div class="news-fallback"><strong>Planet Pulse is temporarily unavailable.</strong><p>Open NASA EONET to explore active wildfires, storms, volcanoes and other Earth events.</p><a href="https://eonet.gsfc.nasa.gov/" target="_blank" rel="noreferrer">Explore live events ↗</a></div>';}}

  $('shareButton').addEventListener('click',()=>{
    const snapshot={app:'ECHO — Earth Intelligence for Everyone',investigation:active.title,selectedDate:active.dates[Number(timeline.value)].date,selectedLayers:{satelliteBasemap:$('satelliteLayer').checked,nasaDateComparison:$('compareLayer').checked,eventOverlay:$('floodLayer').checked,investigationPoints:$('placesLayer').checked,rainfallContext:$('rainLayer').checked},status:'The swipe uses real NASA MODIS true-colour daily composite imagery at coarse resolution. Illustrative event geometry and rainfall context are not measured results; no automated satellite analysis is performed.',evidence:active.evidence.map(x=>x[3]),exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`echo-${activeKey}-investigation.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Investigation snapshot exported');
  });

  const responseBank=[
    {keys:['sure','know','evidence','fact','confirmed'],title:'What the sources support',text:'For the Nepal case, ESA reports increased river water in before/after Sentinel-2 imagery. For the Amazon case, this demo does not establish that forest loss occurred. In both cases, the map shapes are illustrative and are not measured results.',links:[['ESA Nepal event report','https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites'],['Copernicus Data Space','https://dataspace.copernicus.eu/']]},
    {keys:['extent','map','delineat','water','flood'],title:'A defensible flood-mapping workflow',text:'Compare Sentinel-1 radar scenes before and after the event, mask permanent water and terrain artefacts, and use cloud-free Sentinel-2 imagery as supporting evidence. Validate the result against reference data before reporting area. The blue shape on this map is only illustrative.',links:[['Copernicus Data Space','https://dataspace.copernicus.eu/'],['NASA GPM IMERG','https://gpm.nasa.gov/data/imerg']]},
    {keys:['forest','tree','deforestation','amazon','land cover'],title:'A careful forest-change workflow',text:'Use comparable Sentinel-2 scenes, inspect cloud cover, compare like-for-like seasonal windows, then validate potential change with a trusted reference dataset. This case study contains no actual deforestation detection or verified forest-loss measurements.',links:[['Copernicus Data Space','https://dataspace.copernicus.eu/'],['Global Forest Watch','https://www.globalforestwatch.org/']]},
    {keys:['exposed','place','road','building','village','impact','damage'],title:'Exposure needs a spatial overlay',text:'Once an event or land-cover change has been validated, intersect it with roads, buildings or settlement datasets. Treat intersections as potentially affected assets, not confirmed damage, and document data completeness.',links:[['OpenStreetMap attribution and license','https://www.openstreetmap.org/copyright']]},
    {keys:['rain','precipitation','weather','cause','why'],title:'Rainfall is context, not proof of cause',text:'NASA GPM IMERG provides satellite-based precipitation estimates that can help describe rainfall around an event. Pair it with local gauges and official reports where available. The rainfall circles in this demo are illustrative, not real measurements.',links:[['NASA GPM IMERG','https://gpm.nasa.gov/data/imerg']]},
    {keys:['planet','high resolution','commercial'],title:'Where Planet fits',text:'Planet imagery may add finer-grained optical context when suitable scenes are available and access is licensed. This demo does not connect to Planet APIs or load commercial imagery.',links:[['Planet developer documentation','https://docs.planet.com/develop/apis/data/']]},
    {keys:['source','satellite','data','sentinel'],title:'A practical source stack',text:'Use Sentinel-1 radar, Sentinel-2 optical imagery, NASA precipitation estimates, terrain data and OpenStreetMap context. Each answers a different question; none is complete ground truth on its own.',links:[['Copernicus Data Space','https://dataspace.copernicus.eu/'],['NASA GPM IMERG','https://gpm.nasa.gov/data/imerg']]}
  ];
  const chatHistory=[];
  let chatBackendStatus='checking';
  function answerFor(question){
    const q=question.toLowerCase();
    const date=active.dates[Number($('timeline').value)]?.date||'the selected date';
    const place=active.title;
    const found=responseBank.find(item=>item.keys.some(key=>q.includes(key)));
    if(found)return {...found,text:`${found.text}\n\nFor this investigation (${place}), the timeline is currently set to ${date}. Treat this as a method recommendation, not a newly measured result.`};
    if(/hello|hi\b|hey|good morning|good afternoon/.test(q))return {title:'Hello, field investigator.',text:`I’m ready to help you examine ${place}. We can start with what the source imagery actually shows, choose a defensible analysis method, or identify what evidence is still missing. What are you most curious about?`,links:active.evidence.slice(0,2).map(item=>[item[1],item[3]])};
    if(/compare|before|after|date|timeline|when/.test(q))return {title:`Reading the timeline · ${date}`,text:`The current timeline position is ${date}. For a meaningful comparison in ${place}, use scenes acquired in comparable conditions, record each acquisition date, and check clouds, sensor resolution and viewing geometry. A different-looking image is a signal to investigate, not proof of change.`,links:active.evidence.slice(0,2).map(item=>[item[1],item[3]])};
    if(/how|method|workflow|start|next|step/.test(q))return {title:'A practical next step',text:`For ${place}, I’d start by defining the exact question and area of interest, then retrieve two comparable scenes, document sensor/date/cloud cover, and compare the same geographic footprint. Validate any suspected change against an independent source before making a claim. Which outcome are you trying to establish?`,links:active.evidence.slice(0,3).map(item=>[item[1],item[3]])};
    const prompts=[
      `For “${question}”, the key is to separate the observation from the interpretation. In ${place}, first record what is visible, which source and acquisition date support it, and what alternative explanation could produce the same pattern. I can help turn this into a testable checklist.`,
      `A useful way to investigate “${question}” is to define a measurable signal, a comparison period and a validation source. The current workspace is ${place}; its overlays are illustrative, so I would not treat them as evidence. What spatial scale matters most — a site, a river corridor or a region?`,
      `Let’s break “${question}” into evidence and uncertainty. Start with a source scene and its metadata, compare like-for-like dates, then note what the imagery cannot reveal. For ${place}, ECHO can help plan this workflow, but it has not run automated change detection.`
    ];
    const idx=(chatHistory.length + question.length + place.length)%prompts.length;
    return {title:'Let’s investigate that',text:prompts[idx],links:active.evidence.slice(0,2).map(item=>[item[1],item[3]])};
  }
  function addUserMessage(text){const div=document.createElement('div');div.className='user-message';div.textContent=text;$('chatMessages').appendChild(div);}
  function addAssistantMessage(answer){const wrapper=document.createElement('div');wrapper.className='assistant-message';const icon=document.createElement('span');icon.className='message-icon';icon.textContent='✳';const body=document.createElement('div');const title=document.createElement('strong');title.textContent=answer.title||'ECHO';const p=document.createElement('p');p.textContent=answer.text||'I could not prepare an answer for that question.';body.append(title,p);if(answer.links&&answer.links.length){const links=document.createElement('div');links.style.cssText='display:flex;flex-direction:column;gap:6px;margin-top:9px';answer.links.forEach(([label,url])=>{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noreferrer';a.textContent=label+' ↗';a.style.cssText='font-size:9px;color:#9af3c6;text-decoration:none';links.appendChild(a)});body.appendChild(links);}wrapper.append(icon,body);$('chatMessages').appendChild(wrapper);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
  function setChatStatus(text){$('chatDisclaimer').textContent=text;}
  async function requestLiveAnswer(){
    const messages=chatHistory.slice(-12).map(m=>({role:m.role,content:m.content}));
    const response=await fetch('/.netlify/functions/echo-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({investigation:{title:active.title,topic:active.topic||active.crumb,date:active.dates[Number($('timeline').value)]?.date,sourceText:active.sourceText,evidence:active.evidence.map(e=>({title:e[1],url:e[3]}))},messages})});
    if(!response.ok)throw new Error('Chat backend is not configured');
    const data=await response.json();if(!data.reply)throw new Error('No reply from chat backend');return {title:'ECHO · Evidence assistant',text:data.reply,links:[]};
  }
  async function submitQuestion(question){
    const q=question.trim();if(!q)return;addUserMessage(q);chatHistory.push({role:'user',content:q});$('suggestions').style.display='none';$('chatInput').value='';$('chatInput').disabled=true;$('chatForm').querySelector('button').disabled=true;
    const thinking=document.createElement('div');thinking.className='assistant-message thinking-message';thinking.innerHTML='<span class="message-icon">✳</span><div><strong>ECHO is thinking…</strong><p>Checking the investigation context.</p></div>';$('chatMessages').appendChild(thinking);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;
    let answer;
    try{answer=await requestLiveAnswer();setChatStatus('Live AI connected · verify findings against source data.');chatBackendStatus='live';}
    catch(_){answer=answerFor(q);setChatStatus('Research guidance mode · deploy the secure chat function for live AI.');chatBackendStatus='local';}
    thinking.remove();addAssistantMessage(answer);chatHistory.push({role:'assistant',content:answer.text});$('chatInput').disabled=false;$('chatForm').querySelector('button').disabled=false;$('chatInput').focus();
  }
  $('chatForm').addEventListener('submit',e=>{e.preventDefault();submitQuestion($('chatInput').value);});
  $('suggestions').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>submitQuestion(btn.textContent)));

  const communityChatHistory=[];
  $('communityChatForm').addEventListener('submit',e=>{e.preventDefault();const input=$('communityChatInput');const message=input.value.trim();if(!message)return;const row=document.createElement('div');row.className='community-chat-message own-community-message';const avatar=document.createElement('span');avatar.className='community-avatar avatar-mint';avatar.textContent='YOU';const body=document.createElement('div');const strong=document.createElement('strong');strong.innerHTML='You <small>just now</small>';const p=document.createElement('p');p.textContent=message;body.append(strong,p);row.append(avatar,body);$('communityChat').append(row);communityChatHistory.push(message);input.value='';$('communityChat').scrollTop=$('communityChat').scrollHeight;setTimeout(()=>{const reply=document.createElement('div');reply.className='community-chat-message';const a=document.createElement('span');a.className='community-avatar avatar-purple';a.textContent='SK';const b=document.createElement('div');const st=document.createElement('strong');st.innerHTML='Sofia K. <small>just now</small>';const para=document.createElement('p');para.textContent=/sentinel|radar|cloud|data|image|scene/i.test(message)?'Great point. I’d save the scene ID, acquisition date and cloud conditions alongside the comparison so someone else can reproduce it.':'Interesting question — what evidence or source would help us check that together?';b.append(st,para);reply.append(a,b);$('communityChat').append(reply);$('communityChat').scrollTop=$('communityChat').scrollHeight;},550);});
  $('communityThreads').addEventListener('click',e=>{const btn=e.target.closest('.thread-open');if(!btn)return;const thread=btn.dataset.thread;const question=thread==='forest'?'How do you separate seasonal change from forest loss?':'Sentinel-1 or Sentinel-2 for a cloudy region?';openEcho();$('chatInput').value=question;submitQuestion(question);});
  $('communityGuidelines').addEventListener('click',()=>toast('Be curious, cite your sources, separate observations from interpretations, and respect local knowledge.'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal(infoModal);closeEcho();inspector.classList.remove('open');setCompareVisibility(false);closeModal(newInvestigationModal);}});

  // Keep the report panel reachable on narrower screens.
  if(window.matchMedia('(max-width: 1250px)').matches){const crumb=document.querySelector('.breadcrumb');crumb.style.cursor='pointer';crumb.title='Open field report';crumb.addEventListener('click',showInspector);}
  $('echo-context').innerHTML=`<span class="live-dot"></span> CONTEXT: ${active.crumb.toUpperCase()} · ${active.id}`;
  Object.entries(investigations).filter(([key,item])=>item.isCustom).forEach(([key,item])=>{const card=document.createElement('button');card.className='investigation-card';card.dataset.key=key;card.innerHTML=`<div class="thumb custom-thumb"><span class="thumb-tag">FIELD NOTE ${escapeHtml(item.id)}</span><span class="thumb-contour"></span></div><div class="investigation-copy"><strong>${escapeHtml(item.title)}</strong><span>Personal workspace <i class="status-dot"></i> Custom</span></div><svg class="chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>`;$('newInvestigation').before(card);});
  addMarkers();drawEventLayer();setDate(2,false);setCompare(50);renderDashboard();loadPlanetPulse();
  window.addEventListener('resize',()=>map.invalidateSize());
})();
