/* ==========================================================================
   THE ART OF PERSPECTIVE  ·  script.js
   --------------------------------------------------------------------------
    1. Constants & state          7. Home page (lens + gallery rail)
    2. Small helpers              8. Artwork page (reactions + perspectives)
    3. Saving (IndexedDB)         9. Notifications
    4. Artwork data              10. Log in / register
    5. Cards & gallery           11. Dashboard (gallery, add artwork, profile)
    6. Views & navigation        12. Theme & start-up
   ========================================================================== */
"use strict";

/* 1. CONSTANTS & STATE -------------------------------------------------- */

/* The three public-domain masterworks that ship with the site. */
const MUSEUM = [
  {
    key: "mona",
    title: "Mona Lisa",
    byline: "Leonardo da Vinci, c. 1503",
    image: "images/mona-lisa.jpg",
    alt: "A woman with folded hands and a faint smile before a winding landscape, Mona Lisa by Leonardo da Vinci",
    question: "Is she smiling at you, or just past you?",
    seed: [
      ["Elena", "Wonder", "The smile changes when I look at her eyes versus her mouth. I never get the same one twice."],
      ["Marcus", "Memory", "She looks like my aunt waiting for a letter. Patient, amused, a little tired."],
      ["Yuki", "Hope", "The winding road behind her says the story is not over, whatever she is thinking."]
    ]
  },
  {
    key: "adam",
    title: "The Creation of Adam",
    byline: "Michelangelo, c. 1512",
    image: "images/creation-of-adam.jpg",
    alt: "Detail of the Sistine Chapel ceiling: God reaching toward Adam, their fingers almost touching",
    question: "Is the gap between the fingers a beginning or a distance?",
    seed: [
      ["Tomas", "Wonder", "The space is the whole painting. Nothing touches, and still everything is connected."],
      ["Amara", "Hope", "Adam looks relaxed, almost waiting. I read the gap as trust."],
      ["Lena", "Loss", "I see a reaching that never quite arrives, like calling someone who has moved far away."]
    ]
  },
  {
    key: "angel",
    title: "The Fallen Angel",
    byline: "Alexandre Cabanel, 1847",
    image: "images/the-fallen-angel.jpg",
    alt: "A winged man in anguish, hiding his face with his arm, with angels fading in the sky above",
    question: "Is he defeated, or finally free?",
    seed: [
      ["Rafael", "Loss", "His arm hides his eyes. I see someone too ashamed to be seen."],
      ["Noor", "Hope", "He is angry, not broken. The ground is green and he is still alive."],
      ["Ines", "Wonder", "The heaven he fell from is still in the picture, small and far in the corner."]
    ]
  }
];

const REACTIONS = [["love", "♥ Love"], ["wonder", "✦ Wonder"], ["moved", "☾ Moved"]];

/* "The Same Canvas, Different Worlds": one painting, three moods. */
const LENSES = {
  love: {
    filter: "sepia(.35) saturate(1.5) hue-rotate(-12deg) brightness(1.05)",
    story: "He covers his eyes like someone overwhelmed by feeling, a heart too full to be seen."
  },
  loss: {
    filter: "grayscale(.85) brightness(.78) contrast(1.15)",
    story: "Everything he belonged to drifts away in the sky above him. He is the one left behind."
  },
  hope: {
    filter: "brightness(1.18) saturate(1.25) contrast(.95)",
    story: "The ground is green and the sky is clearing. He has fallen, and he is still here to begin again."
  }
};

/* Everything the site remembers is one object, saved on this device.
   (Key names are kept as they are so people's saved data keeps working.) */
let state = { users: [], works: [], posts: {}, rx: {}, notifs: [], session: null };

let artworks = [];          // museum pieces + members' uploads, rebuilt by buildArtworks()
let current = null;         // artwork open on the discussion page
let tab = "gallery";        // active dashboard tab
let authMode = "login";     // "login" or "reg"
let pendingWork = null;     // resized image waiting in the Add Artwork form
let pendingAvatar = null;   // cropped image waiting in the Profile form


/* 2. SMALL HELPERS ------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function imageEl(src, alt) {
  const img = new Image();
  img.src = src;
  img.alt = alt;
  return img;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("on"), 2800);
}

/* Show a user's picture, or their first initial when they have none. */
function setAvatar(node, user) {
  const pic = user && user.avatar;
  node.style.backgroundImage = pic ? "url(" + pic + ")" : "";
  node.textContent = pic ? "" : ((user && user.name) || "?")[0].toUpperCase();
}
function avatarEl(user) {
  const node = el("span", "av sm");
  setAvatar(node, user);
  return node;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Shrink an upload to at most 1200px so it saves quickly. */
function resizeImage(file) {
  return loadImage(file).then((img) => {
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  });
}

/* Crop the centre of a picture into a 256px square for profile photos. */
function cropSquare(file) {
  return loadImage(file).then((img) => {
    const side = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", 0.85);
  });
}

/* Passwords are never stored: only a salted SHA-256 hash. */
function sha256(password, salt) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + password)).then((buf) =>
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}


/* 3. SAVING (IndexedDB) ------------------------------------------------- */

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open("aop", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("kv");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }
  return dbPromise;
}

function readState() {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction("kv").objectStore("kv").get("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function save() {
  return openDb()
    .then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(state, "state");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }))
    .catch(() => toast("Could not save on this device."));
}


/* 4. ARTWORK DATA ------------------------------------------------------- */

const userById = (id) => state.users.find((u) => u.id === id) || null;
const currentUser = () => userById(state.session);

/* Museum pieces first, then every member's uploads. */
function buildArtworks() {
  artworks = MUSEUM.map((m, i) => ({
    id: i, key: m.key, owner: null, title: m.title, byline: m.byline,
    image: m.image, alt: m.alt, question: m.question, seed: m.seed
  }));
  state.works.forEach((w) => {
    const owner = userById(w.owner);
    artworks.push({
      id: artworks.length, key: "w" + w.id, owner: w.owner, title: w.title,
      byline: "By " + (owner ? owner.name : "an artist"),
      image: w.img, alt: w.title,
      question: w.q || "What do you see in this piece?", seed: []
    });
  });
}

/* Sample perspectives first, then the ones people posted. */
function getComments(artwork) {
  const seeded = artwork.seed.map((s) => ({ n: s[0], l: s[1], t: s[2] }));
  return seeded.concat(state.posts[artwork.key] || []);
}


/* 5. CARDS & GALLERY ---------------------------------------------------- */

function createCard(artwork) {
  const card = el("button", "card");
  const mat = el("div", "mat");
  mat.appendChild(imageEl(artwork.image, artwork.alt));
  const comments = getComments(artwork).length;
  const reactions = Object.keys(state.rx[artwork.key] || {}).length;
  card.append(
    mat,
    el("h3", null, artwork.title),
    el("span", null, artwork.byline),
    el("span", "n", plural(comments, "perspective") + " · " + plural(reactions, "reaction"))
  );
  card.onclick = () => openArtwork(artwork.id);
  return card;
}

function renderGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  artworks.forEach((a) => grid.appendChild(createCard(a)));
}


/* 6. VIEWS & NAVIGATION ------------------------------------------------- */

function showView(name, hash) {
  ["home", "art", "auth", "dash"].forEach((v) => { $("view-" + v).hidden = v !== name; });
  if (name === "home") renderGrid();
  window.scrollTo(0, 0);
  if (name === "home" && hash) {
    const target = document.querySelector(hash);
    if (target) target.scrollIntoView();
  }
}

/* The dashboard needs a logged-in user. */
function goTo(name, hash) {
  if (name !== "dash") return showView(name, hash);
  if (!currentUser()) return showAuth("login");
  showView("dash");
  renderDash();
}

/* One click listener handles every [data-go] and [data-auth] element. */
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-go]");
  if (link) {
    const href = link.getAttribute("href");
    const isAnchor = href && href[0] === "#";
    if (isAnchor) e.preventDefault();
    goTo(link.dataset.go, isAnchor ? href : null);
  }
  if (e.target.closest("[data-auth]")) showAuth("reg");
});

/* "Share" links: straight to Add Artwork when logged in, otherwise register. */
document.querySelectorAll(".share-link").forEach((a) => {
  a.onclick = (e) => {
    e.preventDefault();
    if (currentUser()) { tab = "add"; goTo("dash"); } else showAuth("reg");
  };
});

/* The nav button shows the user's avatar and unread count. */
function updateNav() {
  const user = currentUser();
  const button = $("acct");
  button.innerHTML = "";
  if (!user) { button.textContent = "Log in"; return; }
  const count = unreadCount();
  button.appendChild(avatarEl(user));
  button.appendChild(document.createTextNode("Dashboard" + (count ? " (" + count + ")" : "")));
}
$("acct").onclick = () => goTo("dash");


/* 7. HOME PAGE ---------------------------------------------------------- */

/* Love / Loss / Hope buttons recolour the painting and change its story. */
function setLens(name) {
  $("lensImg").style.filter = LENSES[name].filter;
  $("story").textContent = "Seen as " + name + ": " + LENSES[name].story;
  document.querySelectorAll(".lens button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.l === name));
}
document.querySelectorAll(".lens button").forEach((b) => { b.onclick = () => setLens(b.dataset.l); });

/* ‹ › buttons scroll the gallery. */
document.querySelectorAll("[data-rail]").forEach((b) => {
  b.onclick = () => $("grid").scrollBy({ left: b.dataset.rail * 540, behavior: "smooth" });
});

/* Hold the left mouse button and drag to move a gallery left or right.
   A drag never counts as a click, so cards do not open by accident. */
function enableDragScroll(rail) {
  let down = false, moved = false, startX = 0, startScroll = 0;

  rail.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    down = true; moved = false;
    startX = e.clientX; startScroll = rail.scrollLeft;
  });
  window.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 5) { moved = true; rail.classList.add("dragging"); }
    if (moved) { rail.scrollLeft = startScroll - dx; e.preventDefault(); }
  });
  window.addEventListener("pointerup", () => {
    if (!down) return;
    down = false;
    rail.classList.remove("dragging");
  });
  rail.addEventListener("click", (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
  }, true);
  rail.addEventListener("dragstart", (e) => e.preventDefault());
}
enableDragScroll($("grid"));
enableDragScroll($("myGrid"));


/* 8. ARTWORK PAGE ------------------------------------------------------- */

function openArtwork(id) {
  current = artworks[id];
  $("artBig").replaceChildren(imageEl(current.image, current.alt));
  $("aTitle").textContent = current.title;
  $("aMeta").textContent = current.byline;
  $("aAsk").textContent = current.question;
  $("del").hidden = !(current.owner && current.owner === state.session);
  $("pform").hidden = !state.session;       // guests see the "log in" box instead
  $("gate").hidden = !!state.session;
  renderReactions();
  renderPerspectives();
  showView("art");
}

function renderReactions() {
  const box = $("react");
  const votes = state.rx[current.key] || {};
  box.innerHTML = "";
  REACTIONS.forEach(([type, label]) => {
    const count = Object.keys(votes).filter((who) => votes[who] === type).length;
    const button = el("button", "rx", label + " " + count);
    button.setAttribute("aria-pressed", !!(state.session && votes[state.session] === type));
    button.onclick = () => toggleReaction(type, label);
    box.appendChild(button);
  });
}

/* Same reaction again removes it; a different one replaces it. */
function toggleReaction(type, label) {
  if (!state.session) return toast("Log in to react.");
  const votes = (state.rx[current.key] = state.rx[current.key] || {});
  if (votes[state.session] === type) {
    delete votes[state.session];
  } else {
    votes[state.session] = type;
    notifyOwner(current, "react", label.replace(/[^A-Za-z]/g, ""));
  }
  save();
  renderReactions();
  updateNav();
}

function renderPerspectives() {
  const list = $("plist");
  list.innerHTML = "";
  getComments(current).forEach((c) => {
    const row = el("div", "persp");
    const head = el("div");
    head.append(avatarEl(c.u ? userById(c.u) : { name: c.n }), el("b", null, c.n), el("span", "chip", c.l));
    row.append(head, el("p", null, c.t));
    list.appendChild(row);
  });
}

$("pform").onsubmit = (e) => {
  e.preventDefault();
  const user = currentUser();
  if (!user) return;
  const post = { u: user.id, n: user.name, l: $("pl").value, t: $("pt").value.trim() };
  state.posts[current.key] = (state.posts[current.key] || []).concat(post);
  notifyOwner(current, "comment", post.t.slice(0, 80));
  save();
  renderPerspectives();
  $("pt").value = "";
  toast("Perspective posted.");
};

$("del").onclick = () => removeWork(current, () => showView("home", "#gallery"));

/* Delete an upload together with its comments, reactions and notifications. */
function removeWork(artwork, done) {
  if (!confirm("Remove “" + artwork.title + "” from your gallery?")) return;
  const workId = artwork.key.slice(1);
  state.works = state.works.filter((w) => w.id !== workId);
  delete state.posts[artwork.key];
  delete state.rx[artwork.key];
  state.notifs = state.notifs.filter((n) => n.key !== artwork.key);
  buildArtworks();
  save();
  updateNav();
  done();
}


/* 9. NOTIFICATIONS ------------------------------------------------------ */

/* Tell the artist when someone else reacts or comments. */
function notifyOwner(artwork, kind, detail) {
  const user = currentUser();
  if (!user || !artwork.owner || artwork.owner === user.id) return;
  state.notifs.unshift({
    id: uid(), to: artwork.owner, key: artwork.key, fid: user.id, from: user.name,
    kind: kind, detail: detail, d: Date.now(), read: 0
  });
}

const myNotifs = () => state.notifs.filter((n) => n.to === state.session);
const unreadCount = () => myNotifs().filter((n) => !n.read).length;

function renderNotifications() {
  const list = $("nlist");
  list.innerHTML = "";
  const mine = myNotifs();
  if (!mine.length) {
    list.appendChild(el("p", "empty", "Nothing yet. When someone reacts to or comments on your artwork, it appears here. Tip: register a second account to try it yourself."));
    return;
  }
  mine.forEach((n) => {
    const artwork = artworks.find((a) => a.key === n.key);
    if (!artwork) return;
    const from = userById(n.fid) || { name: n.from };
    const what = n.kind === "comment"
      ? " commented on “" + artwork.title + "”: " + n.detail
      : " reacted " + n.detail + " to “" + artwork.title + "”";
    const row = el("button", "note" + (n.read ? "" : " new"));
    row.append(avatarEl(from), el("span", null, from.name + what + " · " + new Date(n.d).toLocaleString()));
    row.onclick = () => { n.read = 1; save(); updateNav(); openArtwork(artwork.id); };
    list.appendChild(row);
  });
}

$("readall").onclick = () => {
  myNotifs().forEach((n) => { n.read = 1; });
  save();
  updateNav();
  renderDash();
};


/* 10. LOG IN / REGISTER ------------------------------------------------- */

function showAuth(mode) {
  authMode = mode;
  const registering = mode === "reg";
  $("authT").textContent = registering ? "Create your account" : "Welcome back";
  $("fName").hidden = !registering;
  $("asub").textContent = registering ? "Create account" : "Log in";
  $("ap").autocomplete = registering ? "new-password" : "current-password";
  $("aerr").textContent = "";
  document.querySelectorAll("[data-m]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === mode));
  showView("auth");
}
document.querySelectorAll("[data-m]").forEach((b) => { b.onclick = () => showAuth(b.dataset.m); });

$("af").onsubmit = (e) => {
  e.preventDefault();
  const email = $("ae").value.trim().toLowerCase();
  const password = $("ap").value;
  const error = $("aerr");
  const existing = state.users.find((u) => u.email === email);
  error.textContent = "";

  if (authMode === "reg") {
    const name = $("an").value.trim();
    if (name.length < 2) { error.textContent = "Please enter a display name."; return; }
    if (existing) { error.textContent = "That email is already registered. Try logging in."; return; }
    const salt = uid();
    sha256(password, salt).then((hash) => {
      const user = { id: uid(), name: name, email: email, salt: salt, hash: hash, avatar: "", bio: "", created: Date.now() };
      state.users.push(user);
      state.session = user.id;
      save();
      enterDashboard(true);
    });
  } else {
    if (!existing) { error.textContent = "Email or password is not correct."; return; }
    sha256(password, existing.salt).then((hash) => {
      if (hash !== existing.hash) { error.textContent = "Email or password is not correct."; return; }
      state.session = existing.id;
      save();
      enterDashboard(false);
    });
  }
};

/* New members land on Add Artwork; returning members on My Gallery. */
function enterDashboard(isNew) {
  $("af").reset();
  tab = isNew ? "add" : "gallery";
  updateNav();
  goTo("dash");
}

$("logout").onclick = () => {
  state.session = null;
  save();
  updateNav();
  showView("home");
};


/* 11. DASHBOARD --------------------------------------------------------- */

function renderDash() {
  const user = currentUser();
  if (!user) return;
  const count = unreadCount();
  $("dName").textContent = user.name;
  $("dEmail").textContent = user.email;
  setAvatar($("dAv"), user);
  $("bd").hidden = !count;
  $("bd").textContent = count;
  setTab(tab);
}

function setTab(name) {
  tab = name;
  ["gallery", "add", "notes", "profile"].forEach((t) => { $("p-" + t).hidden = t !== name; });
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === name));
  if (name === "gallery") renderMyGallery();
  if (name === "notes") renderNotifications();
  if (name === "profile") renderProfile();
}
document.querySelectorAll("[data-tab]").forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
$("readyBtn").onclick = () => setTab("add");

/* --- My Gallery --- */
function renderMyGallery() {
  const grid = $("myGrid");
  const mine = artworks.filter((a) => a.owner === state.session);
  grid.innerHTML = "";
  if (!mine.length) {
    grid.style.display = "block";
    grid.appendChild(el("p", "empty", "Your gallery is empty. Add your first artwork and let others see it."));
    return;
  }
  grid.style.display = "";
  mine.forEach((artwork) => {
    const item = el("div");
    const remove = el("button", "link", "Remove");
    remove.onclick = () => removeWork(artwork, renderDash);
    item.append(createCard(artwork), remove);
    grid.appendChild(item);
  });
}

/* --- Add Artwork --- */
$("wf").onchange = function () {
  const file = this.files[0];
  if (!file) return;
  resizeImage(file)
    .then((dataUrl) => {
      pendingWork = dataUrl;
      $("wPrev").src = dataUrl;
      $("wFrame").hidden = false;
      $("wNote").textContent = "Every artwork is shown whole in the same gallery frame.";
    })
    .catch(() => toast("That file could not be read as an image."));
};

$("wsub").onclick = () => {
  const title = $("wt").value.trim();
  if (!title || !pendingWork) return toast("Add a title and choose an image first.");
  state.works.push({ id: uid(), owner: state.session, title: title, q: $("wq").value.trim(), img: pendingWork, created: Date.now() });
  buildArtworks();
  save().then(() => toast("Added to your gallery."));
  ["wt", "wq", "wf"].forEach((id) => { $(id).value = ""; });
  $("wFrame").hidden = true;
  $("wNote").textContent = "";
  pendingWork = null;
  setTab("gallery");
};

/* --- Profile --- */
function renderProfile() {
  const user = currentUser();
  pendingAvatar = null;
  setAvatar($("pAv"), user);
  $("pnm").value = user.name;
  $("pbio").value = user.bio || "";
}

$("avf").onchange = function () {
  const file = this.files[0];
  if (!file) return;
  cropSquare(file)
    .then((dataUrl) => {
      pendingAvatar = dataUrl;
      setAvatar($("pAv"), { name: $("pnm").value || "?", avatar: dataUrl });
    })
    .catch(() => toast("That file could not be read as an image."));
};

$("psave").onclick = () => {
  const user = currentUser();
  const name = $("pnm").value.trim();
  if (name.length < 2) return toast("Please enter a display name.");
  user.name = name;
  user.bio = $("pbio").value.trim();
  if (pendingAvatar) user.avatar = pendingAvatar;
  buildArtworks();
  save();
  updateNav();
  renderDash();
  toast("Profile saved.");
};


/* 12. THEME & START-UP -------------------------------------------------- */

$("theme").onclick = () => {
  const root = document.documentElement;
  const systemDark = matchMedia("(prefers-color-scheme:dark)").matches;
  const now = root.dataset.theme || (systemDark ? "dark" : "light");
  root.dataset.theme = now === "dark" ? "light" : "dark";
};

setLens("love");
buildArtworks();
renderGrid();
updateNav();

/* Load whatever was saved last time, then redraw. */
readState()
  .then((saved) => {
    if (!saved) return;
    Object.assign(state, saved);
    buildArtworks();
    renderGrid();
    updateNav();
  })
  .catch(() => {});
