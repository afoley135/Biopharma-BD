/* Shared code for the analysis pages (deals.html, fundraises.html).
   Each page calls renderAnalysis(config) with the cards it wants; the data
   comes from the same nightly data.json the overview uses. */
const DATA = {};
const TOP_N = 8;             // bars per ranking chart
const GROWTH_DAYS = 90;      // window length for the growth charts (≈ one quarter)

const fmtM = v => v==null ? "—" : v>=1000 ? "$"+(v/1000).toFixed(v%1000?1:0)+"B"
                                          : "$"+Math.round(v)+"M";
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const shorten = s => (s && s.length>22) ? s.slice(0,21)+"…" : s;
const plural = (n, w) => `${n} ${w}${n===1?"":"s"}`;

/* ---------- grouping ----------
   The trackers are hand-entered, so the same thing is spelled several ways
   ("Autoimmune" / "Autoimmune disease", "Bispecific antibody" / "…antibodies").
   Labels are grouped case-insensitively with simple plurals folded, plus the
   explicit synonyms below. The most common spelling is shown. */
const SYNONYMS = {
  "autoimmune disease": "autoimmune",
  "radiopharmaceutical": "radiopharma",
  "hepatatis b": "hepatitis b",
  "soild tumor": "solid tumor",
};   // company & investor names are cleaned in build.py (name_aliases.csv)
function groupKey(s){
  let k = s.trim().replace(/\s+/g," ");
  // fold a lowercase plural ("antibodies", "diseases"), never an acronym ("ALS")
  if(/[a-z]ies$/.test(k)) k = k.slice(0,-3)+"y";
  else if(/[a-z]{3}[^siu]s$/.test(k)) k = k.slice(0,-1);
  k = k.toLowerCase();
  return SYNONYMS[k] || k;
}

/* group events by a label; each event = {label, value, date} */
function groupBy(events){
  const m = {};
  events.forEach(e=>{
    if(!e.label) return;
    const k = groupKey(e.label);
    const g = m[k] = m[k] || {spell:{}, n:0, v:0, nv:0, events:[]};
    g.spell[e.label] = (g.spell[e.label]||0)+1;
    g.n++; g.events.push(e);
    if(e.value!=null){ g.v += e.value; g.nv++; }
  });
  return Object.values(m).map(g=>({...g,
    label: Object.entries(g.spell).sort((a,b)=>b[1]-a[1])[0][0]}));
}

/* ---------- growth windows ----------
   Compares the most recent GROWTH_DAYS with the GROWTH_DAYS before. Until the
   trackers have twice that much history, both windows shrink to half of the
   history available, so the two periods are always equal length and fully
   covered (comparing a partial quarter with a full one would mislead). */
function growthWindows(){
  const dates = Object.values(DATA.records||{}).flat().map(r=>r.date).filter(Boolean).sort();
  const day = 864e5, t = d => Date.parse(d+"T00:00:00Z");
  const start = t(dates[0]);
  const end = Math.max(t(dates[dates.length-1]), t((DATA.generated||"").slice(0,10)) || 0);
  const span = Math.floor((end-start)/day)+1;
  const len = Math.min(GROWTH_DAYS, Math.floor(span/2));
  const iso = ms => new Date(ms).toISOString().slice(0,10);
  const recentFrom = end-(len-1)*day, priorFrom = recentFrom-len*day;
  return {len,
    prior:  {from: iso(priorFrom),  to: iso(recentFrom-day)},
    recent: {from: iso(recentFrom), to: iso(end)}};
}
const inWin = (d, w) => d && d>=w.from && d<=w.to;

/* ---------- charts ---------- */
Chart.defaults.font.family="'Inter',sans-serif";
Chart.defaults.font.size=12;
Chart.defaults.color=css('--muted');
const gridClr = css('--line2');
const yCat = {grid:{display:false},border:{display:false},
  ticks:{callback:function(v){return shorten(this.getLabelForValue(v));}}};
const xMoney = {grid:{color:gridClr},border:{display:false},ticks:{callback:v=>fmtM(v)}};
const xCount = {grid:{color:gridClr},border:{display:false},ticks:{precision:0}};

function card(host, {title, sub, id, wide}){
  const el = document.createElement("div");
  el.className = "card"+(wide?" wide":"");
  el.innerHTML = `<h3>${title} <span class="sub">${sub||""}</span></h3>
    <div class="chart-wrap" style="height:${TOP_N*30+30}px"><canvas id="${id}"></canvas></div>
    <div class="note" id="${id}-note"></div>`;
  host.appendChild(el);
  return el;
}
function empty(id, msg){
  const wrap = document.getElementById(id).parentNode;
  wrap.style.height = "auto";
  wrap.innerHTML = `<div class="empty">${msg}</div>`;
}

/* top-N ranking: by "v" (disclosed $) or "n" (event count) */
function rankChart(id, groups, {by, color, unit}){
  const rows = groups.filter(g=>by==="n" ? g.n : g.v>0)
    .sort((a,b)=> by==="n" ? b.n-a.n || b.v-a.v : b.v-a.v || b.n-a.n).slice(0,TOP_N);
  if(!rows.length) return empty(id, "No disclosed values yet.");
  new Chart(document.getElementById(id), {type:'bar',
    data:{labels:rows.map(r=>r.label),
      datasets:[{data:rows.map(r=>by==="n"?r.n:r.v), backgroundColor:css(color),
                 borderRadius:4, barThickness:16}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{
        title:c=>rows[c[0].dataIndex].label,
        label:c=>{const r=rows[c.dataIndex];
          return by==="n" ? ` ${plural(r.n,unit)} · ${fmtM(r.v)} disclosed`
                          : ` ${fmtM(r.v)} · ${plural(r.nv,unit)} with disclosed value`;}}}},
      scales:{x: by==="n" ? xCount : xMoney, y: yCat}}});
}

/* fastest growing: event count, recent window vs prior window */
function growthChart(id, groups, win, {color, soft, unit}){
  const rows = groups.map(g=>{
      const p = g.events.filter(e=>inWin(e.date, win.prior));
      const r = g.events.filter(e=>inWin(e.date, win.recent));
      const sum = es => es.reduce((s,e)=>s+(e.value||0),0);
      return {label:g.label, p:p.length, r:r.length, pv:sum(p), rv:sum(r)};
    })
    .filter(x=>x.r>x.p && x.r>=2)       // a single new event isn't a trend
    .sort((a,b)=>(b.r-b.p)-(a.r-a.p) || b.r-a.r || b.rv-a.rv).slice(0,TOP_N);
  if(!rows.length) return empty(id, "Nothing has grown by two or more events yet.");
  new Chart(document.getElementById(id), {type:'bar',
    data:{labels:rows.map(r=>r.label), datasets:[
      {label:`Prior ${win.len} days`, data:rows.map(r=>r.p), backgroundColor:css(soft),
       borderRadius:4, barThickness:10},
      {label:`Last ${win.len} days`, data:rows.map(r=>r.r), backgroundColor:css(color),
       borderRadius:4, barThickness:10}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'top', align:'end',
          labels:{boxWidth:10, boxHeight:10, usePointStyle:true, pointStyle:'rectRounded'}},
        tooltip:{callbacks:{
          title:c=>rows[c[0].dataIndex].label,
          label:c=>{const r=rows[c.dataIndex], recent=c.datasetIndex===1;
            return ` ${c.dataset.label}: ${plural(recent?r.r:r.p,unit)} · ${fmtM(recent?r.rv:r.pv)}`;},
          footer:c=>{const r=rows[c[0].dataIndex];
            return `Change: +${r.r-r.p}`+(r.p?` (${Math.round((r.r/r.p-1)*100)}%)`:" (new)");}}}},
      scales:{x:xCount, y:yCat}}});
}

/* ---------- page ---------- */
function renderAnalysis(cfg){
  document.getElementById("genDate").textContent = (DATA.generated||"").slice(0,10) || "—";
  const recs = cfg.cats.flatMap(c=>(DATA.records||{})[c]||[]);
  const win = growthWindows();
  document.getElementById("winNote").textContent =
    `Growth compares ${win.recent.from} → ${win.recent.to} with ${win.prior.from} → ${win.prior.to}` +
    (win.len<GROWTH_DAYS ? ` (${win.len}-day windows until there are ${GROWTH_DAYS*2} days of history).` : ".");
  cfg.sections.forEach(sec=>{
    const host = document.getElementById(sec.host);
    sec.cards.forEach((c,i)=>{
      const id = `${sec.host}-${i}`;
      card(host, {...c, id});
      const events = c.events(recs);
      const groups = groupBy(events);
      if(c.kind==="growth") growthChart(id, groups, win, cfg);
      else rankChart(id, groups, {...cfg, by:c.by});
      const note = c.note && c.note(events, recs);
      if(note) document.getElementById(id+"-note").textContent = note;
    });
  });
}

function bootAnalysis(cfg){
  fetch('data.json')
    .then(r=>r.json())
    .then(d=>{Object.assign(DATA,d); renderAnalysis(cfg);})
    .catch(e=>{console.error(e); document.querySelector("main").insertAdjacentHTML("afterbegin",
      '<div class="empty">Couldn\'t load data.json — has the build run yet?</div>');});
}
