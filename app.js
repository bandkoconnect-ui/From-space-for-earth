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

  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>';
  const map = L.map('map', { zoomControl: false, preferCanvas: true, scrollWheelZoom: true }).setView([27.72, 85.32], 8);
  // CARTO Voyager is used for English-forward labels; proper local place names remain unchanged.
  const streetTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd', attribution: OSM_ATTR
  }).addTo(map);
  const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagery &copy; Esri and its imagery providers'
  });

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
    } else {
      activeEventLayer = L.polygon([[-3.22,-62.78],[-3.0,-62.54],[-3.28,-62.23],[-3.18,-61.95],[-3.62,-61.8],[-3.9,-62.08],[-3.8,-62.45],[-3.52,-62.72],[-3.22,-62.78]],{color:'#a7e8ae',weight:1.2,opacity:.8,fillColor:'#6abf7b',fillOpacity:.2,className:'forest-polygon'});
    }
    if ($('floodLayer').checked) activeEventLayer.addTo(map);
    rainLayer.clearLayers();
    const rainCenter = active.center;
    [[-.18,-.15],[.12,.2],[-.04,.32]].forEach((delta,i)=>L.circle([rainCenter[0]+delta[0],rainCenter[1]+delta[1]],{radius:activeKey==='nepal'?11000+i*3000:18000+i*4000,color:'#f3bd70',weight:1,fillColor:'#f3bd70',fillOpacity:.10}).bindTooltip('Illustrative rainfall context — not measured data').addTo(rainLayer));
    if ($('rainLayer').checked) rainLayer.addTo(map);
  }
  function renderInvestigation() {
    document.querySelectorAll('.investigation-card').forEach(el=>el.classList.remove('selected'));
    $(activeKey==='nepal'?'nepalCard':'amazonCard').classList.add('selected');
    document.querySelector('.breadcrumb strong').textContent=active.crumb;
    $('mapTitle').innerHTML=active.mapTitle;
    $('mapSubtitle').innerHTML=active.subtitle;
    document.querySelectorAll('.timeline-labels span').forEach((el,i)=>{el.textContent=active.dates[i].date.replace(' 2026','').replace(' 2025','');});
    document.querySelector('.compare-map-before > span').textContent=`BEFORE · ${active.dates[0].date}`;
    document.querySelector('.compare-map-after > span').textContent=`AFTER · ${active.dates[2].date}`;
    $('legendTitle').textContent=active.legend;
    $('legendSubtitle').textContent=active.legendSub;
    document.querySelector('.inspector-head .eyebrow').textContent=`FIELD REPORT · ${active.id}`;
    document.querySelector('.report-date strong').textContent=active.dates[Number($('timeline').value)].date.replace(/(\d{2}) (\w{3}) (\d{4})/,'$1 $2 $3');
    document.querySelector('.insight-callout strong').textContent=activeKey==='nepal'?'A river, out of bounds.':'A forest under observation.';
    document.querySelector('.insight-callout p').textContent=active.sourceText;
    document.querySelector('.insight-callout a').href=active.evidence[0][3];
    document.querySelector('.metric-grid .metric strong').textContent=activeKey==='nepal'?'12–27':'JUN–SEP';
    document.querySelector('.metric-grid .metric small').textContent=activeKey==='nepal'?'Before / after imagery':'Illustrative comparison windows';
    document.querySelector('.metric-grid .metric:nth-child(2) strong').textContent=activeKey==='nepal'?'Sentinel-2':'Sentinel-2';
    document.querySelector('.metric-grid .metric:nth-child(2) small').textContent=activeKey==='nepal'?'Optical · 10–20 m bands':'Optical · cloud cover matters';
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
    $('baseLayer').checked = true;
    if (!map.hasLayer(streetTiles) && !$('satelliteLayer').checked) streetTiles.addTo(map);
    map.flyTo(active.center,active.zoom,{duration:.7});
    setDate($('timeline').value,false);
  }

  const dates = active.dates;
  const timeline = $('timeline');
  const progress = $('timelineProgress');
  function setDate(value, moveMap = false) {
    const i = Number(value); const d=active.dates[i];
    $('dateChip').textContent=d.date;
    $('timelineDescription').textContent=d.desc;
    progress.style.width=`${(i/3)*100}%`;
    if (moveMap) map.flyTo(d.center,d.zoom,{duration:.45});
    if(activeEventLayer) activeEventLayer.setStyle({fillOpacity:i===0?.08:i===1?.14:i===2?.22:.16,opacity:i===0?.35:.8});
    document.querySelector('.report-date strong').textContent=d.date.replace(/(\d{2}) (\w{3}) (\d{4})/,'$1 $2 $3');
    $('playTimeline').textContent=playTimer?'Ⅱ':'▶';
  }
  timeline.addEventListener('input',()=>setDate(timeline.value,true));
  $('playTimeline').addEventListener('click',()=>{
    if(playTimer){clearInterval(playTimer);playTimer=null;$('playTimeline').textContent='▶';return;}
    if(Number(timeline.value)>=3) timeline.value='0';
    $('playTimeline').textContent='Ⅱ';
    playTimer=setInterval(()=>{
      const next=Number(timeline.value)+1;
      if(next>3){clearInterval(playTimer);playTimer=null;$('playTimeline').textContent='▶';return;}
      timeline.value=String(next);setDate(next,true);
    },1500);
  });
  function stopTimeline(){if(playTimer){clearInterval(playTimer);playTimer=null;$('playTimeline').textContent='▶';}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTimeline();});

  $('zoomIn').addEventListener('click',()=>map.zoomIn());
  $('zoomOut').addEventListener('click',()=>map.zoomOut());
  $('resetView').addEventListener('click',()=>map.flyTo(active.center,active.zoom,{duration:.6}));
  map.on('mousemove',e=>$('coordinates').textContent=`${Math.abs(e.latlng.lat).toFixed(4)}° ${e.latlng.lat>=0?'N':'S'}, ${Math.abs(e.latlng.lng).toFixed(4)}° ${e.latlng.lng>=0?'E':'W'}`);
  map.on('mouseout',()=>$('coordinates').textContent=`${active.center[0].toFixed(4)}° ${active.center[0]>=0?'N':'S'}, ${Math.abs(active.center[1]).toFixed(4)}° ${active.center[1]>=0?'E':'W'}`);

  $('baseLayer').addEventListener('change',e=>{
    if(e.target.checked){if(!$('satelliteLayer').checked)streetTiles.addTo(map);}else map.removeLayer(streetTiles);
    toast(e.target.checked?'English street map enabled':'English street map hidden');
  });
  $('satelliteLayer').addEventListener('change',e=>{
    if(e.target.checked){map.removeLayer(streetTiles);satelliteTiles.addTo(map);}else{map.removeLayer(satelliteTiles);if($('baseLayer').checked)streetTiles.addTo(map);}
    toast(e.target.checked?'Satellite imagery enabled':'Satellite imagery hidden');
  });
  $('floodLayer').addEventListener('change',e=>{if(!activeEventLayer)drawEventLayer();else if(e.target.checked)activeEventLayer.addTo(map);else map.removeLayer(activeEventLayer);toast(e.target.checked?'Illustrative event overlay enabled':'Event overlay hidden');});
  $('placesLayer').addEventListener('change',e=>{if(e.target.checked)markerLayer.addTo(map);else map.removeLayer(markerLayer);toast(e.target.checked?'Investigation points shown':'Investigation points hidden');});
  $('rainLayer').addEventListener('change',e=>{if(e.target.checked)rainLayer.addTo(map);else map.removeLayer(rainLayer);toast(e.target.checked?'Illustrative rainfall context shown':'Rainfall context hidden');});
  $('resetLayers').addEventListener('click',()=>{
    $('baseLayer').checked=true;$('satelliteLayer').checked=false;$('floodLayer').checked=true;$('placesLayer').checked=true;$('rainLayer').checked=false;
    map.removeLayer(satelliteTiles);streetTiles.addTo(map);markerLayer.addTo(map);if(activeEventLayer)activeEventLayer.addTo(map);map.removeLayer(rainLayer);toast('Map layers reset');
  });

  // In-map draggable before/after reveal. The imagery-style artwork is explicitly illustrative, not satellite data.
  const compareSlider=$('compareSlider');
  function setCompare(value){const v=Number(value);$('compareAfter').style.clipPath=`inset(0 0 0 ${v}%)`;$('compareDivider').style.left=`${v}%`;}
  compareSlider.addEventListener('input',()=>setCompare(compareSlider.value));
  $('compareButton').addEventListener('click',()=>{
    const el=$('mapCompare');const open=!el.classList.contains('open');el.classList.toggle('open',open);el.setAttribute('aria-hidden',String(!open));$('compareButton').innerHTML=open?'× Close comparison':'<span>◫</span> Compare before / after';
    if(open){compareSlider.value=50;setCompare(50);toast('Drag the comparison slider to reveal each side');}
  });
  $('mapCompare').addEventListener('pointerdown',e=>{if(e.target===compareSlider)return;});

  function openModal(el){el.classList.add('open');el.setAttribute('aria-hidden','false');}
  function closeModal(el){el.classList.remove('open');el.setAttribute('aria-hidden','true');}
  const infoModal=$('infoModal');
  $('dataButton').addEventListener('click',()=>openModal(infoModal));
  $('closeInfo').addEventListener('click',()=>closeModal(infoModal));
  infoModal.addEventListener('click',e=>{if(e.target===infoModal)closeModal(infoModal);});
  $('savedButton').addEventListener('click',()=>toast('Choose an investigation from the left panel. Saved collections are a future feature.'));
  $('nepalCard').addEventListener('click',()=>{stopTimeline();activeKey='nepal';active=investigations.nepal;timeline.value='2';timeline.max='3';renderInvestigation();toast('Nepal flood investigation opened');});
  $('amazonCard').addEventListener('click',()=>{stopTimeline();activeKey='amazon';active=investigations.amazon;timeline.value='0';timeline.max='3';renderInvestigation();toast('Amazon forest-change case study opened');});
  $('newInvestigation').addEventListener('click',()=>toast('New investigation creation is not connected yet. The Amazon case study shows how a second investigation can look.'));

  const inspector=$('inspector');
  function showInspector(){inspector.classList.add('open');}
  $('closeInspector').addEventListener('click',()=>inspector.classList.remove('open'));
  const echoPanel=$('echoPanel');
  function openEcho(){echoPanel.classList.add('open');echoPanel.setAttribute('aria-hidden','false');setTimeout(()=>$('chatInput').focus(),100);}
  function closeEcho(){echoPanel.classList.remove('open');echoPanel.setAttribute('aria-hidden','true');}
  $('askEchoTop').addEventListener('click',openEcho);$('askEchoReport').addEventListener('click',openEcho);$('closeEcho').addEventListener('click',closeEcho);

  $('shareButton').addEventListener('click',()=>{
    const snapshot={app:'ECHO — Earth Intelligence for Everyone',investigation:active.title,selectedDate:active.dates[Number(timeline.value)].date,selectedLayers:{englishStreetMap:$('baseLayer').checked,satelliteImagery:$('satelliteLayer').checked,eventOverlay:$('floodLayer').checked,investigationPoints:$('placesLayer').checked,rainfallContext:$('rainLayer').checked},status:'Prototype. Event geometry and rainfall context are illustrative; no satellite analysis is performed.',evidence:active.evidence.map(x=>x[3]),exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`echo-${activeKey}-investigation.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Investigation snapshot exported');
  });

  const responseBank=[
    {keys:['sure','know','evidence','fact','confirmed'],title:'What the sources support',text:'For the Nepal case, ESA reports increased river water in before/after Sentinel-2 imagery. For the Amazon case, this demo does not establish that forest loss occurred. In both cases, the map shapes are illustrative and are not measured results.',links:[['ESA Nepal event report','https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites'],['Copernicus Data Space','https://dataspace.copernicus.eu/']]},
    {keys:['extent','map','delineat','water','flood'],title:'A defensible flood-mapping workflow',text:'Compare Sentinel-1 radar scenes before and after the event, mask permanent water and terrain artefacts, and use cloud-free Sentinel-2 imagery as supporting evidence. Validate the result against reference data before reporting area. The blue shape on this map is only illustrative.',links:[['Copernicus Data Space','https://dataspace.copernicus.eu/'],['NASA GPM IMERG','https://gpm.nasa.gov/data/imerg']]},
    {keys:['forest','tree','deforestation','amazon','land cover'],title:'A careful forest-change workflow',text:'Use comparable Sentinel-2 scenes, inspect cloud cover, compare like-for-like seasonal windows, then validate potential change with a trusted reference dataset. This case study contains no actual deforestation detection or verified forest-loss measurements.',links:[['Copernicus Data Space','https://dataspace.copernicus.eu/'],['Global Forest Watch','https://www.globalforestwatch.org/']]},
    {keys:['exposed','place','road','building','village','impact','damage'],title:'Exposure needs a spatial overlay',text:'Once an event or land-cover change has been validated, intersect it with roads, buildings or settlement datasets. Treat intersections as potentially affected assets, not confirmed damage, and document data completeness.',links:[['OpenStreetMap attribution and license','https://www.openstreetmap.org/copyright']]},
    {keys:['rain','precipitation','weather','cause','why'],title:'Rainfall is context, not proof of cause',text:'NASA GPM IMERG provides satellite-based precipitation estimates that can help describe rainfall around an event. Pair it with local gauges and official reports where available. The rainfall circles in this demo are illustrative, not real measurements.',links:[['NASA GPM IMERG','https://gpm.nasa.gov/data/imerg']]},
    {keys:['planet','high resolution','commercial'],title:'Where Planet fits',text:'Planet imagery may add finer-grained optical context when suitable scenes are available and access is licensed. This demo does not connect to Planet APIs or load commercial imagery.',links:[['Planet developer documentation','https://docs.planet.com/develop/apis/data/']]},
    {keys:['source','satellite','data','sentinel'],title:'A practical source stack',text:'Use Sentinel-1 radar, Sentinel-2 optical imagery, NASA precipitation estimates, terrain data and OpenStreetMap context. Each answers a different question; none is complete ground truth on its own.',links:[['Copernicus Data Space','https://dataspace.copernicus.eu/'],['NASA GPM IMERG','https://gpm.nasa.gov/data/imerg'],['OpenStreetMap copyright','https://www.openstreetmap.org/copyright']]}
  ];
  function answerFor(question){const q=question.toLowerCase();const found=responseBank.find(item=>item.keys.some(key=>q.includes(key)));return found||{title:'Let’s make the question testable',text:`For ${active.title}, define a location and date window, retrieve relevant source scenes, record acquisition dates and processing steps, then validate any detected change. I cannot retrieve live imagery or compute a verified result from this front-end prototype.`,links:active.evidence.slice(0,2).map(item=>[item[1],item[3]])};}
  function addUserMessage(text){const div=document.createElement('div');div.className='user-message';div.textContent=text;$('chatMessages').appendChild(div);}
  function addAssistantMessage(answer){const wrapper=document.createElement('div');wrapper.className='assistant-message';const icon=document.createElement('span');icon.className='message-icon';icon.textContent='✳';const body=document.createElement('div');const title=document.createElement('strong');title.textContent=answer.title;const p=document.createElement('p');p.textContent=answer.text;body.append(title,p);if(answer.links&&answer.links.length){const links=document.createElement('div');links.style.cssText='display:flex;flex-direction:column;gap:6px;margin-top:9px';answer.links.forEach(([label,url])=>{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noreferrer';a.textContent=label+' ↗';a.style.cssText='font-size:9px;color:#9af3c6;text-decoration:none';links.appendChild(a)});body.appendChild(links);}wrapper.append(icon,body);$('chatMessages').appendChild(wrapper);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
  function submitQuestion(question){const q=question.trim();if(!q)return;addUserMessage(q);$('suggestions').style.display='none';$('chatInput').value='';setTimeout(()=>addAssistantMessage(answerFor(q)),160);}
  $('chatForm').addEventListener('submit',e=>{e.preventDefault();submitQuestion($('chatInput').value);});
  $('suggestions').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>submitQuestion(btn.textContent)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal(infoModal);closeEcho();inspector.classList.remove('open');$('mapCompare').classList.remove('open');$('mapCompare').setAttribute('aria-hidden','true');}});

  // Keep the report panel reachable on narrower screens.
  if(window.matchMedia('(max-width: 1250px)').matches){const crumb=document.querySelector('.breadcrumb');crumb.style.cursor='pointer';crumb.title='Open field report';crumb.addEventListener('click',showInspector);}
  $('echo-context').innerHTML=`<span class="live-dot"></span> CONTEXT: ${active.crumb.toUpperCase()} · ${active.id}`;
  addMarkers();drawEventLayer();setDate(2,false);setCompare(50);
  window.addEventListener('resize',()=>map.invalidateSize());
})();
