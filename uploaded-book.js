(() => {
  const config = window.LUMEN_FIREBASE_CONFIG || {};
  const status = document.getElementById("uploaded-detail-status");
  const article = document.getElementById("uploaded-detail");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch (_) { return ""; }
  }
  async function load() {
    if (!id || !/^[A-Za-z0-9_-]{8,150}$/.test(id)) { status.textContent = "This book link is invalid. Return to the catalog and choose a book."; return; }
    try {
      if (!window.firebase || !firebase.initializeApp || !config.apiKey) throw new Error("Firebase could not load.");
      if (!firebase.apps.length) firebase.initializeApp(config);
      const doc = await firebase.firestore().collection("books").doc(id).get();
      if (!doc.exists) { status.textContent = "This book could not be found in the Lumen Press shelf."; return; }
      const book = doc.data();
      document.title = `${book.title || "Book"} | Lumen Press`;
      document.getElementById("uploaded-title").textContent = book.title || "Untitled book";
      document.getElementById("uploaded-author").textContent = book.author ? `by ${book.author}` : "Unknown author";
      document.getElementById("uploaded-genre").textContent = book.genre || "Book";
      document.getElementById("uploaded-year").textContent = book.year ? `Published ${book.year}` : "";
      document.getElementById("uploaded-isbn").textContent = book.isbn ? `ISBN: ${book.isbn}` : "";
      document.getElementById("uploaded-description").textContent = book.description || "No description has been added for this title.";
      const cover = document.getElementById("uploaded-cover");
      const coverUrl = safeHttpUrl(book.coverUrl);
      if (coverUrl) { cover.src = coverUrl; cover.hidden = false; cover.onerror = () => { cover.hidden = true; }; }
      else cover.hidden = true;
      const readUrl = safeHttpUrl(book.readUrl || book.fileUrl);
      const open = document.getElementById("uploaded-open-file");
      const frame = document.getElementById("uploaded-pdf-frame");
      const note = document.getElementById("uploaded-reader-note");
      if (readUrl) {
        open.href = readUrl; open.hidden = false; open.target = "_blank"; open.rel = "noopener noreferrer";
        const pathname = new URL(readUrl).pathname.toLowerCase();
        if (pathname.endsWith(".pdf")) {
          frame.src = readUrl; frame.hidden = false;
          note.textContent = "A PDF preview is shown when the source permits embedding. If it does not load, use the reading link above.";
        } else {
          frame.hidden = true; frame.removeAttribute("src");
          note.textContent = "This book opens on its original website. Use the reading link above to read or download it there.";
        }
      } else {
        open.hidden = true; frame.hidden = true; frame.removeAttribute("src");
        note.textContent = "No reading link has been added for this title yet.";
      }
      status.textContent = ""; article.hidden = false;
    } catch (error) { console.error("Could not load book:", error); status.textContent = "Could not load this book. Check your Firestore rules and connection."; }
  }
  load();
})();
