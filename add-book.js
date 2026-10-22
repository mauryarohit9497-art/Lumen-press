(() => {
  const config = window.LUMEN_FIREBASE_CONFIG || {};
  const form = document.getElementById("add-book-form");
  if (!form) return;
  const panel = document.getElementById("add-book-panel");
  const locked = document.getElementById("add-book-locked");
  const status = document.getElementById("add-book-status");
  const submit = document.getElementById("add-book-submit");
  let auth, db, activeUser = null, isAdmin = false;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
    status.classList.toggle("is-success", Boolean(message) && !isError);
  }
  function safeHttpUrl(value, label, required = false) {
    const raw = String(value || "").trim();
    if (!raw && !required) return "";
    if (!raw) throw new Error(`Enter a ${label} URL.`);
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error(`Enter a valid ${label} URL beginning with https:// or http://.`); }
    if (!["https:", "http:"].includes(url.protocol)) throw new Error(`${label} URL must begin with https:// or http://.`);
    return url.href;
  }
  function friendlyError(error) {
    if (error && (error.code === "permission-denied" || error.code === "unauthenticated")) return "Firebase denied this action. Check your admin document and Firestore rules.";
    return (error && error.message) || "Something went wrong. Please try again.";
  }

  async function boot() {
    if (!window.firebase || !firebase.initializeApp || !config.apiKey) {
      locked.hidden = false;
      locked.querySelector("p").textContent = "Firebase could not load. Check firebase-config.js and your internet connection, then reload.";
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(config);
      auth = firebase.auth(); db = firebase.firestore();
      auth.onAuthStateChanged(async (user) => {
        activeUser = user || null; isAdmin = false;
        panel.hidden = true; locked.hidden = true;
        if (!user) { locked.hidden = false; return; }
        try {
          const doc = await db.collection("admins").doc(user.uid).get();
          isAdmin = doc.exists && doc.data().role === "admin";
          if (isAdmin) panel.hidden = false;
          else locked.hidden = false;
        } catch (error) {
          locked.hidden = false;
          locked.querySelector("p").textContent = "Your admin role could not be verified. Check Firestore rules and try again.";
        }
      });
    } catch (error) {
      locked.hidden = false;
      locked.querySelector("p").textContent = friendlyError(error);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeUser || !isAdmin) return setStatus("Admin access is required to add books.", true);
    const title = form.elements.title.value.trim();
    const author = form.elements.author.value.trim();
    const isbn = form.elements.isbn.value.trim();
    const yearValue = form.elements.year.value.trim();
    const genre = form.elements.genre.value;
    const description = form.elements.description.value.trim();
    let coverUrl, readUrl;
    try {
      if (!title || !author || !genre) throw new Error("Enter a title, author, and genre.");
      coverUrl = safeHttpUrl(form.elements.coverUrl.value, "cover image", true);
      readUrl = safeHttpUrl(form.elements.readUrl.value, "reading link", true);
      if (yearValue && (!Number.isInteger(Number(yearValue)) || Number(yearValue) < 1000 || Number(yearValue) > 2100)) throw new Error("Enter a valid publication year.");
      if (!form.elements.rightsConfirmed.checked) throw new Error("Confirm that the reading link points to a source you are allowed to share.");
    } catch (error) { setStatus(error.message, true); return; }

    submit.disabled = true; form.setAttribute("aria-busy", "true"); setStatus("Saving book details…");
    try {
      const bookRef = db.collection("books").doc();
      await bookRef.set({
        title, author, isbn: isbn || "", year: yearValue ? Number(yearValue) : null, genre,
        description, coverUrl, readUrl,
        createdBy: activeUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      form.reset();
      setStatus("Book added successfully. It is now available on the Lumen Press shelf.");
      const openLink = document.createElement("a");
      openLink.href = `uploaded-book.html?id=${encodeURIComponent(bookRef.id)}`;
      openLink.textContent = " View the book"; openLink.className = "text-button"; status.appendChild(openLink);
    } catch (error) {
      console.error("Lumen Press book save failed:", error);
      setStatus(friendlyError(error), true);
    } finally {
      submit.disabled = false; form.removeAttribute("aria-busy");
    }
  });
  boot();
})();
