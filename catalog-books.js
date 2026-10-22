(() => {
  const grid = document.getElementById("uploaded-books-grid");
  const status = document.getElementById("uploaded-books-status");
  if (!grid || !status) return;
  const config = window.LUMEN_FIREBASE_CONFIG || {};
  let db = null;
  let activeUser = null;
  let isAdmin = false;
  function placeholder(title, genre) {
    const cover = document.createElement("div"); cover.className = "book-cover is-placeholder";
    const kicker = document.createElement("p"); kicker.className = "cover-kicker"; kicker.textContent = genre || "Book";
    const wrap = document.createElement("div"); const h = document.createElement("h3"); h.className = "cover-title"; h.textContent = title; wrap.appendChild(h); cover.append(kicker, wrap); return cover;
  }
  function cardFor(book) {
    const card = document.createElement("article"); card.className = "book-card uploaded-book-card";
    const cover = document.createElement("div"); cover.className = "book-cover";
    if (book.coverUrl) {
      const img = document.createElement("img"); img.src = book.coverUrl; img.alt = `Cover of ${book.title}`; img.loading = "lazy";
      img.onerror = () => cover.replaceWith(placeholder(book.title, book.genre)); cover.appendChild(img);
    } else cover.appendChild(placeholder(book.title, book.genre));
    const coverLink = document.createElement("a"); coverLink.className = "book-cover-link"; coverLink.href = `uploaded-book.html?id=${encodeURIComponent(book.id)}`; coverLink.appendChild(cover);
    const meta = document.createElement("div"); meta.className = "book-meta";
    const genre = document.createElement("p"); genre.className = "genre"; genre.textContent = book.genre || "Book";
    const title = document.createElement("h3"); const link = document.createElement("a"); link.className = "book-detail-link"; link.href = coverLink.href; link.textContent = book.title || "Untitled book"; title.appendChild(link);
    const author = document.createElement("p"); author.textContent = book.author || "Unknown author";
    meta.append(genre, title, author); if (book.year) { const year = document.createElement("p"); year.textContent = `Published ${book.year}`; meta.appendChild(year); }
    const actions = document.createElement("div"); actions.className = "book-actions";
    const read = document.createElement("a"); read.className = "primary-action uploaded-read-link"; read.href = coverLink.href; read.textContent = "View book"; actions.appendChild(read);
    if (isAdmin) {
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "text-button admin-book-action"; edit.textContent = "Edit";
      edit.addEventListener("click", () => editBook(book));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-button admin-book-action"; remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteBook(book));
      actions.append(edit, remove);
    }
    card.append(coverLink, meta, actions); return card;
  }
  async function editBook(book) {
    if (!activeUser || !isAdmin || !db) return;
    const title = window.prompt("Book title:", book.title || ""); if (title === null) return;
    const author = window.prompt("Author:", book.author || ""); if (author === null) return;
    const genre = window.prompt("Genre:", book.genre || ""); if (genre === null) return;
    const yearText = window.prompt("Publication year (leave blank if unknown):", book.year == null ? "" : String(book.year)); if (yearText === null) return;
    const description = window.prompt("Description:", book.description || ""); if (description === null) return;
    const coverUrl = window.prompt("Cover image URL:", book.coverUrl || ""); if (coverUrl === null) return;
    const readUrl = window.prompt("Legal reading URL:", book.readUrl || ""); if (readUrl === null) return;
    const cleanTitle = title.trim(), cleanAuthor = author.trim(), cleanGenre = genre.trim();
    const validUrl = value => { try { const u = new URL(value.trim()); return ["http:", "https:"].includes(u.protocol); } catch (_) { return false; } };
    const year = yearText.trim() ? Number(yearText.trim()) : null;
    if (!cleanTitle || !cleanAuthor || !cleanGenre) { window.alert("Title, author, and genre are required."); return; }
    if (!validUrl(coverUrl) || !validUrl(readUrl)) { window.alert("Enter valid http:// or https:// URLs for the cover and reading link."); return; }
    if (year !== null && (!Number.isInteger(year) || year < 1000 || year > 2100)) { window.alert("Enter a valid publication year between 1000 and 2100."); return; }
    try {
      await db.collection("books").doc(book.id).update({
        title: cleanTitle, author: cleanAuthor, genre: cleanGenre,
        year, description: description.trim(), coverUrl: coverUrl.trim(), readUrl: readUrl.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      status.textContent = "Book updated successfully.";
      await loadBooks();
    } catch (error) {
      console.error("Could not update book:", error);
      window.alert(error.code === "permission-denied" ? "Permission denied. Confirm the updated Firestore rules are published and you are signed in as an admin." : "Could not update this book. Check the browser console for details.");
    }
  }
  async function deleteBook(book) {
    if (!activeUser || !isAdmin || !db) return;
    if (!window.confirm(`Delete “${book.title || "Untitled book"}” from Lumen Press? This cannot be undone.`)) return;
    try {
      await db.collection("books").doc(book.id).delete();
      status.textContent = "Book deleted.";
      await loadBooks();
    } catch (error) {
      console.error("Could not delete book:", error);
      window.alert(error.code === "permission-denied" ? "Permission denied. Confirm you are signed in as an admin." : "Could not delete this book. Check the browser console for details.");
    }
  }
  async function loadBooks() {
    const snapshot = await db.collection("books").orderBy("createdAt", "desc").limit(40).get();
    grid.replaceChildren();
    if (snapshot.empty) { status.textContent = "No books have been uploaded yet. The library team can add the first title."; return; }
    snapshot.forEach((doc) => grid.appendChild(cardFor({ id: doc.id, ...doc.data() })));
    status.textContent = `${snapshot.size} book${snapshot.size === 1 ? "" : "s"} added to the Lumen Press shelf.`;
  }
  async function load() {
    if (!window.firebase || !firebase.initializeApp || !config.apiKey) { status.textContent = "Uploaded books are temporarily unavailable because Firebase could not load."; return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(config);
      db = firebase.firestore();
      if (firebase.auth) {
        firebase.auth().onAuthStateChanged(async (user) => {
          activeUser = user || null; isAdmin = false;
          if (user) {
            try {
              const adminDoc = await db.collection("admins").doc(user.uid).get();
              isAdmin = adminDoc.exists && adminDoc.data().role === "admin";
            } catch (adminError) { console.warn("Could not verify admin role; hiding book controls.", adminError); }
          }
          try { await loadBooks(); }
          catch (error) { console.error("Could not load uploaded books:", error); status.textContent = "Could not load the Lumen Press shelf. Check Firestore rules and your connection."; }
        });
      } else {
        await loadBooks();
      }
      return;
    } catch (error) {
      console.error("Could not load uploaded books:", error);
      status.textContent = "Could not load the Lumen Press shelf. Check Firestore rules and your connection.";
    }
  }
  load();
})();
