// Paste your Supabase project URL and anon (public) key. Never use the service_role key here.
const SUPABASE_URL = "https://yginexyfrteirmwdegnx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SnDADsUXfW1THjWNQstWGQ_8iseB7bW";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const S = { user: null, group: null, members: [], tasks: [], busy: [], meetings: [], mine: new Set(), dirty: false, view: "home", month: new Date(now.getFullYear(), now.getMonth(), 1), sub: false };
const DAYS = ["M", "T", "W", "Th", "F", "S"], SLOTS = 32, PR = ["", "Low", "Medium", "High"];
const FIELDS = [["role", "Role"], ["full_name", "Full name"], ["id_number", "ID number"], ["address", "Address"], ["contact", "Contact no."], ["discord", "Discord handle"], ["birthday", "Birthday", "date"]];

const nm = (p) => (p ? p.full_name || p.email.split("@")[0] : "Unassigned");
const today = () => new Date(new Date().setHours(0, 0, 0, 0));
const left = (t) => (t.due ? Math.round((new Date(t.due + "T00:00") - today()) / 864e5) : 9999);
const urgent = (a, b) => left(a) - left(b) || b.priority - a.priority;
const dueLabel = (t) => { const d = left(t); return !t.due ? "No date" : d < 0 ? `${-d}d overdue` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `In ${d} days`; };
const who = (t) => nm(S.members.find((p) => p.id === t.assignee));
const tl = (i) => { const m = 480 + 30 * i, h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${m % 60 ? "30" : "00"} ${h < 12 ? "AM" : "PM"}`; };

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

/* ---------- data ---------- */
async function boot(session) {
  S.user = session?.user || null;
  $("auth-page").hidden = !!S.user;
  $("app-view").hidden = !S.user;
  if (!S.user) { S.group = null; return; }
  $("who").textContent = S.user.email;
  const { data, error } = await db.from("group_members").select("groups(id,name,code)").eq("user_id", S.user.id).limit(1);
  if (error) return alert(error.message);
  S.group = data[0]?.groups || null;
  $("nav").hidden = !S.group;
  $("group-name").textContent = S.group ? S.group.name : "No group yet";
  $("group-code").textContent = S.group ? `Invite code: ${S.group.code}` : "";
  if (!S.group) { $("content").innerHTML = onboard(); return; }
  await load(true);
  if (!S.sub) { S.sub = true; db.channel("sync").on("postgres_changes", { event: "*", schema: "public" }, () => load()).subscribe(); }
}

async function load(force) {
  if (!S.group) return;
  const g = S.group.id;
  const r = await Promise.all([
    db.from("group_members").select("profiles(*)").eq("group_id", g),
    db.from("tasks").select("*").eq("group_id", g),
    db.from("availability").select("user_id,day,slot").eq("group_id", g),
    db.from("meetings").select("*").eq("group_id", g),
  ]);
  const bad = r.find((x) => x.error);
  if (bad) return alert(bad.error.message);
  S.members = r[0].data.map((x) => x.profiles).filter(Boolean);
  [S.tasks, S.busy, S.meetings] = [r[1].data, r[2].data, r[3].data];
  if (!S.dirty) S.mine = new Set(S.busy.filter((x) => x.user_id === S.user.id).map((x) => `${x.day}-${x.slot}`));
  if (force || !document.activeElement?.closest("#content form")) draw();
}

/* ---------- views ---------- */
function draw() {
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("is-active", b.dataset.go === S.view));
  $("content").innerHTML = { home, tasks, schedule, directory }[S.view]();
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
      ...S.tasks.filter((x) => x.due === iso && x.status !== "done").map((x) => [x.title, ""]),
    ];
    h += `<i class="${iso === t0 ? "today" : ""}">${i}${ev.slice(0, 2).map(([a, c]) => `<span class="chip ${c}">${esc(a)}</span>`).join("")}${ev.length > 2 ? `<small>+${ev.length - 2} more</small>` : ""}</i>`;
  }
  return h + "</div>";
}

function home() {
  const open = S.tasks.filter((t) => t.status !== "done").sort(urgent);
  const late = open.filter((t) => left(t) < 0).length;
  const me = S.members.find((p) => p.id === S.user.id);
  return `<h1>Hi, ${esc(nm(me))}!</h1><p class="hint">${open.length} open tasks, ${late} overdue</p>
  <div class="home"><section class="panel">${calendar()}</section>
  <aside class="panel"><h2>Most pressing</h2>${open.slice(0, 6).map((t) => `<div class="row"><div><b>${esc(t.title)}</b><small>${esc(who(t))}</small></div><span class="due ${left(t) < 0 ? "late" : ""}">${dueLabel(t)}</span></div>`).join("") || '<p class="empty">Nothing due. Add a task to get started.</p>'}</aside></div>`;
}

const card = (t) => `<article class="tcard"><p>${esc(t.title)}</p>
  <div class="meta"><span class="pill p${t.priority}">${PR[t.priority]}</span><span class="due ${left(t) < 0 && t.status !== "done" ? "late" : ""}">${dueLabel(t)}</span></div>
  <div class="meta"><small>${esc(who(t))}</small>
  <select data-status="${t.id}" aria-label="Status">${[["todo", "To do"], ["doing", "In progress"], ["done", "Done"]].map(([k, l]) => `<option value="${k}"${t.status === k ? " selected" : ""}>${l}</option>`).join("")}</select>
  <button type="button" class="icon" data-del="${t.id}" aria-label="Delete task">✕</button></div></article>`;

function tasks() {
  const opts = S.members.map((p) => `<option value="${p.id}">${esc(nm(p))}</option>`).join("");
  return `<h1>Tasks</h1><form class="addtask" data-form="task"><input name="title" placeholder="New task" required>
  <input name="due" type="date" aria-label="Due date"><select name="priority" aria-label="Priority"><option value="3">High</option><option value="2" selected>Medium</option><option value="1">Low</option></select>
  <select name="assignee" aria-label="Assignee"><option value="">Unassigned</option>${opts}</select><button class="btn">Add task</button></form>
  <p class="hint">Sorted by due date, then priority.</p><div class="board">` +
    [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]].map(([k, l]) => {
      const list = S.tasks.filter((t) => t.status === k).sort(urgent);
      return `<section class="col ${k}"><h2>${l} <small>${list.length}</small></h2>${list.map(card).join("") || '<p class="empty">Nothing here</p>'}</section>`;
    }).join("") + "</div>";
}

function schedule() {
  const B = {};
  S.busy.forEach((r) => (B[r.user_id] ??= new Set()).add(`${r.day}-${r.slot}`));
  const n = S.members.length, hd = DAYS.map((d) => `<b>${d}</b>`).join("");
  let ov = `<div class="g ov"><h3>Free together</h3><span></span>${hd}`;
  for (let s = 0; s < SLOTS; s++) {
    ov += `<em>${tl(s)}</em>`;
    for (let d = 0; d < 6; d++) {
      const free = S.members.filter((p) => !B[p.id]?.has(`${d}-${s}`));
      ov += `<i class="c l${Math.round((free.length / n) * 4)}" title="${esc(free.map(nm).join(", ") || "Nobody free")}">${free.length === n ? "All" : free.length || ""}</i>`;
    }
  }
  ov += "</div>";
  const mem = S.members.map((p) => {
    const me = p.id === S.user.id, set = me ? S.mine : B[p.id] || new Set();
    let g = `<div class="g mg${me ? " me" : ""}"><h3>${esc(nm(p))}${me ? " (you)" : ""}</h3>${hd}`;
    for (let s = 0; s < SLOTS; s++) for (let d = 0; d < 6; d++) g += `<i class="c${set.has(`${d}-${s}`) ? " x" : ""}"${me ? ` data-d="${d}" data-s="${s}"` : ""}></i>`;
    return g + "</div>";
  }).join("");
  return `<div class="bar"><h1>Schedule</h1><p>Click the boxes where you're busy, then save.</p><button type="button" class="btn" data-act="save">Save my availability</button></div>
  <div class="sched"><div class="hscroll">${ov}</div><div class="hscroll members">${mem}</div></div>`;
}

function directory() {
  return `<h1>Directory</h1><div class="dir">` + S.members.map((p) => {
    const me = p.id === S.user.id;
    const body = me
      ? `<form data-form="profile">${FIELDS.map(([k, l, t]) => `<label class="field"><span>${l}</span><input name="${k}" type="${t || "text"}" value="${esc(p[k])}"></label>`).join("")}<button class="btn">Save my info</button></form>`
      : `<dl>${FIELDS.slice(1).map(([k, l]) => `<dt>${l}</dt><dd>${esc(p[k]) || "—"}</dd>`).join("")}</dl>`;
    return `<article class="person"><header>${esc(p.role || "Member")}<small>${esc(nm(p))}${me ? " (you)" : ""}</small></header><p class="mail">${esc(p.email)}</p>${body}</article>`;
  }).join("") + "</div>";
}

const onboard = () => `<h1>Welcome!</h1><p class="hint">Create a group, or join one with a code from a teammate.</p><div class="dir">
  <form class="person" data-form="create"><header>Create a group</header><label class="field"><span>Group name</span><input name="name" required></label><button class="btn">Create group</button></form>
  <form class="person" data-form="join"><header>Join a group</header><label class="field"><span>Invite code</span><input name="code" required></label><button class="btn btn-quiet">Join group</button></form></div>`;

/* ---------- actions ---------- */
$("nav").onclick = (e) => { const b = e.target.closest("[data-go]"); if (b) { S.view = b.dataset.go; draw(); } };

$("content").onclick = async (e) => {
  const t = e.target.closest("[data-m],[data-d],[data-del],[data-act]");
  if (!t) return;
  const ds = t.dataset;
  if (ds.m) { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + +ds.m, 1); draw(); }
  else if (ds.d !== undefined) { const k = `${ds.d}-${ds.s}`; S.mine.has(k) ? S.mine.delete(k) : S.mine.add(k); S.dirty = true; t.classList.toggle("x"); }
  else if (ds.del) { const r = await db.from("tasks").delete().eq("id", ds.del); if (r.error) return alert(r.error.message); load(true); }
  else if (ds.act === "save") {
    const g = S.group.id, uid = S.user.id;
    let r = await db.from("availability").delete().eq("group_id", g).eq("user_id", uid);
    if (!r.error && S.mine.size) r = await db.from("availability").insert([...S.mine].map((k) => { const [day, slot] = k.split("-"); return { group_id: g, user_id: uid, day: +day, slot: +slot }; }));
    if (r.error) return alert(r.error.message);
    S.dirty = false;
    await load(true);
    const b = document.querySelector("[data-act=save]");
    if (b) b.textContent = "Saved!";
  }
};

$("content").onchange = async (e) => {
  const id = e.target.dataset.status;
  if (!id) return;
  const r = await db.from("tasks").update({ status: e.target.value }).eq("id", id);
  if (r.error) return alert(r.error.message);
  load(true);
};

$("content").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, v = Object.fromEntries(new FormData(f));
  let r;
  if (f.dataset.form === "task") r = await db.from("tasks").insert({ group_id: S.group.id, title: v.title.trim(), due: v.due || null, priority: +v.priority, assignee: v.assignee || null });
  else if (f.dataset.form === "profile") r = await db.from("profiles").update(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null]))).eq("id", S.user.id);
  else if (f.dataset.form === "create") r = await db.rpc("create_group", { gname: v.name });
  else if (f.dataset.form === "join") r = await db.rpc("join_group", { gcode: v.code });
  if (r.error) return alert(r.error.message);
  if (["create", "join"].includes(f.dataset.form)) return boot({ user: S.user });
  f.reset();
  load(true);
};

let ready = false;
db.auth.onAuthStateChange((_e, s) => {
  if (!ready || (s?.user?.id || null) !== (S.user?.id || null)) { ready = true; boot(s); }
});
