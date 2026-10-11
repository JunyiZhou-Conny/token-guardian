/* The standalone guardian keeps its copy together; the existing React copy registry is untouched. */
(() => {
  'use strict';
  const COPY = {
    brand: 'Token Guardian', brandSub: 'a little watchtower', overview: 'Overview', activity: 'Activity', collection: 'Collection', settings: 'Preferences', space: 'Your space',
    localNote: 'A little company. A clearer picture.', watching: 'Your guardian is here', companion: 'Your companion', change: 'Change',
    greeting: 'Your tokens. In good company.', greetingSub: 'A clearer view of your AI usage, with a friend by your side.', today: 'Today', week: '7 days', month: '30 days',
    demo: 'Preview data', demoNote: 'You’re exploring sample activity. These numbers are not your actual usage.', import: 'Import usage', refresh: 'Refresh usage',
    local: 'Local records', imported: 'Imported records', allProviders: 'All providers', usageValue: 'Recorded usage value', usageValueSub: 'Reported + estimated · not your subscription bill',
    totalTokens: 'Tokens recorded', tokensSub: 'Input, output, cache reads and writes', sessions: 'Attributed sessions', sessionsSub: 'Sessions with an observed identifier', sessionsUnknown: 'Session IDs unavailable in these records',
    providerHeading: 'Across your AI tools', providerSub: 'One little home for every token.', all: 'View all', noData: 'No records', preview: 'Preview', records: 'Recorded',
    tokenFlow: 'Token flow', tokenFlowSub: 'A little perspective on your activity.', tokens: 'Tokens', cached: 'Cache reads', chartCaption: 'Based on recorded usage. Gaps mean no records were found.',
    recentActivity: 'Recent activity', recentSub: 'The trail behind the totals.', tableSource: 'Tool / model', tableProject: 'Project', tableTokens: 'Tokens', tableValue: 'Usage value',
    unknownCost: 'Unknown', estimated: 'estimated', included: 'included', onDemand: 'on-demand', free: 'free', bucket: 'time bucket', unattributed: 'Project not exposed',
    tableFoot: 'Usage value may be included in a subscription. Unknown prices are not counted as zero-cost usage.',
    notice: 'Worth a little look', investigate: 'Investigate', quietTitle: 'Nothing unusual in these records.', quietDescription: 'Keep a little eye on your activity. Sparse or bucketed records can hide short-running loops.', evidence: 'records of evidence',
    questHeading: 'Little achievements', questSub: 'Collect good habits.', firstWatch: 'First watch', firstWatchSub: 'Bring your usage into view', loopDetective: 'Loop detective', loopDetectiveSub: 'Follow an activity trail', budgetKeeper: 'Budget keeper', budgetKeeperSub: 'Set a usage-value alert',
    foot: 'Your usage stays on this device.', footDemo: 'Sample activity · exploring the experience', footLive: 'Records refreshed',
    activityTitle: 'Every token has a trail.', activitySub: 'Explore what your tools expose, and see where attribution ends.', export: 'Export records', exportDone: 'Usage records exported.',
    empty: 'No usage records match this view.', emptyHelp: 'Try another time range or import a usage export.',
    collectionTitle: 'A little company for the journey.', collectionSub: 'Choose a familiar face. Collect habits that help you stay in control.', choose: 'Choose companion', selected: 'Your companion',
    collectionIntro: 'A guardian, not a grind.', collectionIntroSub: 'Your companion is yours from the start. Stickers celebrate attention and good habits, so you never need to spend more tokens to collect.', stickerHeading: 'Your sticker book',
    stickerPreview: 'Preview achievements are illustrative. Your real collection starts with local records.', stickerLocked: 'Ready when you are', stickerUnlocked: 'Collected',
    settingsTitle: 'Make this little space yours.', settingsSub: 'A few preferences for a calmer relationship with your AI tools.', watchHeading: 'Your watchtower', watchSub: 'Settings stay in this browser.',
    autoRefresh: 'Keep the view fresh', autoRefreshSub: 'Refresh local records every 30 seconds while this page is open.', notifications: 'Browser notifications', notificationsSub: 'Notify you about detected activity while this page is open.',
    alertBudget: 'Usage-value alert', alertBudgetSub: 'Notify at this recorded value today. It is not a subscription balance or a hard spending cap.',
    notificationLimit: 'Notifications are advisory. This version cannot pause another app or monitor after this page closes.',
    dataHeading: 'Bring your records home', dataSub: 'Import JSON or CSV usage exports. Only usage metadata belongs in the tracker.', demoButton: 'Explore preview', localButton: 'Show local records',
    importFoot: 'CSV can use timestamp, source, model, inputTokens, outputTokens, cachedTokens, costUsd, project, and sessionId. Provider exports are normalized by the local server.',
    coverageHeading: 'What your tools expose', coverageSub: 'A total is useful. Knowing its limits is better.', noCoverage: 'No local records found', hasCoverage: 'Usage records available',
    ask: 'Ask', chatWelcome: 'I can help you read the trail behind your usage. Ask which tool used the most tokens, or why a burst of activity looks unusual.',
    chatMode: 'Local explanation', chatOpenAI: 'OpenAI explanation', chatMeta: 'Complete dataset · usage metadata only · read-only', chatPlaceholder: 'Ask about your token usage…', chatSend: 'Send message',
    chatQuestion1: 'What used the most tokens?', chatQuestion2: 'Any unexpected activity?', chatQuestion3: 'Why did Cursor keep running?', chatThinking: 'Reading the usage trail…',
    chatFallback: 'The local explanation is unavailable, so I’m summarizing the records shown here.', chatError: 'I could not reach the local explanation. Your records are still available to inspect.',
    close: 'Close', detailTitle: 'Follow the activity trail', detailSource: 'Tool', detailCadence: 'Pattern', detailValue: 'Recorded usage value', detailEvidence: 'Recorded evidence',
    detailLimits: 'What this evidence can tell you', detailReview: 'Mark as reviewed', detailReviewed: 'Activity reviewed. Your detective sticker is ready.', detailAsk: 'Ask your guardian',
    evidenceMissing: 'The source did not expose a project or conversation identifier.', unknownAttribution: 'Attribution unavailable', inferredAttribution: 'Inferred association', observedAttribution: 'Observed identifier',
    importBusy: 'Reading your usage export…', importDone: 'Usage records imported.', importError: 'Could not import this file.', importServer: 'Imports need the local guardian server. Start it, then try again.',
    fileTooLarge: 'Choose an export below 1.5 MB. The encoded import must also fit within the server’s 2 MB limit.', switched: 'Your companion is ready.', refreshDone: 'The watchtower is up to date.', refreshError: 'Local server unavailable. Showing clearly labeled preview data.',
    notificationsDenied: 'Browser notifications are not allowed. You can change this in your browser settings.', notificationsUnavailable: 'This browser does not support notifications here.',
    budgetTitle: 'Your usage-value alert', budgetBody: 'Recorded usage value today has reached your chosen alert amount.', menu: 'Open navigation', welcome: 'Personal watchtower',
    recordDetail: 'Usage record', recordDescription: 'This is the metadata exposed by the source. It does not contain your prompts or conversation text.', requestNotProven: 'Time-bucket records combine activity. They cannot prove the number or cadence of individual requests.',
    costReported: 'provider-reported usage value', costEstimated: 'estimated usage value', costUnknown: 'usage value not exposed', noProject: 'Project unavailable', noSession: 'Session unavailable', automation: 'Automation',
    privacy: 'Prompts and conversation bodies are not collected.', importedResult: 'Imported records are now part of the local watchtower.'
  };
  const PROVIDERS = [
    { id: 'codex', name: 'Codex', symbol: '◈', color: '#839e86' },
    { id: 'claude', name: 'Claude Code', symbol: '✳', color: '#c99b80' },
    { id: 'cursor', name: 'Cursor', symbol: '↗', color: '#8e8b9b' },
    { id: 'gemini', name: 'Gemini', symbol: '✦', color: '#a9a0cd' }
  ];
  const COMPANIONS = {
    ahri: { name: 'Ahri', role: 'The curious keeper', quote: '“Let’s keep an eye on the little things.”', color: '#b8a2d0', hair: '#ebe3f8' },
    jinx: { name: 'Jinx', role: 'The chaos detector', quote: '“A runaway loop? Now that’s my kind of trouble.”', color: '#8ebbc6', hair: '#9ccadf' },
    jhin: { name: 'Jhin', role: 'The meticulous observer', quote: '“Every detail deserves a closer look.”', color: '#b9a594', hair: '#d6c4b0' }
  };
  const iconPaths = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z"/>',
    activity:'<path d="M3 17V9m6 8V4m6 13v-6m6 6V2M2 21h20"/>',
    collection:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="m17.5 14 1.2 2.3 2.3 1.2-2.3 1.2-1.2 2.3-1.2-2.3-2.3-1.2 2.3-1.2Z"/>',
    settings:'<path d="m12 3 2 3 3-1 2 3-1 3 3 2-2 3-3-1-2 3h-4l-2-3-3 1-2-3 3-2-1-3 2-3 3 1Z"/><circle cx="12" cy="11.5" r="3"/>',
    shield:'<path d="M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    arrowUp:'<path d="m5 12 7-7 7 7M12 5v15"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
    download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    message:'<path d="M21 11a9 9 0 0 1-9 9H7l-5 2 2-5v-6a9 9 0 0 1 17 0Z"/><path d="M8 11h8M8 15h5"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bell:'<path d="M5 16h14l-2-3V8a5 5 0 0 0-10 0v5Zm5 4h4"/>',
    sparkles:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3ZM20 2v4m-2-2h4"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
    coins:'<ellipse cx="12" cy="7" rx="8" ry="4"/><path d="M4 7v5c0 2 4 4 8 4s8-2 8-4V7M4 12v5c0 2 4 4 8 4s8-2 8-4v-5"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    link:'<path d="m9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>'
  };
  const icon = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.sparkles}</svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value) || 0);
  const compact = value => new Intl.NumberFormat('en-US', {notation:'compact',maximumFractionDigits:1}).format(Number(value) || 0);
  const number = value => new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(Number(value) || 0);
  const sourceId = source => ({claude_code:'claude','claude-code':'claude',claudecode:'claude','claude code':'claude','gemini-cli':'gemini',gemini_cli:'gemini','gemini cli':'gemini'}[String(source).toLowerCase()] || String(source).toLowerCase());
  const provider = source => PROVIDERS.find(p => p.id === sourceId(source)) || {id:sourceId(source),name:source || 'Unknown',symbol:'◈',color:'#a79cb6'};
  const safeTokens = value => Math.max(0, Number(value) || 0);
  const totalTokens = e => e.totalTokens != null ? safeTokens(e.totalTokens) : safeTokens(e.inputTokens) + safeTokens(e.outputTokens) + safeTokens(e.cachedTokens) + safeTokens(e.cacheWriteTokens ?? e.cacheCreationTokens);
  const dateTime = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); };
  const clockTime = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); };
  const readPrefs = () => { try { return JSON.parse(localStorage.getItem('token-guardian-preferences') || '{}'); } catch { return {}; } };
  const saved = readPrefs();
  const state = {
    tab: ['overview','activity','collection','settings'].includes(saved.tab) ? saved.tab : 'overview', period: ['today','week','month'].includes(saved.period) ? saved.period : 'today',
    provider: 'all', companion: Object.hasOwn(COMPANIONS,saved.companion) ? saved.companion : 'ahri',
    preferences: {autoRefresh:true,notifications:false,budget:15,...saved.preferences}, reviewed: Array.isArray(saved.reviewed) ? saved.reviewed : [],
    mode: 'demo', events: [], incidents: [], coverage: [], loaded: false, loading: false, connected: false, chatOpen:false, chatBusy:false, chatMode:'local', messages:[], mobileOpen:false, queryMode:null, refreshedAt:null
  };
  const save = () => { try { localStorage.setItem('token-guardian-preferences',JSON.stringify({tab:state.tab,period:state.period,companion:state.companion,preferences:state.preferences,reviewed:state.reviewed})); } catch {} };
  function makeDemo() {
    const now = Date.now(), events = [];
    for(let day=0;day<7;day++) {
      PROVIDERS.forEach((p,index) => {
        for(let turn=0;turn<3;turn++) {
          const tokens = (index+2) * (turn+2) * (day+3) * 2420;
          events.push({id:`preview-${day}-${p.id}-${turn}`,timestamp:new Date(now-day*86400000-(index*42+turn*73+40)*60000).toISOString(),source:p.id,
            model:{codex:'gpt-5.4',claude:'claude-sonnet-4-6',cursor:'claude-sonnet-4-6',gemini:'gemini-2.5-pro'}[p.id],
            inputTokens:Math.round(tokens*.29),outputTokens:Math.round(tokens*.11),cachedTokens:Math.round(tokens*.6),costUsd:Number((tokens/100000*(index+1)*.22).toFixed(3)),costType: p.id==='cursor' ? 'reported' : 'estimated',
            billingKind:p.id==='cursor'?'included':'unknown',billingLabel:p.id==='cursor'?'Included in plan':null,
            project:['personal-site','weekend-build','job-search-helper','learning-lab'][index],sessionId:`${p.id}-session-${day}-${turn}`,automationId:null,cloudAgentId:null,attribution:'observed',grain:'event'});
        }
      });
    }
    const start = now-205*60000;
    for(let i=0;i<12;i++) events.push({id:`preview-loop-${i}`,timestamp:new Date(start+i*600000).toISOString(),source:'cursor',model:'claude-sonnet-4-6',inputTokens:12500,outputTokens:3400,cachedTokens:23800,costUsd:.38,costType:'reported',billingKind:'included',billingLabel:'Included in plan',project:'job-search-helper',sessionId:'cursor-review-loop',automationId:'sheet-review-every-10m',cloudAgentId:null,attribution:'observed',grain:'event'});
    const evidence = events.filter(e=>e.automationId);
    return {mode:'demo',events,coverage:[],incidents:[{id:'preview-recurring',type:'recurring-automation',severity:'warning',title:'A little loop worth checking.',description:'Cursor recorded 12 activities about 10 minutes apart in job-search-helper. The repeated automation identifier connects these records to the same routine.',source:'cursor',automationId:'sheet-review-every-10m',confidence:'observed',evidenceIds:evidence.map(e=>e.id),startedAt:evidence[0].timestamp,lastSeenAt:evidence.at(-1).timestamp,totalTokens:evidence.reduce((sum,e)=>sum+totalTokens(e),0),reportedCostUsd:4.56,estimatedCostUsd:0,cadenceMinutes:10,action:'investigate',limits:['This is sample activity, created to demonstrate the investigation flow.','The real source must expose identifiers to connect usage to a project or automation.']} ]};
  }
  function championArt(id, className='') {
    const c = COMPANIONS[id] || COMPANIONS.ahri;
    const tails = id==='ahri' ? '<path d="M105 142C33 92 6 130 50 167c-64-6-50 47 17 31-12 47 46 42 58-5" fill="#f0e9fb" stroke="#cabddd" stroke-width="2"/><path d="M144 146c44-68 87-33 51 9 62-6 49 49-10 38 19 34-15 48-47 9" fill="#f0e9fb" stroke="#cabddd" stroke-width="2"/>' : id==='jinx' ? '<path d="M74 101c-6 41-26 62-23 108l23-11c-2-28 20-57 15-93m76-4c5 43 27 65 23 107l-22-9c1-27-19-56-15-94" fill="#90bed4" stroke="#76a5be" stroke-width="2"/>' : '<path d="m96 142-30 45 35 26 44 1 35-27-28-45Z" fill="#a89480" stroke="#887963" stroke-width="2"/>';
    const ears = id==='ahri' ? '<path d="m72 68-1-38 35 25m40-1 35-26-7 41" fill="#e8dcef" stroke="#beafcf" stroke-width="2"/><path d="m80 57-2-17 17 14m62-1 15-13-3 18" fill="#c4a7c1"/>' : '';
    const face = id==='jhin' ? '<path d="M85 93c0-29 69-29 69 0v26c-9 28-57 30-66 0Z" fill="#f5efe1"/><path d="m89 88 23 9-19 13m55-20-24 7 22 11" stroke="#876c6b" stroke-width="4" fill="none"/><path d="m112 117 12 0-7 8Z" fill="#b7a08d"/>' : '<ellipse cx="120" cy="109" rx="39" ry="36" fill="#fae6e0"/><ellipse cx="99" cy="114" rx="7" ry="4" fill="#edb9c0" opacity=".7"/><ellipse cx="142" cy="114" rx="7" ry="4" fill="#edb9c0" opacity=".7"/><path d="M96 104q7-8 14 0m20 0q7-8 14 0" fill="none" stroke="#736082" stroke-width="3.3" stroke-linecap="round"/><path d="M114 117q6 6 12 0" fill="none" stroke="#af7d91" stroke-width="2" stroke-linecap="round"/>';
    return `<div class="champion-art ${className}" data-art="${id}"><img src="./assets/champions.png" alt="${escape(c.name)} chibi companion" loading="lazy" /><svg class="champion-fallback" viewBox="0 0 240 240" aria-hidden="true"><ellipse cx="121" cy="215" rx="53" ry="8" fill="${c.color}" opacity=".12"/>${tails}${ears}<path d="M75 99c-7-65 102-68 98 0l-6 43-17 9-61-7Z" fill="${c.hair}" stroke="${c.color}" stroke-width="2"/>${face}<path d="M77 96c-8-43 25-49 45-47 37-4 58 27 46 53l-17-24-18 15-13-20-15 23-14-5Z" fill="${c.hair}" stroke="${c.color}" stroke-width="2"/><path d="m99 143-17 39 18 17h43l17-17-20-38Z" fill="${c.color}" stroke="#9280a7" stroke-width="2"/><path d="m111 145 10 12 10-12 10 17-20 23-20-23Z" fill="#f7eef3"/><path d="m84 161-16 19 10 7 20-15m56-11 17 19-11 7-19-15" fill="#f4e2df" stroke="${c.color}" stroke-width="2"/><path d="m106 194-4 15q-17 2-12 10h22l6-25m17 0 4 15q17 2 12 10h-22l-6-25" fill="#8e79a2"/><path d="m180 45 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#c7b9d6"/></svg></div>`;
  }
  function bindArt() {
    document.querySelectorAll('.champion-art img').forEach(img=>{
      if(img.complete && img.naturalWidth) img.parentElement.classList.add('asset-loaded');
      img.addEventListener('load',()=>img.parentElement.classList.add('asset-loaded'),{once:true});
      img.addEventListener('error',()=>img.remove(),{once:true});
    });
  }
  function providerIcon(source) { const p=provider(source); return `<span class="provider-icon ${escape(p.id)}" aria-hidden="true">${p.symbol}</span>`; }
  function filteredEvents() {
    const start = new Date();
    if(state.period==='today') start.setHours(0,0,0,0); else start.setTime(Date.now()-(state.period==='week'?7:30)*86400000);
    return state.events.filter(e=>new Date(e.timestamp)>=start && (state.provider==='all'||sourceId(e.source)===state.provider)).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  }
  function sumEvents(events) {
    return events.reduce((s,e)=>{
      s.tokens+=totalTokens(e);s.cached+=safeTokens(e.cachedTokens);
      if(e.costUsd!=null && Number.isFinite(Number(e.costUsd))) { if(e.costType==='estimated')s.estimated+=Number(e.costUsd); else s.reported+=Number(e.costUsd); }
      else s.unknown++;
      if(e.sessionId)s.sessions.add(`${sourceId(e.source)}:${e.sessionId}`);
      return s;
    },{tokens:0,cached:0,reported:0,estimated:0,unknown:0,sessions:new Set()});
  }
  function matchingIncidents() {
    const ids = new Set(filteredEvents().map(e=>String(e.id)));
    return state.incidents.filter(i=>(state.provider==='all'||sourceId(i.source)===state.provider) && (i.evidenceIds||[]).some(id=>ids.has(String(id))));
  }
  function costLabel(e) {
    if(e.costUsd==null) return `<span class="table-muted">${COPY.unknownCost}</span>`;
    const tag=e.costType==='estimated' ? COPY.estimated : e.billingKind==='included' ? COPY.included : e.billingKind==='on-demand' ? COPY.onDemand : e.billingKind==='free' ? COPY.free : '';
    return `${money(e.costUsd)}${tag?`<div class="table-sub">${escape(tag)}</div>`:''}`;
  }
  function renderShell() {
    const c=COMPANIONS[state.companion], local=state.mode==='local';
    const date=new Date().toLocaleDateString(undefined,{month:'long',day:'numeric'});
    const titles={overview:COPY.greeting,activity:COPY.activityTitle,collection:COPY.collectionTitle,settings:COPY.settingsTitle};
    const subtitles={overview:COPY.greetingSub,activity:COPY.activitySub,collection:COPY.collectionSub,settings:COPY.settingsSub};
    document.getElementById('app').innerHTML=`<div class="app-shell">
      <div class="mobile-scrim ${state.mobileOpen?'visible':''}" data-action="menu-close"></div>
      <aside class="sidebar ${state.mobileOpen?'open':''}" aria-label="Primary navigation"><div class="brand"><svg class="brand-mark" viewBox="0 0 42 46" fill="none" aria-hidden="true"><path d="M21 3 4 9v14c0 9 17 19 17 19s17-10 17-19V9Z" stroke="currentColor" stroke-width="1.5"/><path d="m21 11 3.3 8.7L33 23l-8.7 3.3L21 35l-3.3-8.7L9 23l8.7-3.3Z" fill="currentColor" opacity=".65"/><circle cx="21" cy="23" r="3" fill="#f0eee7"/></svg><div class="wordmark">${COPY.brand}<small>${COPY.brandSub}</small></div></div>
      <div class="nav-label">${COPY.space}</div><nav class="nav-items">${['overview','activity','collection','settings'].map(tab=>`<button class="nav-item ${state.tab===tab?'active':''}" data-tab="${tab}" ${state.tab===tab?'aria-current="page"':''} title="${COPY[tab]}">${icon(tab==='overview'?'home':tab)}<span>${COPY[tab]}</span></button>`).join('')}</nav>${location.pathname.startsWith('/guardian')?`<a class="advanced-link" href="/?app=1">${icon('link',12)}Advanced tracker</a>`:''}<div class="nav-spacer"></div><button class="sidebar-guardian" data-action="chat"><div class="tiny-avatar">${championArt(state.companion)}</div><div><strong>${c.name} is with you</strong><span>${COPY.watching}</span></div></button><div class="local-note">${icon('shield',13)}<span>${COPY.localNote}</span></div></aside>
      <main class="main"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="${COPY.menu}">${icon('menu')}</button><span>${COPY.space}</span><span>/</span><span>${COPY[state.tab]}</span></div><div class="top-actions"><span class="mode-pill ${local?'local':''}">${local?'<i class="live-dot"></i>':icon('sparkles',11)}${local?COPY.local:COPY.demo}</span><button class="icon-button ${state.loading?'refresh-spinning':''}" data-action="refresh" aria-label="${COPY.refresh}" ${state.loading?'disabled':''}>${icon('refresh',14)}</button><button class="icon-button" data-tab="settings" aria-label="${COPY.settings}">${icon('bell',14)}</button><span class="avatar-letter" aria-label="Personal workspace">S</span></div></header>
      <div class="page-heading"><div><p class="eyebrow">${escape(date)} · ${COPY.welcome}</p><h1>${titles[state.tab]}</h1><p class="heading-subtitle">${subtitles[state.tab]}</p></div>${['overview','activity'].includes(state.tab)?`<div class="period-control" role="group" aria-label="Time range">${['today','week','month'].map(p=>`<button class="${state.period===p?'active':''}" data-period="${p}" aria-pressed="${state.period===p}">${COPY[p]}</button>`).join('')}</div>`:''}</div>
      ${!local?`<div class="demo-banner">${icon('sparkles',15)}<span>${COPY.demoNote}</span><button data-action="import">${COPY.import}</button></div>`:''}
      <div id="page-content">${state.tab==='overview'?renderOverview():state.tab==='activity'?renderActivity():state.tab==='collection'?renderCollection():renderSettings()}</div>
      <footer class="footline"><span>${icon('shield',10)}${local?COPY.foot:COPY.footDemo}</span><span><i class="pink-dot"></i>${state.refreshedAt?`${COPY.footLive} ${clockTime(state.refreshedAt)}`:COPY.privacy}</span></footer></main></div>`;
    bindArt();
    if(state.chatOpen)renderChat();
  }
  function renderStats(events) {
    const s=sumEvents(events), value=s.reported+s.estimated;
    return `<div class="stat-grid"><div class="stat-card"><div class="stat-label">${icon('coins',13)}${COPY.usageValue}</div><div class="stat-value number">${events.length&&s.unknown===events.length?'—':`<small>$</small>${value.toFixed(2)}`}</div><div class="stat-subtitle">${s.unknown?`${number(s.unknown)} records have unknown pricing`:`${money(s.reported)} reported · ${money(s.estimated)} estimated`}</div></div><div class="stat-card"><div class="stat-label">${icon('sparkles',13)}${COPY.totalTokens}</div><div class="stat-value number">${compact(s.tokens)}</div><div class="stat-subtitle">${COPY.tokensSub}</div></div><div class="stat-card"><div class="stat-label">${icon('message',13)}${COPY.sessions}</div><div class="stat-value number">${s.sessions.size?number(s.sessions.size):'—'}</div><div class="stat-subtitle">${s.sessions.size?COPY.sessionsSub:COPY.sessionsUnknown}</div></div></div>`;
  }
  function renderProviders(events) {
    const total=sumEvents(events).tokens;
    return `<section class="panel"><div class="panel-head"><div><h2>${COPY.providerHeading}</h2><p>${COPY.providerSub}</p></div><button class="text-button" data-provider="all">${COPY.allProviders}${icon('arrow',12)}</button></div><div class="source-grid">${PROVIDERS.map(p=>{
      const rows=events.filter(e=>sourceId(e.source)===p.id),s=sumEvents(rows);
      return `<button class="source-card ${state.provider===p.id?'active':''}" data-provider="${p.id}" aria-pressed="${state.provider===p.id}" style="--source-color:${p.color}"><div class="source-top">${providerIcon(p.id)}<span class="source-status">${state.mode==='demo'?COPY.preview:rows.length?COPY.records:COPY.noData}</span></div><strong>${p.name}</strong><div class="source-cost">${rows.length?(s.reported+s.estimated?money(s.reported+s.estimated):s.unknown?'—':money(0)):'—'}</div><div class="source-tokens">${compact(s.tokens)} tokens ${s.unknown?'· value unknown':''}</div><div class="source-line"><span style="width:${total?Math.max(3,s.tokens/total*100):0}%"></span></div></button>`;
    }).join('')}</div></section>`;
  }
  function renderChart(events) {
    const bins=[],now=new Date();
    const count=state.period==='today'?6:state.period==='week'?7:10;
    const duration=state.period==='today'?4*3600000:state.period==='week'?86400000:3*86400000;
    const start=new Date(now); if(state.period==='today')start.setHours(0,0,0,0); else {start.setHours(0,0,0,0);start.setTime(start.getTime()-(count-1)*duration);}
    for(let i=0;i<count;i++) {const t=start.getTime()+i*duration;const rows=events.filter(e=>new Date(e.timestamp)>=t&&new Date(e.timestamp)<t+duration);bins.push({value:sumEvents(rows).tokens,cached:sumEvents(rows).cached,label:state.period==='today'?new Date(t).toLocaleTimeString(undefined,{hour:'numeric'}):new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'})});}
    const max=Math.max(...bins.map(b=>b.value),100),left=45,right=650,top=17,bottom=140,width=right-left;
    const points=bins.map((b,i)=>[left+i*width/(count-1),bottom-b.value/max*(bottom-top)]);
    const path=points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const cachedPath=bins.map((b,i)=>`${i?'L':'M'}${(left+i*width/(count-1)).toFixed(1)},${(bottom-b.cached/max*(bottom-top)).toFixed(1)}`).join(' ');
    return `<section class="panel chart-panel"><div class="panel-head"><div><h2>${COPY.tokenFlow}</h2><p>${COPY.tokenFlowSub}</p></div><div class="chart-meta"><span class="chart-key">${COPY.tokens}</span><span class="chart-key cached">${COPY.cached}</span></div></div><div class="chart"><svg viewBox="0 0 680 175" preserveAspectRatio="none" role="img" aria-label="Recorded tokens by ${state.period==='today'?'four-hour interval':'date'}: ${escape(bins.map(b=>`${b.label}: ${number(b.value)}`).join('; '))}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b8acd2" stop-opacity=".28"/><stop offset="100%" stop-color="#b8acd2" stop-opacity=".01"/></linearGradient></defs>${[0,.5,1].map(f=>`<line class="chart-grid" x1="${left}" y1="${bottom-f*(bottom-top)}" x2="${right}" y2="${bottom-f*(bottom-top)}"/><text x="7" y="${bottom-f*(bottom-top)+3}">${compact(max*f)}</text>`).join('')}<path d="${path} L${right},${bottom} L${left},${bottom}Z" fill="url(#chart-fill)"/><path d="${cachedPath}" fill="none" stroke="#d0c6dd" stroke-width="1.5" stroke-dasharray="4 4"/><path d="${path}" fill="none" stroke="#9d90bf" stroke-width="2" stroke-linejoin="round"/>${points.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#b8acd1" stroke="#fffefa" stroke-width="2"><title>${escape(bins[i].label)}: ${number(bins[i].value)} tokens</title></circle><text x="${p[0]}" y="165" text-anchor="middle">${escape(bins[i].label)}</text>`).join('')}</svg></div><p class="chart-caption">${COPY.chartCaption}</p></section>`;
  }
  function activityTable(events,limit=5) {
    if(!events.length)return `<div class="empty-state">${icon('search',25)}${COPY.empty}<br>${COPY.emptyHelp}</div>`;
    return `<div class="table-wrap"><table class="activity-table"><thead><tr><th>${COPY.tableSource}</th><th class="project-column">${COPY.tableProject}</th><th>${COPY.tableTokens}</th><th>${COPY.tableValue}</th></tr></thead><tbody>${events.slice(0,limit).map(e=>`<tr><td><button class="row-button" data-event="${escape(e.id)}"><div class="activity-provider">${providerIcon(e.source)}<div>${escape(provider(e.source).name)}<div class="table-sub">${escape(e.model||'Model unavailable')} · ${clockTime(e.timestamp)}</div></div></div></button></td><td class="project-column"><button class="row-button table-muted" data-event="${escape(e.id)}">${escape(e.project||COPY.unattributed)}${e.grain==='bucket'?`<div class="table-sub">${COPY.bucket}</div>`:''}</button></td><td><button class="row-button table-muted" data-event="${escape(e.id)}">${compact(totalTokens(e))}<div class="table-sub">${compact(e.cachedTokens)} cached</div></button></td><td class="table-cost">${costLabel(e)}</td></tr>`).join('')}</tbody></table></div><div class="activity-footer">${COPY.tableFoot}</div>`;
  }
  function renderOverview() {
    const events=filteredEvents(),incidents=matchingIncidents(),c=COMPANIONS[state.companion];
    const unfiltered=state.events.filter(e=>{ const start=new Date(); if(state.period==='today')start.setHours(0,0,0,0); else start.setTime(Date.now()-(state.period==='week'?7:30)*86400000);return new Date(e.timestamp)>=start;});
    return `<div class="dashboard-grid"><div class="main-column">${renderStats(events)}${renderProviders(unfiltered)}${renderChart(events)}<section class="panel activity-panel"><div class="panel-head"><div><h2>${COPY.recentActivity}</h2><p>${COPY.recentSub}</p></div><button class="text-button" data-tab="activity">${COPY.all}${icon('arrow',12)}</button></div>${activityTable(events,4)}</section></div><aside class="companion-column"><section class="panel companion-card"><div class="companion-title"><p class="eyebrow">${COPY.companion}</p><button data-tab="collection">${COPY.change} ↗</button></div><div class="guardian-status"><i class="live-dot"></i>${state.mode==='demo'?'Exploring the watchtower':'Watching the recorded trail'}</div><div class="companion-art-wrap"><span class="sparkle one">✦</span><span class="sparkle two">✧</span><span class="sparkle three">✦</span>${championArt(state.companion)}</div><div class="companion-name">${c.name}</div><div class="companion-role">${c.role}</div><p class="companion-quote">${c.quote}</p><button class="primary-button" data-action="chat">${icon('message',14)}${COPY.ask} ${c.name}${icon('arrow',13)}</button></section>${incidents.length?renderIncidentCard(incidents[0]):`<section class="panel alert-panel quiet-panel"><div class="alert-eyebrow">${icon('shield',13)}Your watchtower</div><h3>${COPY.quietTitle}</h3><p>${COPY.quietDescription}</p></section>`}${renderQuests()}</aside></div>`;
  }
  function renderIncidentCard(i) {return `<section class="panel alert-panel"><div class="alert-eyebrow">${icon('search',13)}${COPY.notice}</div><h3>${escape(i.title)}</h3><p>${escape(i.description)}</p><div class="alert-footer"><span class="alert-evidence">${(i.evidenceIds||[]).length} ${COPY.evidence}</span><button data-incident="${escape(i.id)}">${COPY.investigate}${icon('arrow',12)}</button></div></section>`;}
  function renderQuests() {
    const hasRecords=state.mode==='local'&&state.events.length>0,reviewed=state.mode==='local'&&state.reviewed.length>0;
    return `<section class="panel quest-panel"><div class="quest-top"><h2>${COPY.questHeading}</h2><span>${COPY.questSub}</span></div>${[{emoji:'🌱',name:COPY.firstWatch,sub:COPY.firstWatchSub,done:hasRecords},{emoji:'🔎',name:COPY.loopDetective,sub:COPY.loopDetectiveSub,done:reviewed}].map(q=>`<div class="quest-row"><div class="quest-icon">${q.emoji}</div><div class="quest-text"><strong>${q.name}</strong><span>${q.sub}</span></div>${q.done?`<span class="quest-check">${icon('check',14)}</span>`:''}</div>`).join('')}</section>`;
  }
  function providerFilter() {return `<select class="filter-select" id="provider-filter" aria-label="Filter provider"><option value="all">${COPY.allProviders}</option>${PROVIDERS.map(p=>`<option value="${p.id}" ${state.provider===p.id?'selected':''}>${p.name}</option>`).join('')}</select>`;}
  function renderActivity() {
    const events=filteredEvents();
    return `<div class="section-toolbar">${providerFilter()}<div><button class="secondary-button" data-action="import">${icon('upload',13)}${COPY.import}</button> <button class="secondary-button" data-action="export">${icon('download',13)}${COPY.export}</button></div></div>${renderStats(events)}<section class="panel activity-panel" style="margin-top:21px"><div class="panel-head"><div><h2>${COPY.activity}</h2><p>${number(events.length)} records · ${Intl.DateTimeFormat().resolvedOptions().timeZone}</p></div></div>${activityTable(events,100)}</section>`;
  }
  function renderCollection() {
    const local=state.mode==='local';
    const stickers=[{emoji:'🌱',name:COPY.firstWatch,sub:COPY.firstWatchSub,done:local&&state.events.length>0},{emoji:'🔎',name:COPY.loopDetective,sub:COPY.loopDetectiveSub,done:local&&state.reviewed.length>0},{emoji:'🛡️',name:COPY.budgetKeeper,sub:COPY.budgetKeeperSub,done:local&&state.preferences.budget>0},{emoji:'✨',name:'A familiar friend',sub:'Choose a companion for your watchtower',done:true}];
    return `<section class="collection-intro"><div><h2>${COPY.collectionIntro}</h2><p>${COPY.collectionIntroSub}</p></div><div class="seal">${icon('sparkles',27)}</div></section><div class="champion-grid">${Object.entries(COMPANIONS).map(([id,c])=>`<section class="champion-card ${id} ${state.companion===id?'selected':''}">${state.companion===id?`<span class="selected-tag">${icon('check',10)}${COPY.selected}</span>`:''}${championArt(id)}<h3>${c.name}</h3><p>${c.role}<br>${c.quote}</p><button class="secondary-button" data-companion="${id}" aria-pressed="${state.companion===id}">${state.companion===id?icon('check',12):icon('sparkles',12)}${state.companion===id?COPY.selected:COPY.choose}</button></section>`).join('')}</div><h2>${COPY.stickerHeading}</h2>${!local?`<p class="settings-footnote">${COPY.stickerPreview}</p>`:''}<div class="sticker-grid">${stickers.map(s=>`<section class="sticker ${!s.done?'locked':''}"><div class="sticker-emoji" aria-hidden="true">${s.emoji}</div><strong>${s.name}</strong><p>${s.sub}</p><p style="margin-top:8px">${s.done?COPY.stickerUnlocked:COPY.stickerLocked}</p></section>`).join('')}</div>`;
  }
  function renderSettings() {
    return `<div class="settings-grid"><div class="main-column"><section class="panel settings-panel"><h2>${COPY.watchHeading}</h2><p>${COPY.watchSub}</p><label class="setting-row"><div><strong>${COPY.autoRefresh}</strong><p>${COPY.autoRefreshSub}</p></div><input type="checkbox" class="toggle" data-pref="autoRefresh" ${state.preferences.autoRefresh?'checked':''}/></label><label class="setting-row"><div><strong>${COPY.notifications}</strong><p>${COPY.notificationsSub}</p></div><input type="checkbox" class="toggle" data-pref="notifications" ${state.preferences.notifications?'checked':''}/></label><label class="setting-row"><div><strong>${COPY.alertBudget}</strong><p>${COPY.alertBudgetSub}</p></div><input type="number" class="amount-input" min="0" max="100000" step="1" data-pref="budget" value="${Number(state.preferences.budget)||0}" aria-label="Usage value alert in US dollars"/></label><p class="settings-footnote">${COPY.notificationLimit}</p></section><section class="panel settings-panel"><h2>${COPY.dataHeading}</h2><p>${COPY.dataSub}</p><div class="data-actions"><button class="primary-button" data-action="import">${icon('upload',14)}${COPY.import}</button><button class="secondary-button" data-action="local">${COPY.localButton}</button><button class="secondary-button" data-action="demo">${COPY.demoButton}</button></div><p class="settings-footnote">${COPY.importFoot}</p></section></div><section class="panel settings-panel"><h2>${COPY.coverageHeading}</h2><p>${COPY.coverageSub}</p><div class="coverage-list">${PROVIDERS.map(p=>{const found=state.events.some(e=>sourceId(e.source)===p.id);const raw=Array.isArray(state.coverage.providers)?state.coverage.providers.find(c=>sourceId(c.source||c.provider)===p.id):null;return `<div class="coverage-row">${providerIcon(p.id)}<div><strong>${p.name}</strong><span>${state.mode==='demo'?'Sample records':found?COPY.hasCoverage:COPY.noCoverage}</span>${raw?.note?`<p class="settings-footnote">${escape(raw.note)}</p>`:''}</div><span class="coverage-state">${state.mode==='demo'?COPY.preview:found?COPY.records:COPY.noData}</span></div>`;}).join('')}</div><p class="settings-footnote">${COPY.privacy} Provider totals may expose less detail than session logs. Projects, requests, and schedules are shown only when the source supplies them.</p></section></div>`;
  }
  let toastTimer;
  function toast(message) {const el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4200);}
  async function api(path,options={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try {const response=await fetch(path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...(options.headers||{})}});let data;try{data=await response.json();}catch{throw new Error('The local server returned an unreadable response.');}if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);return data;}finally{clearTimeout(timer);}
  }
  async function loadData(manual=false) {
    if(state.loading)return;state.loading=true;if(state.loaded)renderShell();
    try {
      const data=await api(`/api/guardian${state.queryMode?`?mode=${state.queryMode}`:''}`);
      if(!Array.isArray(data.events))throw new Error('Usage records are missing.');
      state.mode=data.mode==='demo'?'demo':'local';state.events=data.events;state.incidents=Array.isArray(data.incidents)?data.incidents:[];state.coverage=data.coverage||[];state.connected=true;
      if(manual)toast(COPY.refreshDone);
    } catch {
      if(!state.loaded||state.queryMode==='demo') {const demo=makeDemo();state.mode=demo.mode;state.events=demo.events;state.incidents=demo.incidents;state.coverage=[];}
      state.connected=false;if(manual)toast(COPY.refreshError);
    } finally {state.loaded=true;state.loading=false;state.refreshedAt=new Date().toISOString();renderShell();checkAlerts();}
  }
  function evidenceRows(ids) {const wanted=new Set((ids||[]).map(String));return state.events.filter(e=>wanted.has(String(e.id))).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));}
  function showDetail(incident) {
    const events=evidenceRows(incident.evidenceIds),s=sumEvents(events),dialog=document.createElement('dialog');dialog.className='detail-dialog';
    const limits=incident.limits||[],attribution=incident.confidence==='observed'?COPY.observedAttribution:incident.confidence==='inferred'?COPY.inferredAttribution:COPY.unknownAttribution;
    dialog.innerHTML=`<div class="detail-head"><h2>${escape(incident.title||COPY.detailTitle)}</h2><button class="icon-button" data-dialog-close aria-label="${COPY.close}">${icon('close',15)}</button></div><div class="detail-body"><p class="detail-description">${escape(incident.description)}</p><div class="detail-facts"><div class="detail-fact"><span>${COPY.detailSource}</span><strong>${escape(provider(incident.source).name)}</strong></div><div class="detail-fact"><span>${COPY.detailCadence}</span><strong>${incident.cadenceMinutes?`~${number(incident.cadenceMinutes)} minutes`:attribution}</strong></div><div class="detail-fact"><span>${COPY.detailValue}</span><strong>${s.reported+s.estimated?money(s.reported+s.estimated):s.unknown?'Unknown':money(0)}</strong></div></div>${limits.length?`<div class="detail-limit"><strong>${COPY.detailLimits}</strong><br>${limits.map(escape).join('<br>')}</div>`:''}<h3>${COPY.detailEvidence} · ${number(events.length)}</h3><div class="evidence-list">${events.map(e=>`<div class="evidence-item">${providerIcon(e.source)}<div class="evidence-item-main"><strong>${escape(e.project||COPY.noProject)} · ${compact(totalTokens(e))} tokens</strong><p>${escape(e.model||'Model unavailable')} · ${e.costUsd==null?COPY.costUnknown:`${money(e.costUsd)} ${e.costType==='estimated'?COPY.costEstimated:COPY.costReported}`} ${e.billingKind==='included'?'· '+COPY.included:e.billingKind==='on-demand'?'· '+COPY.onDemand:''}<br>${e.sessionId?`Session: ${escape(e.sessionId)}`:COPY.noSession}${e.automationId?`<br>${COPY.automation}: ${escape(e.automationId)}`:''}<br>${e.grain==='bucket'?COPY.requestNotProven:escape(e.attribution==='observed'?COPY.observedAttribution:e.attribution==='inferred'?COPY.inferredAttribution:COPY.unknownAttribution)}</p></div><time>${dateTime(e.timestamp)}</time></div>`).join('')||`<p class="settings-footnote">${COPY.evidenceMissing}</p>`}</div><div class="detail-actions"><button class="secondary-button" data-detail-ask>${COPY.detailAsk}</button><button class="primary-button" data-detail-review>${COPY.detailReview}</button></div></div>`;
    document.getElementById('overlay-root').append(dialog);dialog.showModal();
    dialog.addEventListener('click',event=>{
      if(event.target.closest('[data-dialog-close]'))dialog.close();
      if(event.target.closest('[data-detail-review]')){if(state.mode==='local'&&!state.reviewed.includes(incident.id))state.reviewed.push(incident.id);save();dialog.close();renderShell();toast(state.mode==='local'?COPY.detailReviewed:'Preview activity reviewed. Your real sticker collection starts with local records.');}
      if(event.target.closest('[data-detail-ask]')){dialog.close();openChat();sendMessage(`Help me understand this recorded activity: ${incident.title}`);}
    });dialog.addEventListener('close',()=>dialog.remove());
  }
  function showEvent(id) {
    const e=state.events.find(row=>String(row.id)===String(id));if(!e)return;
    showDetail({id:`record-${e.id}`,title:COPY.recordDetail,description:COPY.recordDescription,source:e.source,confidence:e.attribution,evidenceIds:[e.id],limits:e.grain==='bucket'?[COPY.requestNotProven]:!e.project&&!e.sessionId?[COPY.evidenceMissing]:[]});
  }
  function openChat() {state.chatOpen=true;if(!state.messages.length)state.messages.push({role:'assistant',content:COPY.chatWelcome,mode:'local'});renderChat();setTimeout(()=>document.getElementById('chat-input')?.focus(),80);}
  function renderChat() {
    document.querySelector('.drawer-backdrop')?.remove();
    const c=COMPANIONS[state.companion],el=document.createElement('div');el.className='drawer-backdrop';
    el.innerHTML=`<section class="chat-drawer" role="dialog" aria-modal="true" aria-labelledby="chat-title"><div class="chat-header"><div class="tiny-avatar">${championArt(state.companion)}</div><div><h2 id="chat-title">${COPY.ask} ${c.name}</h2><p>${state.chatMode==='openai'?COPY.chatOpenAI:COPY.chatMode} · read-only</p></div><button class="icon-button" data-action="chat-close" aria-label="${COPY.close}">${icon('close',15)}</button></div><div class="chat-messages" id="chat-messages" role="log" aria-live="polite">${state.messages.map(m=>`<div class="chat-message ${m.role}">${escape(m.content)}${m.role==='assistant'?`<span class="chat-mode">${m.mode==='openai'?COPY.chatOpenAI:COPY.chatMode}${state.mode==='demo'?' · preview data':''}</span>`:''}${m.evidenceIds?.length?`<div class="chat-evidence">${m.evidenceIds.slice(0,5).map(id=>`<button data-event="${escape(id)}">${COPY.evidence} ↗</button>`).join('')}</div>`:''}</div>`).join('')}${state.chatBusy?`<div class="chat-message assistant">${COPY.chatThinking}</div>`:''}</div><div class="chat-suggestions">${[COPY.chatQuestion1,COPY.chatQuestion2,COPY.chatQuestion3].map(q=>`<button data-question="${escape(q)}" ${state.chatBusy?'disabled':''}>${q}</button>`).join('')}</div><form class="chat-form" id="chat-form"><textarea id="chat-input" rows="1" placeholder="${COPY.chatPlaceholder}" aria-label="${COPY.chatPlaceholder}" maxlength="2000" ${state.chatBusy?'disabled':''}></textarea><button type="submit" aria-label="${COPY.chatSend}" ${state.chatBusy?'disabled':''}>${icon('arrowUp',16)}</button></form><p class="chat-privacy">${COPY.chatMeta}${state.mode==='demo'?' · '+COPY.demo:''}</p></section>`;
    el.addEventListener('click',event=>{if(event.target===el)closeChat();});
    document.getElementById('overlay-root').append(el);bindArt();
    const log=document.getElementById('chat-messages');log.scrollTop=log.scrollHeight;
    document.getElementById('chat-form').addEventListener('submit',event=>{event.preventDefault();const input=document.getElementById('chat-input');sendMessage(input.value);});
    document.getElementById('chat-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage(event.target.value);}});
    trapFocus(el);
  }
  function trapFocus(container) {container.addEventListener('keydown',event=>{if(event.key==='Escape'){closeChat();return;}if(event.key!=='Tab')return;const nodes=[...container.querySelectorAll('button:not(:disabled),textarea:not(:disabled)')];if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});}
  function closeChat() {state.chatOpen=false;document.querySelector('.drawer-backdrop')?.remove();document.querySelector('[data-action="chat"]')?.focus();}
  function localAnswer(message) {
    const events=state.events,totals=PROVIDERS.map(p=>({...p,...sumEvents(events.filter(e=>sourceId(e.source)===p.id))})).sort((a,b)=>b.tokens-a.tokens),top=totals[0];
    const incidents=state.incidents;
    if(/cursor|loop|unexpected|burst|running/i.test(message)&&incidents.length){const i=incidents.find(i=>sourceId(i.source)==='cursor')||incidents[0];return {answer:`${COPY.chatFallback}\n\n${i.description}\n\n${(i.limits||[]).join(' ')}\n\nThe evidence can show repeated usage. It cannot prove whether you were away or stop the originating app.`,mode:'local',evidenceIds:i.evidenceIds};}
    if(!events.length)return {answer:'There are no records in the complete dataset. Import a usage export or choose another time range. I can explain activity once there is a recorded trail.',mode:'local',evidenceIds:[]};
    return {answer:`${COPY.chatFallback}\n\n${top.name} has the most recorded tokens in the complete dataset: ${number(top.tokens)}. Its recorded usage value is ${money(top.reported+top.estimated)} (${money(top.reported)} reported, ${money(top.estimated)} estimated). ${top.unknown?`${top.unknown} records have unknown pricing. `:''}\n\nThese values describe usage, not necessarily additional charges. Project and conversation attribution is available only when an identifier was recorded.`,mode:'local',evidenceIds:events.filter(e=>sourceId(e.source)===top.id).slice(0,3).map(e=>e.id)};
  }
  async function sendMessage(raw) {
    const message=String(raw||'').trim();if(!message||state.chatBusy)return;
    state.messages.push({role:'user',content:message});state.chatBusy=true;renderChat();
    try {
      const data=state.connected?await api('/api/guardian/chat',{method:'POST',body:JSON.stringify({message,datasetMode:state.mode})}):localAnswer(message);
      state.chatMode=data.mode==='openai'?'openai':'local';state.messages.push({role:'assistant',content:data.answer||COPY.chatError,mode:state.chatMode,evidenceIds:data.evidenceIds||[]});
    } catch {const data=localAnswer(message);state.messages.push({role:'assistant',content:data.answer,mode:'local',evidenceIds:data.evidenceIds});}
    finally{state.chatBusy=false;if(state.chatOpen){renderChat();document.getElementById('chat-input')?.focus();}}
  }
  async function importFile(file) {
    if(!file)return;if(file.size>=1_500_000){toast(COPY.fileTooLarge);document.getElementById('usage-file').value='';return;}toast(COPY.importBusy);
    try {const data=await file.text();const payload=JSON.stringify({format:file.name.toLowerCase().endsWith('.csv')?'csv':'json',data});if(new TextEncoder().encode(payload).byteLength>2*1024*1024){toast(COPY.fileTooLarge);return;}await api('/api/guardian/import',{method:'POST',body:payload});state.queryMode='local';state.provider='all';await loadData();toast(COPY.importDone);}
    catch(error){toast(`${COPY.importError} ${state.connected?error.message:COPY.importServer}`);}
    finally{document.getElementById('usage-file').value='';}
  }
  function exportRecords() {const blob=new Blob([JSON.stringify({events:filteredEvents(),mode:state.mode,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`token-guardian-${state.mode}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(COPY.exportDone);}
  const notified=new Set();
  function checkAlerts() {
    if(state.mode!=='local'||!state.preferences.notifications||!('Notification' in window)||Notification.permission!=='granted')return;
    const today=new Date();today.setHours(0,0,0,0);const s=sumEvents(state.events.filter(e=>new Date(e.timestamp)>=today));
    const key=`budget-${today.toISOString().slice(0,10)}`;
    if(state.preferences.budget>0&&s.reported+s.estimated>=state.preferences.budget&&!notified.has(key)){new Notification(COPY.budgetTitle,{body:COPY.budgetBody,tag:key});notified.add(key);}
    state.incidents.forEach(i=>{if(!notified.has(i.id)&&!state.reviewed.includes(i.id)){new Notification(i.title,{body:i.description,tag:i.id});notified.add(i.id);}});
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,[data-action]');if(!target)return;
    if(target.dataset.tab){state.tab=target.dataset.tab;state.mobileOpen=false;save();renderShell();window.scrollTo({top:0,behavior:'instant'});}
    if(target.dataset.period){state.period=target.dataset.period;save();renderShell();}
    if(target.dataset.provider){state.provider=target.dataset.provider;renderShell();}
    if(target.dataset.companion){state.companion=target.dataset.companion;save();renderShell();toast(COPY.switched);}
    if(target.dataset.incident){const i=state.incidents.find(i=>String(i.id)===target.dataset.incident);if(i)showDetail(i);}
    if(target.dataset.event)showEvent(target.dataset.event);
    if(target.dataset.question)sendMessage(target.dataset.question);
    const action=target.dataset.action;
    if(action==='refresh')loadData(true);
    if(action==='chat')openChat();
    if(action==='chat-close')closeChat();
    if(action==='menu'||action==='menu-close'){state.mobileOpen=action==='menu'?!state.mobileOpen:false;renderShell();}
    if(action==='import')document.getElementById('usage-file').click();
    if(action==='export')exportRecords();
    if(action==='demo'||action==='local'){state.queryMode=action;state.provider='all';loadData(true);}
  });
  document.addEventListener('change',async event=>{
    const target=event.target;
    if(target.id==='provider-filter'){state.provider=target.value;renderShell();}
    if(target.dataset.pref){const key=target.dataset.pref;if(key==='notifications'&&target.checked){if(!('Notification' in window)){target.checked=false;toast(COPY.notificationsUnavailable);}else {const permission=await Notification.requestPermission();if(permission!=='granted'){target.checked=false;toast(COPY.notificationsDenied);}}}state.preferences[key]=target.type==='checkbox'?target.checked:Math.max(0,Math.min(100000,Number(target.value)||0));save();checkAlerts();}
    if(target.id==='usage-file')importFile(target.files[0]);
  });
  state.events=makeDemo().events;state.incidents=makeDemo().incidents;renderShell();loadData();
  setInterval(()=>{if(state.preferences.autoRefresh&&!document.hidden&&!state.chatBusy&&!document.querySelector('.detail-dialog'))loadData();},30000);
})();
