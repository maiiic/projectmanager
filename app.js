// Paste your Supabase project URL and anon (public) key. Never use the service_role key here.
const SUPABASE_URL = "https://yginexyfrteirmwdegnx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SnDADsUXfW1THjWNQstWGQ_8iseB7bW";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Google Calendar: paste your OAuth "Web application" client ID (see setup steps).
const GOOGLE_CLIENT_ID = "521306182221-jgur5pekktg4vi3mf2o3e7u49uur6vic.apps.googleusercontent.com";
const GSCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const S = { user: null, groups: [], choosingGroup: false, group: null, members: [], tasks: [], busy: [], meetings: [], mine: new Set(), dirty: false, view: "home", month: new Date(now.getFullYear(), now.getMonth(), 1), sub: false, cols: [], doneIds: new Set(), dragging: false, gtoken: null, gcals: [], gevents: [], gerr: "" };
const DAYS = ["M", "T", "W", "Th", "F", "S"], SLOTS = 32, PR = ["", "Low", "Medium", "High"];
const FIELDS = [
  ["role", "Role", "text", "e.g. Designer, Developer"],
  ["full_name", "Display name", "text", "How teammates should call you"],
  ["id_number", "ID number", "text", "e.g. Student ID"],
  ["address", "Address", "text", "City or address (optional)"],
  ["contact", "Contact number", "tel", "e.g. +63 912 345 6789"],
  ["discord", "Discord handle", "text", "e.g. username"],
  ["birthday", "Birthday", "date", ""]
];
const COLORS = [
  { name: "Sky", hex: "#4f94dc" }, { name: "Rose", hex: "#e6708f" },
  { name: "Mint", hex: "#19a690" }, { name: "Lilac", hex: "#8878e4" },
  { name: "Amber", hex: "#d99e2e" }, { name: "Slate", hex: "#7286a0" }
];
const safeColor = (v) => COLORS.find((c) => c.hex === String(v || "").toLowerCase())?.hex || COLORS[0].hex;
const applyTheme = (value) => { document.documentElement.dataset.theme = value === "dark" ? "dark" : "light"; };
const meProfile = () => S.members.find((p) => p.id === S.user?.id);
const myTheme = () => meProfile()?.theme || "light";

const nm = (p) => (p ? p.full_name || (p.email || "Member").split("@")[0] : "Unassigned");
const today = () => new Date(new Date().setHours(0, 0, 0, 0));
const left = (t) => (t.due ? Math.round((new Date(t.due + "T00:00") - today()) / 864e5) : 9999);
const urgent = (a, b) => left(a) - left(b) || b.priority - a.priority;
const dueLabel = (t) => { const d = left(t); return !t.due ? "No date" : d < 0 ? `${-d}d overdue` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `In ${d} days`; };
const who = (t) => nm(S.members.find((p) => p.id === t.assignee));
const isDone = (t) => S.doneIds.has(t.column_id);
const FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const tl = (i) => { const m = 480 + 30 * i, h = Math.floor(m / 60) % 24; return `${((h + 11) % 12) + 1}:${m % 60 ? "30" : "00"} ${h < 12 ? "AM" : "PM"}`; };
const th = (i) => tl(i).replace(":00", "");

/* ---------- sign in ---------- */
let mode = "signin";
function setMode(next) {
  mode = next;
  const si = mode === "signin";
  $("tab-signin").classList.toggle("is-active", si);
  $("tab-signup").classList.toggle("is-active", !si);
  $("tab-signin").setAttribute("aria-selected", String(si));
  $("tab-signup").setAttribute("aria-selected", String(!si));
  $("submit-btn").textContent = si ? "Sign in" : "Create account";
  $("password").autocomplete = si ? "current-password" : "new-password";
  showMessage("");
}
function showMessage(text, isError = false) {
  $("message").textContent = text;
  $("message").hidden = !text;
  $("message").classList.toggle("is-error", isError);
}
$("tab-signin").onclick = () => setMode("signin");
$("tab-signup").onclick = () => setMode("signup");
$("auth-form").onsubmit = async (e) => {
  e.preventDefault();
  showMessage("");
  $("submit-btn").disabled = true;
  const email = $("email").value.trim(), password = $("password").value;
  try {
    if (mode === "signup") {
      const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: location.href } });
      if (error) throw error;
      if (!data.session) showMessage("Almost there! Check your email and click the link to confirm your account.");
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    showMessage(err.message, true);
  } finally {
    $("submit-btn").disabled = false;
  }
};
$("signout-btn").onclick = () => db.auth.signOut();

// Supabase Google Sign-In (separate from Google Calendar permissions).
// Obtain the provider URL, then navigate explicitly so failures are visible.
const googleLoginButton = $("google-login-btn");
if (googleLoginButton) {
  googleLoginButton.addEventListener("click", async () => {
    if (googleLoginButton.disabled) return;
    googleLoginButton.disabled = true;
    googleLoginButton.dataset.originalLabel ||= googleLoginButton.innerHTML;
    googleLoginButton.textContent = "Connecting to Google…";
    showMessage("");
    try {
      const { data, error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "https://maiiic.github.io/projectmanager/",
          skipBrowserRedirect: true
        }
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Supabase did not return a Google sign-in URL. Check the Google provider settings in Supabase.");
      window.location.assign(data.url);
    } catch (err) {
      console.error("Google login failed:", err);
      showMessage("Google sign-in failed: " + (err?.message || String(err)), true);
      googleLoginButton.disabled = false;
      googleLoginButton.innerHTML = googleLoginButton.dataset.originalLabel;
    }
  });
}

/* ---------- data ---------- */
async function boot(session) {
  const previousUser = S.user?.id;
  S.user = session?.user || null;
  $("auth-page").hidden = !!S.user;
  $("app-view").hidden = !S.user;
  if (!S.user) {
    applyTheme("light");
    S.group = null; S.groups = []; S.choosingGroup = false;
    S.gtoken = null; S.gcals = []; S.gevents = [];
    if (S.channel) { await db.removeChannel(S.channel); S.channel = null; }
    return;
  }
  if (previousUser && previousUser !== S.user.id) {
    S.group = null; S.gtoken = null; S.gcals = []; S.gevents = [];
  }
  $("who").textContent = S.user.email || "Signed in";
  await refreshGroups();
  if (!S.groups.length) return showGroupPicker();
  let preferred;
  try { preferred = localStorage.getItem(`pm-group-${S.user.id}`); } catch {}
  const selected = S.groups.find((g) => g.id === preferred) || S.groups[0];
  await selectGroup(selected);
}

async function refreshGroups() {
  const { data, error } = await db.from("group_members")
    .select("groups(id,name,code,gcal_id)").eq("user_id", S.user.id);
  if (error) { alert(error.message); return; }
  S.groups = (data || []).map((x) => x.groups).filter(Boolean);
}

async function selectGroup(group) {
  if (!group) return showGroupPicker();
  if (S.channel) { await db.removeChannel(S.channel); S.channel = null; }
  S.group = group;
  S.choosingGroup = false;
  S.members = []; S.tasks = []; S.busy = []; S.meetings = [];
  S.cols = []; S.mine = new Set(); S.doneIds = new Set(); S.dirty = false;
  S.gevents = []; S.gerr = "";
  S.view = "home";
  try { localStorage.setItem(`pm-group-${S.user.id}`, group.id); } catch {}
  $("nav").hidden = false;
  $("group-name").textContent = group.name;
  $("group-code").textContent = `Invite code: ${group.code}`;
  await load(true);
  if (S.gtoken) { await gload(); draw(); }
  S.channel = db.channel(`pm-${group.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `group_id=eq.${group.id}` }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "availability", filter: `group_id=eq.${group.id}` }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "meetings", filter: `group_id=eq.${group.id}` }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "task_columns", filter: `group_id=eq.${group.id}` }, () => load())
    .subscribe();
}

function showGroupPicker() {
  S.choosingGroup = true;
  $("nav").hidden = true;
  $("group-name").textContent = "Your groups";
  $("group-code").textContent = "Choose, create or join";
  $("content").innerHTML = onboard();
}

$("group-switch-btn").onclick = async () => {
  await refreshGroups();
  showGroupPicker();
};

async function load(force) {
  if (!S.group || S.choosingGroup) return;
  const g = S.group.id;
  const r = await Promise.all([
    db.from("group_members").select("profiles(*)").eq("group_id", g),
    db.from("tasks").select("*").eq("group_id", g),
    db.from("availability").select("user_id,day,slot").eq("group_id", g),
    db.from("meetings").select("*").eq("group_id", g),
    db.from("task_columns").select("*").eq("group_id", g).order("position"),
  ]);
  const bad = r.find((x) => x.error);
  if (bad) return alert(bad.error.message);
  S.members = r[0].data.map((x) => x.profiles).filter(Boolean);
  applyTheme(myTheme());
  [S.tasks, S.busy, S.meetings, S.cols] = [r[1].data, r[2].data, r[3].data, r[4].data];
  S.doneIds = new Set(S.cols.filter((c) => c.is_done).map((c) => c.id));
  if (!S.dirty) S.mine = new Set(S.busy.filter((x) => x.user_id === S.user.id).map((x) => `${x.day}-${x.slot}`));
  if (force || !(S.dragging || document.activeElement?.matches("#content input, #content select, #content textarea"))) draw();
}

/* ---------- views ---------- */
function draw() {
  if (S.choosingGroup) return showGroupPicker();
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("is-active", b.dataset.go === S.view));
  $("content").innerHTML = { home, tasks, schedule, invites, directory, settings }[S.view]();
}

function calendar() {
  const d = S.month, y = d.getFullYear(), m = d.getMonth(), n = new Date(y, m + 1, 0).getDate();
  const t0 = today().toLocaleDateString("en-CA");
  let h = `<div class="cal-head"><button class="icon" data-m="-1" aria-label="Previous month">‹</button><h2>${d.toLocaleString("en", { month: "long", year: "numeric" })}</h2><button class="icon" data-m="1" aria-label="Next month">›</button></div><div class="cal">`;
  h += ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => `<b>${x}</b>`).join("") + "<span></span>".repeat(new Date(y, m, 1).getDay());
  for (let i = 1; i <= n; i++) {
    const iso = `${y}-${pad(m + 1)}-${pad(i)}`;
    const ev = [
      ...S.meetings.filter((x) => new Date(x.starts_at).toLocaleDateString("en-CA") === iso).map((x) => [x.title, "m"]),
      ...S.gevents.filter((x) => x.day === iso && !S.meetings.some((m) => m.gcal_event_id === x.id)).map((x) => [x.title, "g"]),
      ...S.tasks.filter((x) => x.due === iso && !isDone(x)).map((x) => [x.title, ""]),
    ];
    h += `<i class="${iso === t0 ? "today" : ""}">${i}${ev.slice(0, 2).map(([a, c]) => `<span class="chip ${c}">${esc(a)}</span>`).join("")}${ev.length > 2 ? `<small>+${ev.length - 2} more</small>` : ""}</i>`;
  }
  return h + `</div><p class="legend"><span><i class="dot c3"></i>Due dates</span><span><i class="dot c2"></i>Meetings</span><span><i class="dot c0"></i>Google Calendar</span></p>`;
}

function home() {
  const done = S.tasks.filter(isDone);
  const open = S.tasks.filter((t) => !isDone(t)).sort(urgent);
  const late = open.filter((t) => left(t) < 0).length;
  const week = open.filter((t) => left(t) >= 0 && left(t) <= 7).length;
  const pct = S.tasks.length ? Math.round((done.length / S.tasks.length) * 100) : 0;
  const legend = S.cols.map((c, i) => `<span><i class="dot c${i % 5}"></i>${esc(c.name)} ${S.tasks.filter((t) => t.column_id === c.id).length}</span>`).join("");
  const me = S.members.find((p) => p.id === S.user.id);
  const load = S.members.map((p) => [nm(p), open.filter((t) => t.assignee === p.id).length]);
  const unassigned = open.filter((t) => !t.assignee).length;
  if (unassigned) load.push(["Unassigned", unassigned]);
  const top = Math.max(1, ...load.map((x) => x[1]));
  const meets = S.meetings.filter((x) => new Date(x.starts_at) >= new Date()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 3);
  return `<h1>Hi, ${esc(nm(me))}!</h1><p class="hint">Here’s where the project stands.</p>
  <div class="stats">
    <div class="stat s1"><b>${open.length}</b><span>Open tasks</span></div>
    <div class="stat s2"><b>${week}</b><span>Due in 7 days</span></div>
    <div class="stat s3"><b>${late}</b><span>Overdue</span></div>
    <div class="stat s4"><b>${pct}%</b><span>Completed</span></div>
  </div>
  <section class="panel prog"><h2>Overall progress <small>${done.length} of ${S.tasks.length} tasks done</small></h2>
    <progress max="${Math.max(S.tasks.length, 1)}" value="${done.length}"></progress>
    <p class="legend">${legend}</p></section>
  <div class="home"><section class="panel">${gbar()}${calendar()}</section>
  <div class="stack">
    <aside class="panel"><h2>Most pressing</h2>${open.slice(0, 5).map((t) => `<div class="row"><div><b>${esc(t.title)}</b><small>${esc(who(t))}</small></div><span class="due ${left(t) < 0 ? "late" : ""}">${dueLabel(t)}</span></div>`).join("") || '<p class="empty">Nothing due. Add a task to get started.</p>'}</aside>
    <aside class="panel"><h2>Team workload <small>open tasks</small></h2>${load.map(([n, c]) => `<div class="load"><span>${esc(n)}</span><progress class="work" max="${top}" value="${c}"></progress><b>${c}</b></div>`).join("")}</aside>
    <aside class="panel"><h2>Upcoming meetings</h2>${meets.map((x) => `<div class="row"><div><b>${esc(x.title)}</b></div><span class="due">${new Date(x.starts_at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>`).join("") || '<p class="empty">No meetings scheduled yet.</p>'}</aside>
  </div></div>`;
}

const card = (t) => `<article class="tcard" draggable="true" data-id="${t.id}"><p>${esc(t.title)}</p>
  <div class="meta"><span class="pill p${t.priority}">${PR[t.priority]}</span><span class="due ${left(t) < 0 && !isDone(t) ? "late" : ""}">${dueLabel(t)}</span></div>
  <div class="meta"><small>${esc(who(t))}</small>
  <select class="st${S.cols.findIndex((c) => c.id === (t.column_id || S.cols[0].id)) % 5}" data-move="${t.id}" aria-label="Status">${S.cols.map((c) => `<option value="${c.id}"${(t.column_id || S.cols[0].id) === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
  <button type="button" class="icon" data-del="${t.id}" aria-label="Delete task">✕</button></div></article>`;

function tasks() {
  const opts = S.members.map((p) => `<option value="${p.id}">${esc(nm(p))}</option>`).join("");
  return `<div class="bar"><div><h1>Tasks</h1><p class="hint">Sorted by due date, then priority. Drag cards between columns, or click a column name to rename it.</p></div>
  <button type="button" class="btn btn-quiet" data-addcol>+ Add column</button></div>
  <form class="addtask" data-form="task"><input name="title" placeholder="New task" required>
  <input name="due" type="date" aria-label="Due date"><select name="priority" aria-label="Priority"><option value="3">High</option><option value="2" selected>Medium</option><option value="1">Low</option></select>
  <select name="assignee" aria-label="Assignee"><option value="">Unassigned</option>${opts}</select><button class="btn">Add task</button></form>
  <div class="board">` + S.cols.map((c, i) => {
    const list = S.tasks.filter((t) => t.column_id === c.id || (!t.column_id && i === 0)).sort(urgent);
    return `<section class="col" data-cid="${c.id}"><h2><input class="colname" data-rename="${c.id}" value="${esc(c.name)}" aria-label="Column name"><small>${list.length}</small>${list.length ? "" : `<button type="button" class="icon" data-delcol="${c.id}" aria-label="Delete empty column">✕</button>`}</h2>${list.map(card).join("") || '<p class="empty">Drop tasks here</p>'}</section>`;
  }).join("") + "</div>";
}

function bestTimes(B) {
  const free = (d, s) => S.members.every((p) => !B[p.id]?.has(`${d}-${s}`));
  const out = [];
  for (let d = 0; d < 6; d++) {
    for (let s = 0; s < SLOTS; ) {
      if (!free(d, s)) { s++; continue; }
      let e = s;
      while (e < SLOTS && free(d, e)) e++;
      if (e - s >= 2) out.push({ d, s, e });
      s = e;
    }
  }
  return out.sort((a, b) => b.e - b.s - (a.e - a.s) || a.d - b.d || a.s - b.s).slice(0, 6);
}

function schedule() {
  const B = {};
  S.busy.forEach((r) => (B[r.user_id] ??= new Set()).add(`${r.day}-${r.slot}`));
  const n = S.members.length;
  const first = (p) => nm(p).split(" ")[0];
  const best = S.busy.length ? bestTimes(B) : [];
  const label = (free) => {
    if (!free.length) return "Nobody";
    if (free.length === n) return "All";
    return free.map(first).join(", ");
  };
  // Left-side group overview; the same 32 half-hour rows as each mini-calendar.
  let ov = `<section class="availability-overview"><div class="overview-title">Group availability <small>08:00 AM – 12:00 AM</small></div><div class="g ov"><span class="time-head">TIME</span>${FULL.map((d) => `<b>${d.slice(0, 3)}</b>`).join("")}`;
  for (let s = 0; s < SLOTS; s++) {
    ov += `<em>${tl(s)}</em>`;
    for (let d = 0; d < 6; d++) {
      const free = S.members.filter((p) => !B[p.id]?.has(`${d}-${s}`));
      const state = free.length === n ? "l4" : free.length ? "l2" : "l0";
      const names = label(free);
      ov += `<i class="c ${state}" title="${esc(free.map(nm).join(", ") || "Nobody")}">${esc(names)}</i>`;
    }
  }
  ov += `</div></section>`;
  const ordered = [...S.members].sort((a, b) => (b.id === S.user.id) - (a.id === S.user.id));
  const members = ordered.map((p) => {
    const me = p.id === S.user.id;
    const set = me ? S.mine : B[p.id] || new Set();
    const color = safeColor(p.preferred_color);
    let markup = `<section class="person-schedule${me ? " is-mine" : ""}" style="--u:${color}"><div class="person-schedule-title"><span class="member-indicator" style="background:${color}"></span><strong>${esc(nm(p))}${me ? " (you)" : ""}</strong><small>${set.size / 2}h busy</small></div><div class="g mg${me ? " me" : ""}"><span class="mini-time-head"></span>${DAYS.map((d) => `<b>${d}</b>`).join("")}`;
    for (let s = 0; s < SLOTS; s++) {
      markup += `<em>${s % 4 === 0 ? th(s) : ""}</em>`;
      for (let d = 0; d < 6; d++) {
        const busy = set.has(`${d}-${s}`);
        markup += `<i class="c${busy ? " x" : ""}" title="${esc(`${FULL[d]}, ${tl(s)} — ${busy ? "Unavailable" : "Available"}`)}"${me ? ` data-d="${d}" data-s="${s}"` : ""}></i>`;
      }
    }
    return markup + `</div></section>`;
  }).join("");
  return `<div class="schedule-page"><div class="bar schedule-head"><div><h1>Schedule</h1><p class="hint" id="sv-hint">${S.dirty ? "Unsaved changes — save your availability." : "Mark the squares when you're unavailable. Scroll sideways to view everyone."}</p></div>
    <div class="actions"><button type="button" class="btn btn-quiet" data-act="clear">Clear mine</button><button type="button" class="btn" data-act="save">Save availability</button></div></div>
    <section class="schedule-best"><strong>Best times to meet</strong><div class="schedule-best-list">${best.map((x) => `<span class="tag"><b>${FULL[x.d]}</b> ${tl(x.s)} – ${tl(x.e)}</span>`).join("") || `<span class="schedule-muted">${S.busy.length ? "No common 1-hour slot yet." : "Save your availability to see suggestions."}</span>`}</div></section>
    <div class="schedule-legend"><span><i class="dot l4"></i>Everyone free</span><span><i class="dot l2"></i>Some free</span><span><i class="dot l0"></i>Nobody</span><span class="schedule-legend-tip">Your colored squares = unavailable</span></div>
    <div class="schedule-scroll" role="region" aria-label="Group and individual availability calendars" tabindex="0"><div class="schedule-track">${ov}<div class="member-calendars">${members}</div></div></div></div>`;
}

/* ---------- Google Calendar ---------- */
async function gapi(path, opts = {}) {
  const r = await fetch("https://www.googleapis.com/calendar/v3/" + path, { ...opts, headers: { Authorization: "Bearer " + S.gtoken, "Content-Type": "application/json" } });
  if (r.status === 401) { S.gtoken = null; throw new Error("Google session expired. Click Connect Google Calendar again."); }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "Google Calendar error");
  return j;
}

function gconnect() {
  if (GOOGLE_CLIENT_ID.startsWith("PASTE")) return alert("Add your Google client ID at the top of app.js first.");
  if (!window.google?.accounts?.oauth2) return alert("Google sign-in is still loading. Try again in a moment.");
  google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID, scope: GSCOPES,
    callback: async (r) => { if (r.error) return alert(r.error); S.gtoken = r.access_token; S.gerr = ""; await gload(); draw(); },
  }).requestAccessToken();
}

async function gload() {
  if (!S.gtoken) return;
  try {
    if (!S.gcals.length) S.gcals = (await gapi("users/me/calendarList?minAccessRole=reader")).items || [];
    if (!S.group.gcal_id) { S.gevents = []; return; }
    const y = S.month.getFullYear(), m = S.month.getMonth();
    const q = new URLSearchParams({ timeMin: new Date(y, m, 1).toISOString(), timeMax: new Date(y, m + 1, 1).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    const j = await gapi(`calendars/${encodeURIComponent(S.group.gcal_id)}/events?${q}`);
    S.gevents = (j.items || []).map((e) => ({ id: e.id, title: e.summary || "(No title)", day: e.start.date || new Date(e.start.dateTime).toLocaleDateString("en-CA") }));
    S.gerr = "";
  } catch (err) { S.gerr = err.message; }
}

function gbar() {
  const opts = S.gcals.map((c) => `<option value="${esc(c.id)}"${c.id === S.group.gcal_id ? " selected" : ""}>${esc(c.summary)}</option>`).join("");
  return `<div class="gbar">${S.gtoken
    ? `<span class="tag p1">Google connected</span><select data-gcal aria-label="Group calendar"><option value="">Pick the group’s calendar</option>${opts}</select>`
    : `<button type="button" class="btn" data-act="gconnect">Connect Google Calendar</button>${S.group.gcal_id ? "<small>Your group has a shared calendar. Connect to show it here.</small>" : ""}`}
    ${S.gerr ? `<small class="bad">${esc(S.gerr)}</small>` : ""}</div>`;
}

function invites() {
  const rows = [...S.meetings].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  const cal = S.gcals.find((c) => c.id === S.group.gcal_id)?.summary || "your primary calendar";
  const when = (x) => { const a = new Date(x.starts_at), b = new Date(x.ends_at); return `${a.toLocaleString("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – ${b.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}`; };
  return `<div class="bar"><div><h1>Invites</h1><p class="hint">${S.gtoken ? `Invites are added to ${esc(cal)} and emailed to everyone below.` : "Connect Google Calendar on the Home page to send invites."}</p></div></div>
  <form class="panel inv" data-form="invite" novalidate>
    <div class="inv-grid">
      <label class="field"><span>Title</span><input name="title"></label>
      <label class="field"><span>Date</span><input name="date" type="date"></label>
      <label class="field"><span>Start</span><input name="start" type="time"></label>
      <label class="field"><span>End</span><input name="end" type="time"></label>
    </div>
    <label class="field"><span>Description</span><textarea name="description" rows="2"></textarea></label>
    <label class="field"><span>Emails <small>group members are added for you, one per line</small></span><textarea name="emails" rows="5">${esc(S.members.map((p) => p.email).join("\n"))}</textarea></label>
    <p id="inv-msg" class="message" role="status" hidden></p>
    <div class="actions"><button class="btn">Send invites</button></div>
  </form>
  <section class="panel"><h2>Scheduled meetings <small>${rows.length}</small></h2>${rows.length ? `<div class="hscroll"><table class="tbl"><thead><tr><th>Status</th><th>Meeting</th><th>Date &amp; time</th><th>People emailed</th></tr></thead><tbody>${rows.map((x) => `<tr><td><span class="pill p1">Sent</span></td><td>${esc(x.title)}</td><td>${esc(when(x))}</td><td title="${esc((x.emails || []).join(", "))}">${(x.emails || []).length} people</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">No meetings scheduled yet.</p>'}</section>`;
}

async function sendInvite(f, v) {
  const say = (t, bad) => { const m = $("inv-msg"); m.textContent = t; m.hidden = !t; m.classList.toggle("is-error", !!bad); };
  const list = [...new Set(v.emails.split(/[\s,;]+/).filter(Boolean).map((x) => x.toLowerCase()))];
  const badMail = list.filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const start = new Date(`${v.date}T${v.start}`), end = new Date(`${v.date}T${v.end}`);
  const problems = [];
  if (!v.title.trim()) problems.push("Add a title.");
  if (!v.date || !v.start || !v.end || isNaN(start) || isNaN(end)) problems.push("Pick a date, start time, and end time.");
  else if (end <= start) problems.push("The end time must be after the start time.");
  if (!list.length) problems.push("Add at least one email.");
  if (badMail.length) problems.push(`Fix these emails: ${badMail.join(", ")}.`);
  if (!S.gtoken) problems.push("Connect Google Calendar first (on the Home page).");
  if (problems.length) return say("Not sent. " + problems.join(" "), true);
  say("Sending invites…");
  try {
    const cal = encodeURIComponent(S.group.gcal_id || "primary");
    const ev = await gapi(`calendars/${cal}/events?sendUpdates=all`, { method: "POST", body: JSON.stringify({ summary: v.title.trim(), description: v.description.trim(), start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() }, attendees: list.map((email) => ({ email })) }) });
    const r = await db.from("meetings").insert({ group_id: S.group.id, title: v.title.trim(), starts_at: start.toISOString(), ends_at: end.toISOString(), description: v.description.trim() || null, emails: list, status: "sent", gcal_event_id: ev.id });
    if (fail(r)) return;
    f.reset();
    await load(true);
    say(`Invites sent to ${list.length} ${list.length === 1 ? "person" : "people"}.`);
  } catch (err) { say("Not sent. " + err.message, true); }
}

function directory() {
  return `<h1>Directory</h1><p class="hint">Your teammates' profiles and contact details.</p><div class="dir">` + S.members.map((p) => {
    const mine = p.id === S.user.id;
    const body = mine
      ? `<form data-form="profile">${FIELDS.map(([k, l, t, placeholder]) => `<label class="field"><span>${l}</span><input name="${k}" type="${t}" placeholder="${esc(placeholder)}" value="${esc(p[k])}"></label>`).join("")}<button class="btn">Save my info</button></form>`
      : `<dl>${FIELDS.slice(1).map(([k, l]) => `<dt>${l}</dt><dd>${esc(p[k]) || "—"}</dd>`).join("")}</dl>`;
    return `<article class="person"><header style="border-left:3px solid ${safeColor(p.preferred_color)}">${esc(p.role || "Member")}<small>${esc(nm(p))}${mine ? " (you)" : ""}</small></header><p class="mail">${esc(p.email)}</p>${body}</article>`;
  }).join("") + `</div>`;
}

function settings() {
  const p = meProfile() || {};
  const color = safeColor(p.preferred_color);
  return `<div class="settings-page"><h1>Settings</h1><p class="hint">Personalize how you appear to your group.</p>
  <form class="panel settings-card" data-form="settings">
    <h2>Your profile</h2>
    <label class="field"><span>Display name</span><input name="full_name" maxlength="80" placeholder="What should everyone call you?" value="${esc(p.full_name || "")}" required></label>
    <p class="settings-note">This name appears on tasks, schedules and the directory. Your Google account and email remain unchanged.</p>
    <h2>Your calendar color</h2>
    <div class="color-options" role="radiogroup" aria-label="Calendar color">${COLORS.map((c) => `<label class="color-option"><input type="radio" name="preferred_color" value="${c.hex}" ${color === c.hex ? "checked" : ""}><span class="color-swatch" style="background:${c.hex}"></span><span>${c.name}</span></label>`).join("")}</div>
    <h2>Appearance</h2>
    <div class="theme-options"><label><input type="radio" name="theme" value="light" ${p.theme !== "dark" ? "checked" : ""}> Light mode</label><label><input type="radio" name="theme" value="dark" ${p.theme === "dark" ? "checked" : ""}> Dark mode</label></div>
    <p id="settings-message" class="settings-feedback" role="status" hidden></p><button class="btn">Save preferences</button>
  </form></div>`;
}

const onboard = () => `<div class="workspace-head"><h1>Your workspace</h1><p class="hint">Choose a group, create one, or join your teammates with an invite code.</p></div>
  ${S.groups.length ? `<div class="workspace-list">${S.groups.map((g) => `<button type="button" class="workspace-item" data-pickgroup="${esc(g.id)}"><span class="workspace-badge">${esc(g.name.charAt(0).toUpperCase())}</span><span class="workspace-info"><strong>${esc(g.name)}</strong><small>Invite code: ${esc(g.code)}</small></span><span aria-hidden="true">›</span></button>`).join("")}</div>` : `<p class="workspace-empty">You're not part of any group yet. Start one below!</p>`}
  <div class="dir workspace-forms">
    <form class="person" data-form="create"><header>Create a group</header><label class="field"><span>Group name</span><input name="name" maxlength="100" placeholder="e.g. Thesis team" required></label><button class="btn">Create group</button></form>
    <form class="person" data-form="join"><header>Join a group</header><label class="field"><span>6-character invite code</span><input name="code" maxlength="6" placeholder="e.g. a1b2c3" required></label><button class="btn btn-quiet">Join group</button></form>
  </div>`;

/* ---------- actions ---------- */
$("nav").onclick = (e) => { const b = e.target.closest("[data-go]"); if (b) { S.view = b.dataset.go; draw(); } };

const fail = (r) => r.error && (alert(r.error.message), true);

async function moveTask(id, cid) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t || t.column_id === cid) return;
  t.column_id = cid;
  draw();
  if (fail(await db.from("tasks").update({ column_id: cid }).eq("id", id))) load(true);
}

$("content").onclick = async (e) => {
  const t = e.target.closest("[data-pickgroup],[data-m],[data-del],[data-act],[data-addcol],[data-delcol]");
  if (!t) return;
  const ds = t.dataset;
  if (ds.pickgroup) {
    const chosen = S.groups.find((g) => g.id === ds.pickgroup);
    if (chosen) await selectGroup(chosen);
  }
  else if (ds.m) { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + +ds.m, 1); draw(); if (S.gtoken) { await gload(); draw(); } }
  else if (ds.act === "gconnect") gconnect();
  else if (ds.del) { if (!fail(await db.from("tasks").delete().eq("id", ds.del))) load(true); }
  else if (ds.addcol !== undefined) {
    const position = Math.max(-1, ...S.cols.map((c) => c.position)) + 1;
    if (!fail(await db.from("task_columns").insert({ group_id: S.group.id, name: "New column", position }))) load(true);
  }
  else if (ds.delcol) { if (!fail(await db.from("task_columns").delete().eq("id", ds.delcol))) load(true); }
  else if (ds.act === "clear") { S.mine = new Set(); S.dirty = true; draw(); }
  else if (ds.act === "save") {
    const g = S.group.id, uid = S.user.id;
    let r = await db.from("availability").delete().eq("group_id", g).eq("user_id", uid);
    if (!r.error && S.mine.size) r = await db.from("availability").insert([...S.mine].map((k) => { const [day, slot] = k.split("-"); return { group_id: g, user_id: uid, day: +day, slot: +slot }; }));
    if (fail(r)) return;
    S.dirty = false;
    await load(true);
    const b = document.querySelector("[data-act=save]");
    if (b) b.textContent = "Saved!";
  }
};

$("content").onchange = async (e) => {
  const d = e.target.dataset;
  if (d.move) return moveTask(d.move, e.target.value);
  if (d.gcal !== undefined) {
    const id = e.target.value || null;
    if (fail(await db.rpc("set_group_calendar", { gid: S.group.id, calendar_id: id }))) return;
    S.group.gcal_id = id;
    await gload();
    return draw();
  }
  if (d.rename) {
    const name = e.target.value.trim();
    if (name) fail(await db.from("task_columns").update({ name }).eq("id", d.rename));
    load(true);
  }
};

$("content").onkeydown = (e) => { if (e.key === "Enter" && e.target.dataset.rename) e.target.blur(); };

/* drag cards between columns */
$("content").ondragstart = (e) => {
  const t = e.target.closest?.(".tcard");
  if (!t) return;
  S.dragging = true;
  e.dataTransfer.setData("text/plain", t.dataset.id);
  e.dataTransfer.effectAllowed = "move";
  t.classList.add("dragging");
};
$("content").ondragover = (e) => {
  const col = e.target.closest?.(".col");
  if (!col || !S.dragging) return;
  e.preventDefault();
  document.querySelectorAll(".col.over").forEach((x) => x !== col && x.classList.remove("over"));
  col.classList.add("over");
};
$("content").ondrop = (e) => {
  const col = e.target.closest?.(".col");
  if (!col || !S.dragging) return;
  e.preventDefault();
  S.dragging = false;
  moveTask(e.dataTransfer.getData("text/plain"), col.dataset.cid);
};
$("content").ondragend = () => {
  S.dragging = false;
  document.querySelectorAll(".dragging, .over").forEach((x) => x.classList.remove("dragging", "over"));
};

/* drag across the schedule grid to paint busy slots */
let paint = null;
const myCell = (el) => el?.closest?.(".mg.me .c");
const paintCell = (c) => {
  const k = `${c.dataset.d}-${c.dataset.s}`;
  paint ? S.mine.add(k) : S.mine.delete(k);
  c.classList.toggle("x", paint);
  S.dirty = true;
  const h = $("sv-hint");
  if (h) h.textContent = "Unsaved changes. Don’t forget to save.";
};
$("content").onpointerdown = (e) => {
  const c = myCell(e.target);
  if (!c || e.button > 0) return;
  e.preventDefault();
  paint = !S.mine.has(`${c.dataset.d}-${c.dataset.s}`);
  paintCell(c);
};
$("content").onpointermove = (e) => {
  if (paint === null) return;
  const c = myCell(document.elementFromPoint(e.clientX, e.clientY));
  if (c) paintCell(c);
};
document.addEventListener("pointerup", () => { paint = null; });
document.addEventListener("pointercancel", () => { paint = null; });

$("content").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, v = Object.fromEntries(new FormData(f));
  let r;
  if (f.dataset.form === "task") r = await db.from("tasks").insert({ group_id: S.group.id, title: v.title.trim(), due: v.due || null, priority: +v.priority, assignee: v.assignee || null, column_id: S.cols[0]?.id });
  else if (f.dataset.form === "profile") r = await db.from("profiles").update(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null]))).eq("id", S.user.id);
  else if (f.dataset.form === "settings") {
    const button = f.querySelector('button[type="submit"], button.btn');
    if (button) button.disabled = true;
    const values = { full_name: (v.full_name || "").trim(), preferred_color: safeColor(v.preferred_color), theme: v.theme === "dark" ? "dark" : "light" };
    r = await db.from("profiles").update(values).eq("id", S.user.id);
    if (button) button.disabled = false;
    if (r.error) return alert("Could not save settings. Run the included settings migration in Supabase first. " + r.error.message);
    const person = meProfile();
    if (person) Object.assign(person, values);
    applyTheme(values.theme);
    draw();
    const msg = $("settings-message");
    if (msg) { msg.textContent = "Preferences saved!"; msg.hidden = false; }
    return;
  }
  else if (f.dataset.form === "create") r = await db.rpc("create_group", { gname: v.name });
  else if (f.dataset.form === "join") r = await db.rpc("join_group", { gcode: v.code });
  else if (f.dataset.form === "invite") return sendInvite(f, v);
  if (r.error) return alert(r.error.message);
  if (["create", "join"].includes(f.dataset.form)) {
    const groupId = r.data;
    await refreshGroups();
    const target = S.groups.find((g) => g.id === groupId);
    if (target) return selectGroup(target);
    return showGroupPicker();
  }
  f.reset();
  load(true);
};

/* sidebar: full or icons only */
const shell = $("app-view");
const setMini = (m) => {
  shell.classList.toggle("mini", m);
  $("side-toggle").setAttribute("aria-label", m ? "Expand sidebar" : "Collapse sidebar");
  try { localStorage.setItem("pm-mini", m ? "1" : "0"); } catch { /* storage unavailable */ }
};
try { setMini(localStorage.getItem("pm-mini") === "1"); } catch { setMini(false); }
$("side-toggle").onclick = () => setMini(!shell.classList.contains("mini"));

let ready = false;
db.auth.onAuthStateChange((_e, session) => {
  if (!ready || (session?.user?.id || null) !== (S.user?.id || null)) {
    ready = true;
    // Avoid doing database calls synchronously inside auth state change.
    setTimeout(() => boot(session).catch((err) => alert(err.message)), 0);
  }
});
