(() => {
const C = window.DIP_CONFIG;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const lines = v => String(v ?? "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const uniq = a => [...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y));

let DOCS = [], view = [], page = 1, pageSize = C.PAGE_SIZE || 25;
const F = {q:"",city:"",department:"",experience:"",hospital:"",area:""};
let shortlist;
try { shortlist = new Set(JSON.parse(localStorage.getItem("dip_shortlist") || "[]")); }
catch { shortlist = new Set(); }
const safeUrl = value => {
  if (!value) return "";
  try { const u = new URL(value, location.href); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
};

const EXP_BUCKETS = [["", "Any"],["0-5","0–5 yrs"],["5-10","5–10 yrs"],["10-20","10–20 yrs"],["20+","20+ yrs"]];
const inBucket = (exp, b) => {
  if (!b) return true; if (exp == null) return false;
  if (b === "20+") return exp >= 20;
  const [lo, hi] = b.split("-").map(Number); return exp >= lo && exp < hi;
};

/* ---------- load from Google Sheets (JSONP: works from file:// and any host) ---------- */
function loadSheet() {
  return new Promise((resolve, reject) => {
    if (!C.SHEET_ID || C.SHEET_ID.startsWith("PASTE")) return reject(new Error("SHEET_ID not set in config.js"));
    const cb = "__dip_cb_" + Date.now();
    const s = document.createElement("script");
    const t = setTimeout(() => { done(); reject(new Error("Timed out — is the sheet shared as 'Anyone with the link: Viewer'?")); }, 20000);
    const done = () => { clearTimeout(t); delete window[cb]; s.remove(); };
    window[cb] = r => { done(); r && r.table ? resolve(r.table) : reject(new Error(r?.errors?.[0]?.message || "Bad response")); };
    s.onerror = () => { done(); reject(new Error("Could not load sheet — check sharing (Anyone with link → Viewer).")); };
    s.src = `https://docs.google.com/spreadsheets/d/${C.SHEET_ID}/gviz/tq?gid=${C.GID}&headers=1&tqx=out:json;responseHandler:${cb}`;
    document.body.appendChild(s);
  });
}

/* ---------- map sheet columns -> doctor objects ---------- */
function parseTable(table) {
  const labels = table.cols.map(c => (c.label || "").trim().toLowerCase());
  const find = (re, fb) => { const i = labels.findIndex(l => re.test(l)); return i >= 0 ? i : (fb ?? -1); };
  const I = {
    name: find(/doctor\s*name/, 1), dept: find(/^department/, 2), desig: find(/^designation/, 3),
    edu: find(/educational/, 4), inst: find(/institut/, 5), year: find(/^year/, 6), exp: find(/^exp/, 7),
    source: find(/^source$/), sourceUrl: find(/^source\s*(?:link|url)$/),
    photo: find(/photo|image/), phone: find(/contact|phone|mobile/)
  };
  const branchCols = [];
  for (let n = 1; n <= 10; n++) {
    const b = {
      hospital: find(new RegExp(`hospital\\s*${n}\\b`), n === 1 ? 8 : -1),
      city: find(new RegExp(`^city\\s*\\(${n}\\)`), n === 1 ? 9 : n === 2 ? 10 : -1),
      area: find(new RegExp(`^area\\s*\\(${n}\\)`)),
      branch: find(new RegExp(`^branch\\s*\\(${n}\\)$`), n === 1 ? 11 : n === 2 ? 13 : -1),
      url: find(new RegExp(`^branch\\s*\\(${n}\\).*url`), n === 1 ? 12 : n === 2 ? 14 : -1),
    };
    if (b.branch >= 0 || b.city >= 0 || b.hospital >= 0) branchCols.push(b);
  }
  const out = [];
  table.rows.forEach((r, k) => {
    const v = i => (i >= 0 && r.c[i] && r.c[i].v != null) ? String(r.c[i].v).trim() : "";
    const name = v(I.name); if (!name) return;
    const courses = lines(v(I.edu)), insts = lines(v(I.inst)), years = lines(v(I.year));
    const education = courses.map((c, j) => ({course: c, inst: insts[j] || "", year: years[j] || ""}));
    const expText = v(I.exp); const expNum = parseFloat(expText);
    const hospital = v(branchCols[0]?.hospital ?? -1);
    const branches = branchCols.map(b => ({
      hospital: v(b.hospital) || hospital, branch: v(b.branch), city: v(b.city), area: v(b.area), url: v(b.url)
    })).filter(b => b.branch || b.city || b.area);
    const d = {
      id: k, name, dept: v(I.dept), desig: v(I.desig), education, hospital,
      expText, exp: isNaN(expNum) ? null : expNum, branches, source: v(I.source), sourceUrl: v(I.sourceUrl), photo: v(I.photo), phone: v(I.phone)
    };
    d._s = [name, d.dept, d.desig, hospital, expText, d.source, d.sourceUrl, v(I.phone), ...branches.flatMap(b => [b.branch, b.city, b.area, b.url]), ...courses, ...insts, ...years].join(" ").toLowerCase();
    d._cities = branches.map(b => b.city); d._areas = branches.map(b => b.area);
    out.push(d);
  });
  return out;
}

/* ---------- fictional sample profiles for preview ---------- */
const sampleDoctor = (name, dept, hospital, expText, locations, courses) => ({
  name, dept, desig:"Consultant", hospital, expText, exp:parseFloat(expText), photo:"",
  phone:"", samplePhoneAction:true, source:"", sourceUrl:"",
  education:courses.map((course,j)=>({course,inst:j===0?"City Medical College":"Regional Institute",year:String(2004+j*3)})),
  branches:locations.map(([branch,city,area])=>({hospital,branch,city,area,url:""}))
});
const SAMPLE = [
  {
    name:"Dr. Chandra Sek",dept:"Neuro Sciences",desig:"Sr. Consultant",hospital:"Tx Hospital",expText:"11+",exp:11,samplePhoneAction:true,
    education:[
      {course:"MS (General Surgery)",inst:"Delhi Medical college",year:"2026"},
      {course:"MCH (Neurosurgery)",inst:"NA",year:"2002"},
      {course:"DNB (Neurosurgery)",inst:"Mumbai Medical College",year:"1990"},
      {course:"FRCS",inst:"NA",year:"NA"},
      {course:"FNB (Neurointervention)",inst:"Gujarat MC",year:"NA"}
    ],
    branches:[
      {hospital:"Tx Hospital",branch:"Tx Hospital, Banjara Hills, Hyderabad",city:"Delhi",area:"",url:"https://txhospitals.in/dr-chandra-sekhar-tavisetty-top-neuro-surgeon-in-hyderabad/"},
      {hospital:"Tx Hospital",branch:"-TxHospital, Chappal Bazar, Kachiguda, Hyderabad",city:"Gurgaon",area:"",url:"https://txhospitals.in/dr-chandra-sekhar-tavisetty-top-neuro-surgeon-in-hyderabad/"}
    ],photo:"",phone:"",source:"",sourceUrl:""
  },
  sampleDoctor("Dr. Asha Rao","Cardiology","Sample Care Hospital","8",[["Central Clinic","Sample City","Central District"],["Riverside Clinic","Sample City","Riverside"]],["MBBS","MD Cardiology","DM Cardiology"]),
  sampleDoctor("Dr. Kiran Shah","Paediatrics","Example General Hospital","14",[["Children's Clinic","Sample City","North Quarter"]],["MBBS","MD Paediatrics"]),
  sampleDoctor("Dr. Maya Patel","Dermatology","CarePoint Health Centre","5",[["Westside Branch","Example Town","Westside"],["Market Clinic","Example Town","Market Road"]],["MBBS","DDVL","DNB Dermatology"]),
  sampleDoctor("Dr. Neel Shah","Orthopaedics","Sample Care Hospital","22",[["Central Clinic","Sample City","Central District"],["North Clinic","Sample City","North Quarter"],["East Clinic","Sample City","East Side"],["West Clinic","Sample City","Westside"],["Lake Clinic","Sample City","Lake Road"]],["MBBS","MS Orthopaedics","DNB Orthopaedics","Fellowship in Joint Replacement","Certificate in Sports Injury"]),
  sampleDoctor("Dr. Tara Nair","Neurology","NeuroCare Hospital","11",[["Neuro Clinic","Example Town","Medical Quarter"]],["MBBS","MD Medicine","DM Neurology","Fellowship in Stroke Care"]),
  sampleDoctor("Dr. Riya Menon","Gynaecology","Women's Care Hospital","9",[["Main Centre","Sample City","Central District"],["Garden Branch","Sample City","Garden Road"],["Hill Clinic","Example Town","Hill View"]],["MBBS","MS Obstetrics & Gynaecology"]),
  sampleDoctor("Dr. Kabir Mehta","Ophthalmology","Vision Care Hospital","16",[["Main Eye Centre","Sample City","Central District"],["North Eye Clinic","Sample City","North Quarter"],["East Eye Clinic","Sample City","East Side"],["West Eye Clinic","Sample City","Westside"],["Lake Eye Clinic","Sample City","Lake Road"],["Market Eye Clinic","Example Town","Market Road"]],["MBBS","MS Ophthalmology","DNB Ophthalmology","Fellowship in Retina","Fellowship in Cornea"]),
  sampleDoctor("Dr. Sara Iyer","Oncology","Oncology Care Centre","18",[["Cancer Centre","Sample City","Medical Quarter"],["Day Care Unit","Sample City","Central District"],["North Oncology Clinic","Sample City","North Quarter"],["East Oncology Clinic","Example Town","East Side"]],["MBBS","MD Radiotherapy","DM Medical Oncology"]),
  sampleDoctor("Dr. Dev Kumar","Psychiatry","Mindful Care Clinic","6",[["Wellness Centre","Example Town","Westside"]],["MBBS","MD Psychiatry"]),
  sampleDoctor("Dr. Nila Rao","ENT","Sample Specialty Hospital","12",[["ENT Main Clinic","Sample City","Central District"],["North ENT Clinic","Sample City","North Quarter"],["Riverside ENT Clinic","Example Town","Riverside"]],["MBBS","MS ENT","DNB Otorhinolaryngology","Fellowship in Head & Neck Surgery"])
].map((d,i)=>({...d,id:i,_s:[d.name,d.dept,d.desig,d.hospital,d.expText,d.phone,...d.branches.flatMap(b=>[b.branch,b.city,b.area]),...d.education.flatMap(e=>[e.course,e.inst,e.year])].join(" ").toLowerCase(),_cities:d.branches.map(b=>b.city),_areas:d.branches.map(b=>b.area)}));

/* ---------- filters ---------- */
function fillSelect(id, values, label) {
  const el = $(id); const cur = el.value;
  el.innerHTML = `<option value="">${label}</option>` + values.map(v => {
    const [val, text] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(val)}">${esc(text)}</option>`;
  }).join("");
  el.value = cur;
}
function buildFilters() {
  fillSelect("#f-city", uniq(DOCS.flatMap(d => d._cities)), "All cities");
  fillSelect("#f-department", uniq(DOCS.map(d => d.dept)), "All departments");
  fillSelect("#f-experience", EXP_BUCKETS.slice(1), "Any experience");
  fillSelect("#f-hospital", uniq(DOCS.flatMap(d => [d.hospital, ...d.branches.map(b => b.branch)])), "All hospitals");
  fillSelect("#f-area", uniq(DOCS.flatMap(d => d._areas)), "All areas");
}
function applyFilters() {
  const q = F.q.toLowerCase().trim();
  view = DOCS.filter(d =>
    (!q || d._s.includes(q)) &&
    (!F.city || d._cities.includes(F.city)) &&
    (!F.department || d.dept === F.department) &&
    inBucket(d.exp, F.experience) &&
    (!F.hospital || d.hospital === F.hospital || d.branches.some(b => b.branch === F.hospital)) &&
    (!F.area || d._areas.includes(F.area)));
  page = 1; render();
}

/* ---------- render (one page of DOM at a time => fast with 10,000+ docs) ---------- */
const dash = v => v ? esc(v) : `<span class="empty">—</span>`;
function illustratedDoctorPortrait(i) {
  const skin = ["#9a5b3f", "#c6815a", "#e0a27c", "#8b503c"][i % 4];
  const hair = ["#282321", "#211d1b", "#4b3028", "#302623"][i % 4];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="20" fill="#dda474"/><ellipse cx="80" cy="65" rx="36" ry="42" fill="${hair}"/><ellipse cx="80" cy="72" rx="25" ry="30" fill="${skin}"/><path d="M55 67c3-26 18-38 34-38 13 0 23 9 26 28-15-9-39-8-60 10z" fill="${hair}"/><circle cx="71" cy="72" r="2.2" fill="#242424"/><circle cx="89" cy="72" r="2.2" fill="#242424"/><path d="M73 86q7 5 14 0" fill="none" stroke="#703d35" stroke-width="2" stroke-linecap="round"/><path d="M8 160c4-34 29-49 54-52l18 19 18-19c25 3 50 18 54 52" fill="#fff"/><path d="M67 109l13 20 13-20" fill="#d9e8f0"/><path d="M64 110c-8 13-5 29 4 39m28-39c8 13 5 29-4 39" fill="none" stroke="#53748a" stroke-width="3"/><circle cx="80" cy="148" r="4" fill="#53748a"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function rowHTML(d) {
  const br = d.branches.length ? d.branches : [{branch: d.hospital, city: "", area: "", url: ""}];
  const edu = d.education.length ? d.education : [{course: "", inst: "", year: ""}];
  const saved = shortlist.has(d.name);
  const brRows = br.map(b => `<tr>
      <td>${dash(d.dept)}</td><td>${dash(d.desig)}</td>
      <td>${dash(b.branch)}</td>
      <td>${dash(b.city)}</td><td>${dash(b.area)}</td>
      <td>${safeUrl(b.url) ? `<a href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener noreferrer">View profile</a>` : dash("")}</td></tr>`).join("");
  const source = d.source ? `<span>Source: ${esc(d.source)}</span>` : "";
  const sourceUrl = safeUrl(d.sourceUrl);
  const sourceLink = sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Source link</a>` : "";
  return `<article class="card" data-id="${d.id}">
   <div class="col">
     <div class="who">
       <div class="avatar"><img loading="lazy" src="${safeUrl(d.photo) ? esc(safeUrl(d.photo)) : illustratedDoctorPortrait(d.id)}" alt="Illustrated portrait of ${esc(d.name)}"></div>
       <div class="name">${esc(d.name)}</div>
     </div>
   </div>

   <div class="col">
     <table class="t kv"><tbody>
       <tr><th>Hospital</th><td>${dash(d.hospital)}</td></tr>
       <tr><th>Exp</th><td>${d.expText ? esc(d.expText) + " Yrs" : dash("")}</td></tr>
     </tbody></table>
     <div class="table-scroll branches-scroll" aria-label="Working locations; scroll for more than four branches">
       <table class="t branches">
         <colgroup><col style="width:17%"><col style="width:16%"><col style="width:19%"><col style="width:15%"><col style="width:17%"><col style="width:16%"></colgroup>
         <thead><tr><th>Department</th><th>Designation</th><th>Branch</th><th>City</th><th>Area</th><th>Profile</th></tr></thead>
         <tbody>${brRows}</tbody>
       </table>
     </div>
     ${source || sourceLink ? `<div class="source-line">${source}${sourceLink}</div>` : ""}
   </div>

   <div class="col">
     <div class="table-scroll education-scroll" aria-label="Education; scroll for more than four qualifications">
       <table class="t edu">
         <colgroup><col style="width:38%"><col style="width:42%"><col style="width:20%"></colgroup>
         <thead><tr><th>Course</th><th>Institution</th><th>Year</th></tr></thead>
         <tbody>${edu.map(e => `<tr><td>${dash(e.course)}</td><td>${dash(e.inst)}</td><td>${dash(e.year)}</td></tr>`).join("")}</tbody>
       </table>
     </div>
     <div class="education-actions">
       ${d.phone && !d.samplePhoneAction ? `<div class="status"><i></i><span>Appointment contact No:</span><b>${esc(d.phone)}</b></div>` : ""}
       <div class="action-buttons">
         ${d.samplePhoneAction ? `<button class="btn primary" data-act="book-sample" type="button">Book Appointment</button>`
           : d.phone ? `<a class="btn primary" href="tel:${esc(d.phone.replace(/[^+\d]/g, ""))}">Book Appointment</a>`
           : `<button class="btn primary unavailable" type="button" disabled>Phone unavailable</button>`}
         <button class="btn save${saved ? " on" : ""}" data-act="short" type="button">${saved ? "♥ Shortlisted" : "♡ Shortlist"}</button>
       </div>
     </div>
   </div>
  </article>`;
}
function render() {
  const total = view.length, pages = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, pages);
  const slice = view.slice((page - 1) * pageSize, page * pageSize);
  $("#rows").innerHTML = slice.length ? slice.map(rowHTML).join("") : `<div class="none">No doctors match these filters.</div>`;
  renderPager(pages);
}
function renderPager(pages) {
  const p = $("#pager"); if (pages <= 1) { p.innerHTML = ""; return; }
  const set = new Set([1, pages, page, page-1, page+1, page-2, page+2].filter(n => n >= 1 && n <= pages));
  const nums = [...set].sort((a,b)=>a-b); let html = `<button data-p="${page-1}" ${page===1?"disabled":""}>‹</button>`, prev = 0;
  nums.forEach(n => { if (n - prev > 1) html += `<button disabled>…</button>`; html += `<button data-p="${n}" class="${n===page?"cur":""}">${n}</button>`; prev = n; });
  p.innerHTML = html + `<button data-p="${page+1}" ${page===pages?"disabled":""}>›</button>`;
}

/* ---------- events ---------- */
let t; $("#q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; applyFilters(); }, 200); });
["city","department","experience","hospital","area"].forEach(k => $("#f-"+k).addEventListener("change", e => { F[k] = e.target.value; applyFilters(); }));
$("#reset").addEventListener("click", () => { Object.keys(F).forEach(k => F[k] = ""); $("#q").value = ""; document.querySelectorAll(".filters select").forEach(s => s.value = ""); applyFilters(); });
$("#page-size").addEventListener("change", e => { pageSize = +e.target.value; page = 1; render(); });
$("#pager").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return; page = +b.dataset.p; render(); window.scrollTo({top:0,behavior:"smooth"}); });
$("#rows").addEventListener("click", e => {
  const card = e.target.closest(".card"); if (!card) return;
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const d = DOCS.find(x => x.id === +card.dataset.id);
  if (b.dataset.act === "short") {
    shortlist.has(d.name) ? shortlist.delete(d.name) : shortlist.add(d.name);
    localStorage.setItem("dip_shortlist", JSON.stringify([...shortlist]));
    const on = shortlist.has(d.name); b.classList.toggle("on", on); b.textContent = on ? "♥ Shortlisted" : "♡ Shortlist";
  } else if (b.dataset.act === "book-sample") alert("This sample listing has no real phone number. Add a verified contact to enable appointment calls.");
});

/* ---------- boot ---------- */
(async () => {
  $("#page-size").value = String(pageSize);
  try { DOCS = parseTable(await loadSheet()); DOCS.forEach((d,i)=>d.id=i); }
  catch { DOCS = SAMPLE; $("#banner").hidden = true; }
  buildFilters(); view = DOCS; render();
})();
})();
