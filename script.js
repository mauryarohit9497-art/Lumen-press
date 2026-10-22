/**
 * Lumen Press - Digital Library Catalog
 *
 * Connects to the free Open Library Search API (https://openlibrary.org/search.json)
 * to fetch live book data, displaying real book titles, authors, first publication
 * years, and covers, along with full search, loading, empty, and error states.
 */

// --- API & Storage Configuration ---
const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_API_URL = "https://openlibrary.org";
const OPEN_LIBRARY_COVER_URL = "https://covers.openlibrary.org/b/id/";
const STORAGE_KEY = "lumen-library-ids";
const SAVED_BOOKS_STORAGE_KEY = "lumen-saved-books-data";
const BOOK_CACHE_STORAGE_KEY = "lumen-book-cache-v1";
const BOOK_STATES_STORAGE_KEY = "lumen-book-states-v1";
const BOOK_STATUSES = ["to-read", "reading", "finished"];

const GENRES = [
  "All",
  "Classics",
  "Fiction",
  "Fantasy",
  "Mystery",
  "Nonfiction",
  "Memoir",
  "Science Fiction",
];

// Warm bookstore palette for placeholder covers
const COVER_PALETTE = [
  "#2f4a3c",
  "#3d4f3f",
  "#5b3a32",
  "#31445c",
  "#6a3b1f",
  "#4a3f2f",
  "#7a5a28",
  "#2f3b48",
  "#35524a",
  "#3f4f63",
  "#6e3d3d",
  "#4d3b55",
];

// Optional seed data to maintain backwards compatibility for previously saved sample books
const LEGACY_SAMPLE_BOOKS = [
  { id: "pride-and-prejudice", title: "Pride and Prejudice", author: "Jane Austen", year: 1813, genre: "Classics", coverColor: "#3d4f3f" },
  { id: "the-midnight-library", title: "The Midnight Library", author: "Matt Haig", year: 2020, genre: "Fiction", coverColor: "#5b3a32" },
  { id: "sapiens", title: "Sapiens", author: "Yuval Noah Harari", year: 2011, genre: "Nonfiction", coverColor: "#31445c" },
  { id: "the-name-of-the-wind", title: "The Name of the Wind", author: "Patrick Rothfuss", year: 2007, genre: "Fantasy", coverColor: "#6a3b1f" },
  { id: "educated", title: "Educated", author: "Tara Westover", year: 2018, genre: "Memoir", coverColor: "#4a3f2f" },
  { id: "klara-and-the-sun", title: "Klara and the Sun", author: "Kazuo Ishiguro", year: 2021, genre: "Fiction", coverColor: "#7a5a28" },
  { id: "and-then-there-were-none", title: "And Then There Were None", author: "Agatha Christie", year: 1939, genre: "Mystery", coverColor: "#2f3b48" },
  { id: "the-left-hand-of-darkness", title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", year: 1969, genre: "Science Fiction", coverColor: "#35524a" },
  { id: "piranesi", title: "Piranesi", author: "Susanna Clarke", year: 2020, genre: "Fantasy", coverColor: "#3f4f63" },
  { id: "cerulean-sea", title: "The House in the Cerulean Sea", author: "T. J. Klune", year: 2020, genre: "Fantasy", coverColor: "#2e5a63" },
  { id: "gentleman-in-moscow", title: "A Gentleman in Moscow", author: "Amor Towles", year: 2016, genre: "Fiction", coverColor: "#6e3d3d" },
  { id: "circe", title: "Circe", author: "Madeline Miller", year: 2018, genre: "Classics", coverColor: "#7a4b2a" },
  { id: "the-overstory", title: "The Overstory", author: "Richard Powers", year: 2018, genre: "Fiction", coverColor: "#2f5a3c" },
  { id: "atomic-habits", title: "Atomic Habits", author: "James Clear", year: 2018, genre: "Nonfiction", coverColor: "#3d3a36" },
  { id: "when-breath-becomes-air", title: "When Breath Becomes Air", author: "Paul Kalanithi", year: 2016, genre: "Memoir", coverColor: "#594433" },
  { id: "the-thursday-murder-club", title: "The Thursday Murder Club", author: "Richard Osman", year: 2020, genre: "Mystery", coverColor: "#4d3b55" },
];

// --- DOM Elements ---
const popularGrid = document.getElementById("popular-grid");
const discoverGrid = document.getElementById("discover-grid");
const genreGrid = document.getElementById("genre-grid");
const genreFilters = document.getElementById("genre-filters");

const searchForm = document.querySelector(".search-form");
const searchInput = document.getElementById("book-search");
const searchSubmitButton = searchForm ? searchForm.querySelector("button[type='submit']") : null;
const searchStatus = document.getElementById("search-status");
const searchSection = document.getElementById("search-results");
const searchStatusPanel = document.getElementById("search-status-panel");
const searchGrid = document.getElementById("search-grid");
const clearSearchButton = document.getElementById("clear-search");

const catalogHome = document.getElementById("catalog-home");
const homeStatusPanel = document.getElementById("home-status-panel");

const libraryGrid = document.getElementById("library-grid");
const libraryEmpty = document.getElementById("library-empty");
const libraryCount = document.getElementById("library-count");
const libraryFilter = document.getElementById("library-filter");

const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.getElementById("site-nav");

const loginModal = document.getElementById("login-modal");
const openLoginButton = document.getElementById("open-login");
const closeLoginButton = document.getElementById("close-login");

const finderModal = document.getElementById("finder-modal");
const closeFinderButton = document.getElementById("close-finder");
const finderBookSummary = document.getElementById("finder-book-summary");
const finderLinks = document.getElementById("finder-links");

// --- Application State ---
const booksCache = new Map(); // In-memory book cache by ID
let savedIds = loadSavedIds();
let savedBooksMap = loadSavedBooksMap();
let bookStates = loadBookStates();
loadCachedBooks();
const genreCache = new Map(); // Cache per genre query
let popularBooks = [];
let discoverBooks = [];
let activeGenre = "All";
let currentSearchQuery = "";

// Seed legacy sample books into cache for backward compatibility
LEGACY_SAMPLE_BOOKS.forEach((book) => {
  booksCache.set(book.id, book);
});

// --- Local Storage Helpers ---
function loadSavedIds() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return [];
  }
}

function persistSavedIds() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedIds));
  window.dispatchEvent(new CustomEvent("lumen:library-changed"));
}

function loadSavedBooksMap() {
  const map = new Map();
  try {
    const saved = localStorage.getItem(SAVED_BOOKS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        parsed.forEach((book) => {
          if (book && book.id) {
            map.set(book.id, book);
            booksCache.set(book.id, book);
          }
        });
      }
    }
  } catch (error) {
    console.error("Could not load saved books from storage:", error);
  }
  return map;
}

function persistSavedBooksMap() {
  try {
    localStorage.setItem(SAVED_BOOKS_STORAGE_KEY, JSON.stringify(Array.from(savedBooksMap.values())));
    window.dispatchEvent(new CustomEvent("lumen:library-changed"));
  } catch (error) {
    console.error("Could not persist saved books to storage:", error);
  }
}

function loadCachedBooks() {
  try {
    const saved = localStorage.getItem(BOOK_CACHE_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    if (Array.isArray(parsed)) {
      parsed.forEach((book) => {
        if (book && book.id) booksCache.set(book.id, book);
      });
    }
  } catch (error) {
    console.error("Could not load cached books:", error);
  }
}

function persistBookCache() {
  try {
    localStorage.setItem(BOOK_CACHE_STORAGE_KEY, JSON.stringify(Array.from(booksCache.values()).slice(-100)));
  } catch (error) {
    console.error("Could not persist cached books:", error);
  }
}

function cacheBook(book) {
  if (!book || !book.id) return;
  booksCache.delete(book.id);
  booksCache.set(book.id, book);
  while (booksCache.size > 100) booksCache.delete(booksCache.keys().next().value);
  persistBookCache();
}

function loadBookStates() {
  const states = new Map();
  try {
    const saved = localStorage.getItem(BOOK_STATES_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([id, state]) => {
        if (!state || typeof state !== "object") return;
        states.set(id, {
          favorite: state.favorite === true,
          status: BOOK_STATUSES.includes(state.status) ? state.status : "to-read",
          progress: Math.min(100, Math.max(0, Number.parseInt(state.progress, 10) || 0)),
        });
      });
    }
  } catch (error) {
    console.error("Could not load reading states:", error);
  }
  return states;
}

function persistBookStates() {
  try {
    localStorage.setItem(BOOK_STATES_STORAGE_KEY, JSON.stringify(Object.fromEntries(bookStates)));
    window.dispatchEvent(new CustomEvent("lumen:library-changed"));
  } catch (error) {
    console.error("Could not persist reading states:", error);
  }
}

function getBookState(bookId) {
  return bookStates.get(bookId) || { favorite: false, status: "to-read", progress: 0 };
}

function updateBookState(bookId, updates) {
  const current = getBookState(bookId);
  const next = { ...current, ...updates };
  next.favorite = next.favorite === true;
  next.status = BOOK_STATUSES.includes(next.status) ? next.status : "to-read";
  next.progress = Math.min(100, Math.max(0, Number.parseInt(next.progress, 10) || 0));
  bookStates.set(bookId, next);
  persistBookStates();
  return next;
}

function getSafeHttpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch (error) {
    return null;
  }
}

function normalizeMatchText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

async function fetchJsonWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const request = (async () => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return response.json();
    })();
    return await Promise.race([request, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function withTimeout(promise, timeoutMs, requestLabel) {
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${requestLabel} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchGoogleBooksVolume(book) {
  if (!book.title || book.title === "Untitled") return null;
  const query = [`intitle:${book.title}`];
  if (book.author && book.author !== "Unknown Author") query.push(`inauthor:${book.author}`);
  const params = new URLSearchParams({ q: query.join(" "), maxResults: "10" });

  const data = await fetchJsonWithTimeout(`https://www.googleapis.com/books/v1/volumes?${params}`);
  const expectedTitle = normalizeMatchText(book.title);
  const expectedAuthors = normalizeMatchText(book.author).split(" ").filter(Boolean);
  const items = Array.isArray(data.items) ? data.items : [];

  return items.find((item) => {
    const volumeInfo = item.volumeInfo || {};
    if (normalizeMatchText(volumeInfo.title) !== expectedTitle) return false;
    if (!expectedAuthors.length || book.author === "Unknown Author") return true;
    const returnedAuthors = normalizeMatchText((volumeInfo.authors || []).join(" "));
    return expectedAuthors.every((part) => returnedAuthors.includes(part));
  }) || null;
}

async function fetchOpenLibraryAvailability(book) {
  const lookupKeys = Array.from(new Set([book.editionKey, book.workKey].filter(Boolean)));
  const lookups = await Promise.all(lookupKeys.map(async (lookupKey) => {
    const params = new URLSearchParams({
      q: `key:"${lookupKey}"`,
      fields: "key,ebook_access,public_scan_b,lending_edition_s,lending_identifier_s",
      limit: "1",
    });
    try {
      const data = await fetchJsonWithTimeout(`${OPEN_LIBRARY_SEARCH_URL}?${params}`);
      return Array.isArray(data.docs)
        ? data.docs.find((record) => record.key === lookupKey) || null
        : null;
    } catch (error) {
      console.warn("Open Library search availability was unavailable:", error);
      return null;
    }
  }));

  const editionRecord = book.editionKey
    ? lookups.find((record) => record && record.key === book.editionKey)
    : null;
  const workRecord = book.workKey
    ? lookups.find((record) => record && record.key === book.workKey)
    : null;
  const record = editionRecord || workRecord || {};
  const lendingEdition = record.lending_edition_s;
  const normalizedLendingEdition = typeof lendingEdition === "string"
    ? lendingEdition.startsWith("/books/") ? lendingEdition : `/books/${lendingEdition}`
    : null;
  const lendingEditionKey = normalizedLendingEdition && /^\/books\/OL\d+M$/.test(normalizedLendingEdition)
    ? normalizedLendingEdition
    : null;
  let ebooks = [];

  if (book.editionKey && /^\/books\/OL\d+M$/.test(book.editionKey)) {
    const params = new URLSearchParams({
      bibkeys: `OLID:${book.editionKey.slice("/books/".length)}`,
      format: "json",
      jscmd: "data",
    });
    try {
      const data = await fetchJsonWithTimeout(`${OPEN_LIBRARY_API_URL}/api/books?${params}`);
      const editionData = data[`OLID:${book.editionKey.slice("/books/".length)}`];
      ebooks = Array.isArray(editionData?.ebooks) ? editionData.ebooks : [];
    } catch (error) {
      console.warn("Open Library ebook details were unavailable:", error);
    }
  }

  return {
    ebookAccess: editionRecord?.ebook_access || "",
    workEbookAccess: workRecord?.ebook_access || "",
    publicScan: editionRecord?.public_scan_b === true,
    lendingEditionKey: lendingEditionKey,
    ebooks: ebooks,
  };
}

function getExplicitDownloadLinks(ebooks) {
  const links = [];
  ebooks.forEach((ebook) => {
    if (ebook.availability !== "public" || !ebook.formats || typeof ebook.formats !== "object") return;
    Object.entries(ebook.formats).forEach(([format, value]) => {
      const sourceUrl = typeof value === "string" ? value : value && typeof value.url === "string" ? value.url : "";
      const url = getSafeHttpsUrl(sourceUrl);
      if (url) links.push({ label: `Download Ebook (${format.toUpperCase()})`, url: url, source: "Open Library" });
    });
  });
  return links;
}

function getGoogleDownloadLinks(volume) {
  const accessInfo = volume?.accessInfo || {};
  return ["pdf", "epub"].flatMap((format) => {
    const formatInfo = accessInfo[format];
    const url = formatInfo?.isAvailable === true ? getSafeHttpsUrl(formatInfo.downloadLink) : null;
    return url ? [{ label: `Download Ebook (${format.toUpperCase()})`, url: url, source: "Google Books" }] : [];
  });
}

function hasOpenLibraryReadingOption(book, openLibrary) {
  if (!openLibrary) return false;
  if (openLibrary.ebookAccess === "public" && book.editionKey) return true;
  if (
    openLibrary.lendingEditionKey === book.editionKey &&
    ["borrowable", "printdisabled"].includes(openLibrary.ebookAccess)
  ) return true;
  return openLibrary.ebooks.some((ebook) => {
    const previewUrl = getSafeHttpsUrl(ebook.preview_url);
    return previewUrl && ["public", "borrowable", "printdisabled"].includes(ebook.availability);
  });
}

function getReadingSearchOptions(book) {
  const titleAuthor = `${book.title || ""} ${book.author && book.author !== "Unknown Author" ? book.author : ""}`.trim();
  const options = [
    {
      label: "Search Reading Sources",
      url: `https://books.google.com/books?q=${encodeURIComponent(titleAuthor)}`,
      source: "Google Books search",
    },
    {
      label: "Search Open Library",
      url: `https://openlibrary.org/search?q=${encodeURIComponent(titleAuthor)}`,
      source: "Open Library search",
    },
  ];

  const godanMatch = /godan|go dan/.test(normalizeMatchText(book.title)) ||
    normalizeMatchText(book.author).includes("premchand");
  const hindiTitle = book.hindiTitle || (godanMatch ? "गोदान" : "");
  if (hindiTitle) {
    const hindiQuery = `${hindiTitle} मुंशी प्रेमचंद`;
    options.push({
      label: `Search Hindi title: ${hindiTitle}`,
      url: `https://books.google.com/books?q=${encodeURIComponent(hindiQuery)}`,
      source: "Google Books search",
    });
    options.push({
      label: `Search Open Library in Hindi`,
      url: `https://openlibrary.org/search?q=${encodeURIComponent(hindiQuery)}`,
      source: "Open Library search",
    });
  }

  return options;
}

function renderReadingOptions(book, openLibrary, googleVolume) {
  const status = document.getElementById("reading-status");
  const actions = document.getElementById("reading-actions");
  const editionsLink = document.getElementById("view-editions-link");
  if (!status || !actions) return;

  openLibrary = openLibrary || { ebookAccess: "", publicScan: false, lendingEditionKey: null, ebooks: [] };
  actions.replaceChildren();
  status.textContent = "No verified online reader is available. Search results are not confirmed editions.";
  if (editionsLink) editionsLink.hidden = true;
  const options = [];
  const selectedEditionKey = book.editionKey;
  const olEbooks = openLibrary.ebooks || [];
  olEbooks.forEach((ebook) => {
    const previewUrl = getSafeHttpsUrl(ebook.preview_url);
    if (ebook.availability === "public" && previewUrl) {
      options.push({ label: "Read Online", url: previewUrl, source: "Open Library", prominent: true });
    } else if (["borrowable", "printdisabled"].includes(ebook.availability) && previewUrl) {
      options.push({ label: "Borrow Book", url: previewUrl, source: "Open Library", prominent: true });
    }
  });

  const googleAccess = googleVolume?.accessInfo || {};
  const googleReaderUrl = getSafeHttpsUrl(googleAccess.webReaderLink);
  if (["ALL_PAGES", "PARTIAL"].includes(googleAccess.viewability) && googleReaderUrl) {
    options.push({ label: "Read Online (Google Books)", url: googleReaderUrl, source: "Google Books", prominent: true });
  }

  const currentEditionAccess = openLibrary.ebookAccess;
  if (
    !options.some((option) => option.source === "Open Library") &&
    currentEditionAccess === "public" &&
    (openLibrary.publicScan || selectedEditionKey)
  ) {
    const recordUrl = getValidOpenLibraryRecordUrl(selectedEditionKey || book.workKey);
    if (recordUrl) options.push({ label: "Read Online (Open Library)", url: recordUrl, source: "Open Library", prominent: true });
  }

  const lendingEditionMatches = openLibrary.lendingEditionKey && selectedEditionKey === openLibrary.lendingEditionKey;
  if (
    !options.some((option) => option.source === "Open Library") &&
    lendingEditionMatches &&
    ["borrowable", "printdisabled"].includes(currentEditionAccess)
  ) {
    const recordUrl = getValidOpenLibraryRecordUrl(openLibrary.lendingEditionKey);
    if (recordUrl) options.push({ label: "Borrow Book", url: recordUrl, source: "Open Library", prominent: true });
  }

  options.push(...getExplicitDownloadLinks(olEbooks), ...getGoogleDownloadLinks(googleVolume));

  const seenUrls = new Set();
  options.forEach((option) => {
    if (seenUrls.has(option.url)) return;
    seenUrls.add(option.url);
    const link = document.createElement("a");
    link.className = option.prominent ? "reading-option primary-action" : "reading-option secondary-action";
    link.href = option.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = option.label;
    link.setAttribute("aria-label", `${option.label} · ${option.source}`);
    actions.appendChild(link);
  });

  if (editionsLink && book.workKey) {
    editionsLink.href = `https://openlibrary.org${book.workKey}/editions`;
    editionsLink.hidden = false;
  }

  if (options.length) {
    const sources = Array.from(new Set(options.map((option) => option.source)));
    status.textContent = `Verified by ${sources.join(" and ")}. Availability may change on the source site.`;
  } else {
    status.textContent = "No verified online reader is available. Search results are not confirmed editions.";
    getReadingSearchOptions(book).forEach((searchOption) => {
      const link = document.createElement("a");
      link.className = searchOption.label === "Search Reading Sources"
        ? "reading-option primary-action"
        : "reading-option secondary-action";
      link.href = searchOption.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = searchOption.label;
      link.setAttribute("aria-label", `${searchOption.label}. Search results, not a verified reading copy.`);
      actions.appendChild(link);
    });
  }
}

function renderEditionMetadata(book) {
  const editions = Array.isArray(book.editions) ? book.editions : [];
  const selected = book.selectedEdition || null;
  const selectorWrap = document.getElementById("edition-selector-wrap");
  const selector = document.getElementById("edition-selector");
  const isbn = document.getElementById("detail-edition-isbn");
  const details = document.getElementById("detail-identifiers");
  const year = document.getElementById("detail-year");
  if (!selectorWrap || !selector || !isbn || !details || !year) return;

  selectorWrap.hidden = editions.length < 2;
  selector.replaceChildren();
  editions.forEach((edition) => {
    const option = document.createElement("option");
    option.value = edition.key;
    const metadata = [edition.year, edition.publisher].filter(Boolean).join(" · ");
    option.textContent = `${edition.title}${metadata ? ` (${metadata})` : ""}`;
    selector.appendChild(option);
  });
  if (selected) selector.value = selected.key;

  const isbn13 = selected?.isbn13[0] || "";
  const isbn10 = selected?.isbn10[0] || "";
  const selectedIsbn = isbn13 || isbn10;
  isbn.hidden = !selectedIsbn;
  isbn.textContent = selectedIsbn ? `${isbn13 ? "ISBN-13" : "ISBN-10"}: ${selectedIsbn}` : "";

  details.replaceChildren();
  appendDetailIdentifier(details, "Work key", book.workKey);
  appendDetailIdentifier(details, "Edition key", selected?.key);
  appendDetailIdentifier(details, "Publisher", selected?.publisher);
  appendDetailIdentifier(details, "Edition published", selected?.publishDate);
  appendDetailIdentifier(details, "Format", selected?.format);
  appendDetailIdentifier(details, "Pages", selected?.pages);
  appendDetailIdentifier(details, "Language", selected?.language);

  if (selected?.year) year.textContent = book.year
    ? `First published ${book.year} · This edition ${selected.year}`
    : `This edition published ${selected.year}`;
  else year.textContent = book.year ? `First published ${book.year}` : "Publication year not available";
}

function renderDetailLinks(book) {
  const externalLinks = document.getElementById("detail-external-links");
  if (!externalLinks) return;
  externalLinks.replaceChildren();
  getBookSearchLinks(book).forEach((item) => {
    const link = document.createElement("a");
    link.className = "finder-link-item";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const text = document.createElement("span");
    text.className = "finder-platform-name";
    text.textContent = item.platform;
    const detailText = document.createElement("span");
    detailText.className = "finder-query-detail";
    detailText.textContent = `${item.queryLabel} · ${item.badge}`;
    const content = document.createElement("span");
    content.className = "finder-link-main";
    content.append(text, detailText);
    link.append(content);
    externalLinks.appendChild(link);
  });
}

function renderBookDetails(book) {
  book.editions = Array.isArray(book.editions) ? book.editions : [];
  if (!book.selectedEdition && book.editionKey) {
    book.selectedEdition = book.editions.find((edition) => edition.key === book.editionKey) || null;
  }
  const detail = document.getElementById("book-detail");
  const status = document.getElementById("detail-status");
  const cover = document.getElementById("detail-cover");
  const title = document.getElementById("detail-title");
  const author = document.getElementById("detail-author");
  const genre = document.getElementById("detail-genre");
  const description = document.getElementById("detail-description");
  const descriptionSource = document.getElementById("detail-description-source");
  if (!detail || !status || !cover || !title || !author || !genre || !description) return;

  title.textContent = book.title || "Untitled";
  document.title = `${title.textContent} | Lumen Press`;
  author.textContent = book.author || "Unknown Author";
  genre.textContent = book.genre || "Book";
  description.textContent = book.description || "Loading description from Open Library…";
  if (descriptionSource) descriptionSource.textContent = book.descriptionSource ? `Description source: ${book.descriptionSource}` : "";

  cover.replaceChildren();
  if (book.coverUrl) {
    const image = document.createElement("img");
    image.src = book.coverUrl;
    image.alt = `Cover of ${book.title}`;
    image.loading = "lazy";
    image.onerror = () => {
      cover.replaceChildren();
      renderPlaceholderCover(cover, book);
    };
    cover.appendChild(image);
  } else {
    renderPlaceholderCover(cover, book);
  }

  renderEditionMetadata(book);
  renderDetailLinks({ ...book, isbn: book.selectedEdition?.isbn13[0] || book.selectedEdition?.isbn10[0] || null });

  const saveButton = document.getElementById("detail-save");
  if (saveButton) {
    saveButton.dataset.bookId = book.id;
    saveButton.textContent = savedIds.includes(book.id) ? "Saved to My Library" : "Save to My Library";
    saveButton.setAttribute("aria-pressed", String(savedIds.includes(book.id)));
  }

  const favoriteButton = document.getElementById("detail-favorite");
  if (favoriteButton) {
    const state = getBookState(book.id);
    favoriteButton.dataset.favoriteId = book.id;
    favoriteButton.textContent = state.favorite ? "Favorited" : "Favorite";
    favoriteButton.setAttribute("aria-pressed", String(state.favorite));
  }

  const selector = document.getElementById("edition-selector");
  if (selector) {
    selector.onchange = () => {
      const selected = book.editions.find((edition) => edition.key === selector.value);
      if (!selected) return;
      book.selectedEdition = selected;
      book.editionKey = selected.key;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("edition", selected.key);
      window.history.replaceState(null, "", nextUrl.href);
      renderEditionMetadata(book);
      renderDetailLinks({ ...book, isbn: selected.isbn13[0] || selected.isbn10[0] || null });
      loadBookResources(book);
      renderBookQr(book);
    };
  }

  status.hidden = true;
  detail.classList.remove("is-hidden");
  loadBookResources(book);
  renderBookQr(book);
}

let detailResourceSequence = 0;

async function loadBookResources(book) {
  const requestSequence = ++detailResourceSequence;
  const description = document.getElementById("detail-description");
  const descriptionSource = document.getElementById("detail-description-source");
  const readingStatus = document.getElementById("reading-status");
  const readingActions = document.getElementById("reading-actions");
  if (!description || !readingStatus || !readingActions) return;

  if (!book.description) {
    description.textContent = "Checking available descriptions…";
    if (descriptionSource) descriptionSource.textContent = "";
  }
  readingStatus.textContent = "Checking reading availability...";
  let openLibrary = { ebookAccess: "", workEbookAccess: "", publicScan: false, lendingEditionKey: null, ebooks: [] };
  let googleVolume = null;

  try {
    openLibrary = await withTimeout(
      fetchOpenLibraryAvailability(book),
      8500,
      "Open Library availability check"
    );

    if (!book.description || !hasOpenLibraryReadingOption(book, openLibrary)) {
      try {
        googleVolume = await withTimeout(
          fetchGoogleBooksVolume(book),
          5000,
          "Google Books availability check"
        );
      } catch (error) {
        console.warn("Could not check Google Books details:", error);
      }
    }

    if (requestSequence !== detailResourceSequence) return;

    if (!book.description) {
      const googleDescription = typeof googleVolume?.volumeInfo?.description === "string"
        ? googleVolume.volumeInfo.description.trim()
        : "";
      if (googleDescription) {
        description.textContent = googleDescription;
        if (descriptionSource) descriptionSource.textContent = "Description source: Google Books";
      } else {
        description.textContent = "Description not available for this edition.";
        if (descriptionSource) descriptionSource.textContent = "";
      }
    } else if (descriptionSource && !descriptionSource.textContent) {
      descriptionSource.textContent = `Description source: ${book.descriptionSource || "Open Library"}`;
    }

    renderReadingOptions(book, openLibrary, googleVolume);
  } catch (error) {
    console.warn("Reading availability check did not complete:", error);
    if (requestSequence !== detailResourceSequence) return;
    if (!book.description) description.textContent = "Description not available for this edition.";
    renderReadingOptions(book, null, null);
  } finally {
    if (requestSequence === detailResourceSequence && readingStatus.textContent === "Checking reading availability...") {
      renderReadingOptions(book, null, null);
    }
  }
}

async function loadBookDetails() {
  const status = document.getElementById("detail-status");
  if (!status) return;

  const params = new URLSearchParams(window.location.search);
  const identifier = params.get("id") || params.get("key");
  const requestedEditionKey = getOpenLibraryKey(params.get("edition") || "");
  if (!identifier) {
    status.textContent = "No book identifier was provided. Browse the catalog to choose a book.";
    return;
  }

  const cachedBook = booksCache.get(identifier) || savedBooksMap.get(identifier) || null;
  const key = getOpenLibraryKey(identifier);
  if (!key) {
    if (cachedBook) {
      const localBook = { ...cachedBook, workKey: cachedBook.workKey || null, editions: [], selectedEdition: null };
      renderBookDetails(localBook);
      return;
    }
    status.textContent = "This book identifier is not recognized. Browse the catalog to find a book.";
    return;
  }

  try {
    const fetchedBook = await fetchOpenLibraryBook(
      key,
      cachedBook?.editionKeys || [],
      requestedEditionKey,
      cachedBook
    );
    cacheBook(fetchedBook);
    renderBookDetails(fetchedBook);
  } catch (error) {
    console.error("Could not load book details:", error);
    if (cachedBook) {
      renderBookDetails({ ...cachedBook, workKey: cachedBook.workKey || key, editions: [], selectedEdition: null });
      const description = document.getElementById("detail-description");
      if (description && !cachedBook.description) description.textContent = "Description not available for this edition.";
      return;
    }
    status.textContent = "Book details could not be loaded from Open Library. Return to the catalog and try again.";
  }
}

// --- Data Normalization & Formatting ---
function getCoverColor(title = "") {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash + title.charCodeAt(i)) % COVER_PALETTE.length;
  }
  return COVER_PALETTE[hash] || COVER_PALETTE[0];
}

function getBookDetailsUrl(book) {
  const identifier = book.workKey || book.key || book.id;
  const editionKey = book.editionKey;
  const editionParam = editionKey && editionKey !== identifier
    ? `&edition=${encodeURIComponent(editionKey)}`
    : "";
  return `book.html?id=${encodeURIComponent(identifier)}${editionParam}`;
}

/**
 * Transforms an Open Library doc into a normalized, clean book object.
 */
function formatBookDoc(doc, defaultGenre = "Literature") {
  // Author name extraction
  let author = "Unknown Author";
  if (Array.isArray(doc.author_name) && doc.author_name.length > 0) {
    author = doc.author_name.slice(0, 2).join(", ");
  }

  // First publication year
  let year = null;
  if (doc.first_publish_year) {
    year = doc.first_publish_year;
  } else if (Array.isArray(doc.publish_year) && doc.publish_year.length > 0) {
    year = doc.publish_year[0];
  }

  // Cover image URL
  const coverUrl = doc.cover_i
    ? `${OPEN_LIBRARY_COVER_URL}${doc.cover_i}-M.jpg`
    : null;

  // Genre / Subject
  let genre = defaultGenre;
  if (Array.isArray(doc.subject) && doc.subject.length > 0) {
    // Pick the first clean subject
    genre = doc.subject[0];
  }

  // Extract reliably available ISBN without inventing one
  let isbn = null;
  if (Array.isArray(doc.isbn) && doc.isbn.length > 0) {
    const isbn13 = doc.isbn.find(
      (code) => typeof code === "string" && (code.startsWith("978") || code.startsWith("979"))
    );
    isbn = isbn13 || doc.isbn[0];
  }

  // Work or edition record key from Open Library
  const key = doc.key || null;

  // Unique identifier
  const id = doc.key || (doc.cover_i ? `cover-${doc.cover_i}` : `book-${doc.title}`);

  return {
    id: id,
    key: key,
    workKey: key && /^\/works\/OL\d+W$/.test(key) ? key : null,
    editionKeys: Array.isArray(doc.edition_key) ? doc.edition_key.slice() : [],
    authorNames: Array.isArray(doc.author_name) ? doc.author_name.slice() : [],
    languageCodes: Array.isArray(doc.language) ? doc.language.slice() : [],
    title: doc.title || "Untitled",
    author: author,
    year: year,
    coverUrl: coverUrl,
    coverId: doc.cover_i || null,
    description: typeof doc.description === "string" ? doc.description : "",
    genre: genre,
    isbn: isbn,
    isbns: Array.isArray(doc.isbn) ? doc.isbn.slice() : [],
    infoLink: doc.infoLink || null,
    previewLink: doc.previewLink || null,
    coverColor: getCoverColor(doc.title || ""),
  };
}

// --- API Fetch Helper ---
/**
 * Fetches books from Open Library search API with fields selection for fast responses.
 */
async function fetchBooksFromOpenLibrary(query, limit = 8, defaultGenre = "Literature") {
  const url = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(query)}&fields=key,title,author_name,first_publish_year,cover_i,subject,isbn,edition_key&limit=${limit}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open Library search failed with status ${response.status}`);
  }

  const data = await response.json();
  const docs = Array.isArray(data.docs) ? data.docs : [];

  const books = docs.map((doc) => formatBookDoc(doc, defaultGenre));

  // Store into cache for quick lookups
  books.forEach((book) => booksCache.set(book.id, book));
  persistBookCache();

  return books;
}

// --- Status State Helpers (Loading, Error, Retry) ---
/**
 * Displays a loading or error message with an optional retry button.
 * Uses safe DOM methods exclusively.
 */
function showStatus(panel, { message, isError = false, onRetry = null }) {
  if (!panel) return;
  panel.replaceChildren();
  panel.hidden = false;
  panel.classList.toggle("is-error", isError);

  const p = document.createElement("p");
  p.textContent = message;
  panel.appendChild(p);

  if (onRetry) {
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "retry-button";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", onRetry);
    panel.appendChild(retryBtn);
  }
}

/**
 * Hides and resets a status panel.
 */
function hideStatus(panel) {
  if (!panel) return;
  panel.replaceChildren();
  panel.hidden = true;
  panel.classList.remove("is-error");
}

// --- Safe DOM Rendering ---
/**
 * Renders the placeholder view for a book without a cover image.
 */
function renderPlaceholderCover(coverEl, book) {
  coverEl.classList.add("is-placeholder");
  if (book.coverColor) {
    coverEl.style.backgroundColor = book.coverColor;
  }

  const kicker = document.createElement("p");
  kicker.className = "cover-kicker";
  kicker.textContent = book.genre || "Book";

  const textWrap = document.createElement("div");

  const title = document.createElement("h3");
  title.className = "cover-title";
  title.textContent = book.title;

  const author = document.createElement("p");
  author.className = "cover-author";
  author.textContent = book.author;

  textWrap.appendChild(title);
  textWrap.appendChild(author);

  coverEl.appendChild(kicker);
  coverEl.appendChild(textWrap);
}

/**
 * Creates an article card element for a book using safe DOM methods.
 */
function createBookCard(book) {
  const isSaved = savedIds.includes(book.id);

  const card = document.createElement("article");
  card.className = "book-card";

  // Book cover
  const coverEl = document.createElement("div");
  coverEl.className = "book-cover";
  coverEl.setAttribute("aria-hidden", "true");

  if (book.coverUrl) {
    const img = document.createElement("img");
    img.src = book.coverUrl;
    img.alt = ""; // Decorative image, book metadata is read in text
    img.loading = "lazy";
    // If the cover image fails to load, gracefully fall back to placeholder
    img.onerror = () => {
      coverEl.replaceChildren();
      renderPlaceholderCover(coverEl, book);
    };
    coverEl.appendChild(img);
  } else {
    renderPlaceholderCover(coverEl, book);
  }

  const coverLink = document.createElement("a");
  coverLink.className = "book-cover-link";
  coverLink.href = getBookDetailsUrl(book);
  coverLink.setAttribute("aria-label", `View details for ${book.title}`);
  coverLink.appendChild(coverEl);

  // Book metadata
  const metaEl = document.createElement("div");
  metaEl.className = "book-meta";

  const genreEl = document.createElement("p");
  genreEl.className = "genre";
  genreEl.textContent = book.genre || "Book";

  const titleEl = document.createElement("h3");
  const detailLink = document.createElement("a");
  detailLink.className = "book-detail-link";
  detailLink.href = getBookDetailsUrl(book);
  detailLink.textContent = book.title;
  titleEl.appendChild(detailLink);

  const authorEl = document.createElement("p");
  authorEl.textContent = book.author;

  metaEl.appendChild(genreEl);
  metaEl.appendChild(titleEl);
  metaEl.appendChild(authorEl);

  // Requirement 2: Display first publication year when available
  if (book.year) {
    const yearEl = document.createElement("p");
    yearEl.textContent = `First published ${book.year}`;
    metaEl.appendChild(yearEl);
  }

  // Action buttons container
  const actionsEl = document.createElement("div");
  actionsEl.className = "book-actions";

  // Save button
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.setAttribute("data-book-id", book.id);
  saveBtn.setAttribute("aria-pressed", String(isSaved));
  saveBtn.textContent = isSaved ? "Saved" : "Save";

  const bookState = getBookState(book.id);
  const favoriteBtn = document.createElement("button");
  favoriteBtn.type = "button";
  favoriteBtn.className = "favorite-button";
  favoriteBtn.setAttribute("data-favorite-id", book.id);
  favoriteBtn.setAttribute("aria-pressed", String(bookState.favorite));
  favoriteBtn.textContent = bookState.favorite ? "Favorited" : "Favorite";

  // Universal Book Finder ("Where to Find") button
  const findBtn = document.createElement("button");
  findBtn.type = "button";
  findBtn.className = "find-book-button";
  findBtn.setAttribute("data-find-book-id", book.id);
  findBtn.setAttribute("aria-haspopup", "dialog");
  findBtn.setAttribute("aria-controls", "finder-modal");
  findBtn.textContent = "Where to Find";

  actionsEl.appendChild(saveBtn);
  actionsEl.appendChild(favoriteBtn);
  if (finderModal) actionsEl.appendChild(findBtn);

  if (document.body.dataset.page === "library") {
    const controls = document.createElement("div");
    controls.className = "reading-controls";

    const statusLabel = document.createElement("label");
    statusLabel.textContent = "Reading status";
    const statusSelect = document.createElement("select");
    statusSelect.className = "reading-status-select";
    statusSelect.setAttribute("aria-label", `Reading status for ${book.title}`);
    [
      ["to-read", "Want to read"],
      ["reading", "Currently reading"],
      ["finished", "Finished"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      statusSelect.appendChild(option);
    });
    statusSelect.value = bookState.status;
    statusSelect.addEventListener("change", () => {
      updateBookState(book.id, { status: statusSelect.value });
      if (libraryFilter && BOOK_STATUSES.includes(libraryFilter.value)) renderLibrary();
    });
    statusLabel.appendChild(statusSelect);

    const progressLabel = document.createElement("label");
    progressLabel.className = "progress-label";
    progressLabel.textContent = "Reading progress";
    const progressInput = document.createElement("input");
    progressInput.type = "range";
    progressInput.min = "0";
    progressInput.max = "100";
    progressInput.step = "1";
    progressInput.value = String(bookState.progress);
    progressInput.setAttribute("aria-label", `Reading progress for ${book.title}`);
    const progressOutput = document.createElement("output");
    progressOutput.textContent = `${bookState.progress}%`;
    progressInput.addEventListener("input", () => {
      progressOutput.textContent = `${progressInput.value}%`;
    });
    progressInput.addEventListener("change", () => updateBookState(book.id, { progress: progressInput.value }));
    progressLabel.append(progressInput, progressOutput);
    controls.append(statusLabel, progressLabel);
    card.appendChild(controls);
  }

  card.appendChild(coverLink);
  card.appendChild(metaEl);
  card.appendChild(actionsEl);

  return card;
}

/**
 * Empties a container and renders cards or an empty note.
 */
function renderBooks(target, books, emptyMessage = "No matching titles found.") {
  if (!target) return;
  target.replaceChildren();

  if (books.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = emptyMessage;
    target.appendChild(empty);
    return;
  }

  books.forEach((book) => {
    target.appendChild(createBookCard(book));
  });
}

// --- Homepage Sections ---
/**
 * Loads real book data for Popular Books and Discover sections from Open Library.
 */
async function loadHomepageBooks() {
  showStatus(homeStatusPanel, {
    message: "Loading live books from Open Library...",
    isError: false,
  });

  try {
    // Fetch live books in parallel:
    // 1) "programming" shelf for Popular Books (matches index.html subtitle)
    // 2) "literature" shelf for Discover Something New
    const [popularResult, discoverResult] = await Promise.all([
      fetchBooksFromOpenLibrary("programming", 8, "Programming"),
      fetchBooksFromOpenLibrary("classic literature", 8, "Classics"),
    ]);

    popularBooks = popularResult;
    discoverBooks = discoverResult;

    hideStatus(homeStatusPanel);

    renderBooks(popularGrid, popularBooks);
    renderBooks(discoverGrid, discoverBooks);
    renderGenreBooks();
  } catch (error) {
    console.error("Failed to load homepage books:", error);
    showStatus(homeStatusPanel, {
      message: "Unable to load books from Open Library. Please check your internet connection.",
      isError: true,
      onRetry: () => loadHomepageBooks(),
    });
  }
}

// --- Genre Navigation ---
function renderGenreFilters() {
  if (!genreFilters) return;
  genreFilters.replaceChildren();

  GENRES.forEach((genre) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = genre;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(genre === activeGenre));
    button.addEventListener("click", () => {
      if (activeGenre === genre) return;
      activeGenre = genre;
      renderGenreFilters();
      renderGenreBooks();
    });
    genreFilters.appendChild(button);
  });
}

async function renderGenreBooks() {
  if (!genreGrid) return;

  if (activeGenre === "All") {
    // Show a blend of the fetched popular and discover books
    const combined = [...popularBooks, ...discoverBooks];
    renderBooks(genreGrid, combined.length > 0 ? combined : []);
    return;
  }

  // Check if we already fetched and cached this genre
  if (genreCache.has(activeGenre)) {
    renderBooks(genreGrid, genreCache.get(activeGenre));
    return;
  }

  // Show inline loading state for this genre
  genreGrid.replaceChildren();
  const loadingNote = document.createElement("p");
  loadingNote.className = "empty-note";
  loadingNote.textContent = `Loading ${activeGenre} books from Open Library...`;
  genreGrid.appendChild(loadingNote);

  try {
    const books = await fetchBooksFromOpenLibrary(activeGenre.toLowerCase(), 8, activeGenre);
    genreCache.set(activeGenre, books);
    renderBooks(genreGrid, books, `No ${activeGenre} books found.`);
  } catch (error) {
    console.error(`Failed to load genre ${activeGenre}:`, error);
    genreGrid.replaceChildren();

    const errorNote = document.createElement("p");
    errorNote.className = "empty-note";
    errorNote.textContent = `Could not load ${activeGenre} books from Open Library.`;

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "retry-button";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => renderGenreBooks());

    genreGrid.appendChild(errorNote);
    genreGrid.appendChild(retryBtn);
  }
}

// --- Search Implementation ---
/**
 * Searches Open Library by title or author, handling loading, empty, and error states.
 */
async function runSearch(rawQuery) {
  const query = rawQuery.trim();

  if (!query || !searchSection || !searchGrid) {
    clearSearch();
    return;
  }

  currentSearchQuery = query;

  // Switch from catalog home to search results view
  if (catalogHome) catalogHome.classList.add("is-hidden");
  searchSection.classList.remove("is-hidden");
  searchGrid.replaceChildren();

  // Indicate loading on the submit button and live status
  if (searchSubmitButton) {
    searchSubmitButton.disabled = true;
    searchSubmitButton.textContent = "Searching...";
  }
  searchStatus.textContent = `Searching Open Library for "${query}"...`;

  showStatus(searchStatusPanel, {
    message: `Searching Open Library for "${query}"...`,
    isError: false,
  });

  try {
    const results = await fetchBooksFromOpenLibrary(query, 20, "Search Result");

    if (searchSubmitButton) {
      searchSubmitButton.disabled = false;
      searchSubmitButton.textContent = "Search";
    }

    if (results.length === 0) {
      searchStatus.textContent = `No results found for "${query}".`;
      showStatus(searchStatusPanel, {
        message: `No books found matching "${query}". Try searching by another book title or author.`,
        isError: false,
      });
      searchGrid.replaceChildren();
      return;
    }

    hideStatus(searchStatusPanel);
    searchStatus.textContent = `${results.length} title${results.length === 1 ? "" : "s"} found for "${query}".`;
    renderBooks(searchGrid, results);
  } catch (error) {
    console.error("Search failed:", error);

    if (searchSubmitButton) {
      searchSubmitButton.disabled = false;
      searchSubmitButton.textContent = "Search";
    }

    searchStatus.textContent = "Search failed. Please try again.";
    showStatus(searchStatusPanel, {
      message: "Could not retrieve search results from Open Library. Please check your connection.",
      isError: true,
      onRetry: () => runSearch(query),
    });
    searchGrid.replaceChildren();
  }
}

function clearSearch() {
  if (searchInput) searchInput.value = "";
  if (searchStatus) searchStatus.textContent = "";
  currentSearchQuery = "";
  hideStatus(searchStatusPanel);
  if (searchSection) searchSection.classList.add("is-hidden");
  if (catalogHome) catalogHome.classList.remove("is-hidden");
  if (searchGrid) searchGrid.replaceChildren();
}

// --- My Library Implementation ---
function renderLibrary() {
  if (!libraryGrid || !libraryEmpty || !libraryCount) return;

  // Retrieve saved books from memory or saved books map
  const savedBooks = savedIds
    .map((id) => savedBooksMap.get(id) || booksCache.get(id))
    .filter(Boolean);

  const filter = libraryFilter ? libraryFilter.value : "all";
  const visibleBooks = savedBooks.filter((book) => {
    const state = getBookState(book.id);
    if (filter === "favorites") return state.favorite;
    if (BOOK_STATUSES.includes(filter)) return state.status === filter;
    return true;
  });
  libraryCount.textContent = filter === "all"
    ? savedBooks.length === 1 ? "1 title saved" : `${savedBooks.length} titles saved`
    : `${visibleBooks.length} of ${savedBooks.length} saved titles`;

  if (visibleBooks.length === 0) {
    libraryGrid.replaceChildren();
    libraryGrid.hidden = true;
    libraryEmpty.classList.remove("is-hidden");
    libraryEmpty.textContent = savedBooks.length === 0
      ? "Your shelf is empty. Save a book from the catalog to start a list."
      : "No saved books match this shelf.";
    return;
  }

  libraryGrid.hidden = false;
  libraryEmpty.classList.add("is-hidden");
  renderBooks(libraryGrid, visibleBooks);
}

function toggleSaved(bookId) {
  const isCurrentlySaved = savedIds.includes(bookId);

  if (isCurrentlySaved) {
    savedIds = savedIds.filter((id) => id !== bookId);
    savedBooksMap.delete(bookId);
  } else {
    savedIds.push(bookId);
    const book = booksCache.get(bookId);
    if (book) {
      savedBooksMap.set(bookId, book);
    }
  }

  persistSavedIds();
  persistSavedBooksMap();

  // Instant in-place button state update across any visible cards
  const newSavedState = !isCurrentlySaved;
  const buttons = document.querySelectorAll(`button[data-book-id="${CSS.escape(bookId)}"]`);
  buttons.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(newSavedState));
    btn.textContent = btn.id === "detail-save"
      ? newSavedState ? "Saved to My Library" : "Save to My Library"
      : newSavedState ? "Saved" : "Save";
  });

  renderLibrary();
}

function toggleFavorite(bookId) {
  const current = getBookState(bookId);
  const next = updateBookState(bookId, { favorite: !current.favorite });
  document.querySelectorAll(`button[data-favorite-id="${CSS.escape(bookId)}"]`).forEach((button) => {
    button.setAttribute("aria-pressed", String(next.favorite));
    button.textContent = next.favorite ? "Favorited" : "Favorite";
  });
  renderLibrary();
}

// --- Event Listeners ---
// Delegated click listener for Save / Saved buttons
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-book-id]");
  if (!button) return;
  toggleSaved(button.getAttribute("data-book-id"));
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-favorite-id]");
  if (!button) return;
  toggleFavorite(button.getAttribute("data-favorite-id"));
});

if (libraryFilter) {
  libraryFilter.addEventListener("change", renderLibrary);
}

// Search form submit
if (searchForm) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch(searchInput.value);
  });
}

// Clear search button
if (clearSearchButton) {
  clearSearchButton.addEventListener("click", () => {
    clearSearch();
    if (searchInput) searchInput.focus();
  });
}

// Mobile navigation toggle
if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

// Close mobile navigation on menu item click
if (siteNav) {
  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("is-open");
      if (navToggle) navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// --- Login Modal Dialog ---
function openLoginModal() {
  if (!loginModal) return;
  loginModal.hidden = false;
  document.body.classList.add("modal-open");
  if (openLoginButton) {
    openLoginButton.setAttribute("aria-expanded", "true");
  }
  // Close mobile navigation menu if open
  if (siteNav && siteNav.classList.contains("is-open")) {
    siteNav.classList.remove("is-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }
  // Set focus on close button for accessible dialog navigation
  if (closeLoginButton) {
    closeLoginButton.focus();
  }
}

function closeLoginModal() {
  if (!loginModal || loginModal.hidden) return;
  loginModal.hidden = true;
  // Remove modal-open if finderModal is also not open
  if (!finderModal || finderModal.hidden) {
    document.body.classList.remove("modal-open");
  }
  if (openLoginButton) {
    openLoginButton.setAttribute("aria-expanded", "false");
    openLoginButton.focus();
  }
}

if (openLoginButton) {
  openLoginButton.addEventListener("click", openLoginModal);
}

if (closeLoginButton) {
  closeLoginButton.addEventListener("click", closeLoginModal);
}

// Close when clicking the backdrop outside the card
if (loginModal) {
  loginModal.addEventListener("click", (event) => {
    if (event.target === loginModal) {
      closeLoginModal();
    }
  });
}

// --- Universal Book Finder Implementation ---
/**
 * Generates external search URLs for Amazon India, Flipkart, Google Books, and Open Library.
 * Uses direct records only when an API-provided identifier or volume URL is valid.
 */
function isValidIsbn(value) {
  const isbn = String(value || "").replace(/[\s-]/g, "").toUpperCase();

  if (/^\d{13}$/.test(isbn)) {
    const checksum = Array.from(isbn.slice(0, 12)).reduce(
      (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0
    );
    return (10 - (checksum % 10)) % 10 === Number(isbn[12]);
  }

  if (/^\d{9}[\dX]$/.test(isbn)) {
    const checksum = Array.from(isbn.slice(0, 9)).reduce(
      (sum, digit, index) => sum + Number(digit) * (10 - index),
      0
    );
    const checkDigit = isbn[9] === "X" ? 10 : Number(isbn[9]);
    return (checksum + checkDigit) % 11 === 0;
  }

  return false;
}

function getValidOpenLibraryRecordUrl(key) {
  if (typeof key !== "string") return null;
  if (!/^\/(?:works\/OL\d+W|books\/OL\d+M)$/.test(key)) return null;
  return `https://openlibrary.org${key}`;
}

function getValidGoogleBooksVolumeUrl(book) {
  for (const candidate of [book.infoLink, book.previewLink]) {
    if (typeof candidate !== "string") continue;

    try {
      const url = new URL(candidate);
      const volumeId = url.searchParams.get("id");
      if (
        url.protocol === "https:" &&
        url.hostname === "books.google.com" &&
        url.pathname === "/books" &&
        volumeId &&
        /^[A-Za-z0-9_-]+$/.test(volumeId)
      ) {
        return url.href;
      }
    } catch (error) {
      // Ignore malformed API-provided links and use the next available source.
    }
  }

  return null;
}

function getBookSearchLinks(book) {
  const rawIsbn = book.isbn ? String(book.isbn).trim() : "";
  const isbnQuery = isValidIsbn(rawIsbn) ? rawIsbn : null;
  const titleAuthorQuery = book.author && book.author !== "Unknown Author"
    ? `${book.title} ${book.author}`
    : book.title;

  const searchQuery = isbnQuery || titleAuthorQuery;

  const links = [
    {
      platform: "Amazon India",
      url: `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`,
      badge: "Search Results",
      queryLabel: isbnQuery ? `ISBN: ${isbnQuery}` : `Title and author: "${titleAuthorQuery}"`,
    },
    {
      platform: "Flipkart",
      url: `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}`,
      badge: "Search Results",
      queryLabel: isbnQuery ? `ISBN: ${isbnQuery}` : `Title and author: "${titleAuthorQuery}"`,
    },
  ];

  const googleBooksUrl = getValidGoogleBooksVolumeUrl(book);
  if (googleBooksUrl) {
    links.push({
      platform: "Google Books",
      url: googleBooksUrl,
      badge: "Direct Volume",
      queryLabel: "API-provided book volume",
    });
  }

  const openLibraryUrl = getValidOpenLibraryRecordUrl(book.key);
  links.push({
    platform: "Open Library",
    url: openLibraryUrl || `https://openlibrary.org/search?q=${encodeURIComponent(titleAuthorQuery)}`,
    badge: openLibraryUrl ? "Direct Record" : "Catalog Search",
    queryLabel: openLibraryUrl ? `Record: ${book.key}` : `Search: "${titleAuthorQuery}"`,
  });

  return links;
}

function getOpenLibraryKey(identifier) {
  if (getValidOpenLibraryRecordUrl(identifier)) return identifier;
  if (/^OL\d+W$/.test(identifier)) return `/works/${identifier}`;
  if (/^OL\d+M$/.test(identifier)) return `/books/${identifier}`;
  return null;
}

function getRecordDescription(record) {
  if (typeof record?.description === "string") return record.description.trim();
  if (record?.description && typeof record.description.value === "string") {
    return record.description.value.trim();
  }
  return "";
}

function getEditionIsbns(record, kind) {
  const direct = record[`isbn_${kind}`];
  const identifiers = record.identifiers && record.identifiers[`isbn_${kind}`];
  const values = Array.isArray(direct)
    ? direct
    : typeof direct === "string"
      ? [direct]
      : Array.isArray(identifiers)
        ? identifiers
        : typeof identifiers === "string"
          ? [identifiers]
          : [];
  return values.filter((value) => typeof value === "string" && value.trim());
}

function normalizeEditionRecord(record) {
  if (!record || typeof record.key !== "string" || !/^\/books\/OL\d+M$/.test(record.key)) return null;
  const isbn13 = getEditionIsbns(record, "13");
  const isbn10 = getEditionIsbns(record, "10");
  const coverId = record.cover_i || (Array.isArray(record.covers) ? record.covers.find((cover) => cover > 0) : null);
  const publishDate = typeof record.publish_date === "string" ? record.publish_date : "";
  const yearMatch = publishDate.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/);

  return {
    key: record.key,
    title: record.title || "Untitled edition",
    publishDate: publishDate,
    year: yearMatch ? Number(yearMatch[0]) : null,
    publisher: Array.isArray(record.publishers) ? record.publishers[0] : "",
    format: record.physical_format || "",
    pages: Number(record.number_of_pages) || null,
    language: Array.isArray(record.languages) && record.languages[0]?.key
      ? record.languages[0].key.replace("/languages/", "")
      : "",
    coverId: coverId || null,
    isbn13: isbn13,
    isbn10: isbn10,
    description: getRecordDescription(record),
    archiveId: typeof record.ocaid === "string" ? record.ocaid : "",
  };
}

async function fetchOpenLibraryJson(key) {
  return fetchJsonWithTimeout(`${OPEN_LIBRARY_API_URL}${key}.json`);
}

async function fetchOpenLibraryAuthorNames(record) {
  const authorRefs = Array.isArray(record?.authors) ? record.authors : [];
  const names = await Promise.all(authorRefs.map(async (entry) => {
    const authorRef = entry.author || entry;
    if (typeof authorRef.name === "string") return authorRef.name;
    if (typeof authorRef.key !== "string" || !/^\/authors\/OL\d+A$/.test(authorRef.key)) return null;

    try {
      const authorRecord = await fetchOpenLibraryJson(authorRef.key);
      return typeof authorRecord.name === "string" ? authorRecord.name : null;
    } catch (error) {
      return null;
    }
  }));
  return names.filter(Boolean);
}

async function fetchOpenLibraryBook(key, preferredEditionKeys = [], requestedEditionKey = null, fallbackBook = null) {
  const isWorkKey = /^\/works\/OL\d+W$/.test(key);
  const isEditionKey = /^\/books\/OL\d+M$/.test(key);
  if (!isWorkKey && !isEditionKey) throw new Error("Unrecognized Open Library work or edition key.");

  const initialRecord = await fetchOpenLibraryJson(key);
  const workKey = isWorkKey
    ? key
    : Array.isArray(initialRecord.works)
      ? initialRecord.works.find((work) => typeof work.key === "string" && /^\/works\/OL\d+W$/.test(work.key))?.key || null
      : null;

  let workRecord = isWorkKey ? initialRecord : null;
  if (!workRecord && workKey) {
    try {
      workRecord = await fetchOpenLibraryJson(workKey);
    } catch (error) {
      console.warn("Open Library work record was unavailable:", error);
    }
  }

  let editions = [];
  if (workKey) {
    try {
      const editionData = await fetchJsonWithTimeout(`${OPEN_LIBRARY_API_URL}${workKey}/editions.json?limit=50`);
      editions = (Array.isArray(editionData.entries) ? editionData.entries : [])
        .map(normalizeEditionRecord)
        .filter(Boolean);
    } catch (error) {
      console.warn("Open Library edition list was unavailable:", error);
    }
  }

  const candidateEditionKeys = [requestedEditionKey, isEditionKey ? key : null]
    .filter((candidate) => typeof candidate === "string" && /^\/books\/OL\d+M$/.test(candidate));
  preferredEditionKeys.forEach((candidate) => {
    if (typeof candidate === "string") {
      const normalized = candidate.startsWith("/books/") ? candidate : `/books/${candidate}`;
      if (/^\/books\/OL\d+M$/.test(normalized)) candidateEditionKeys.push(normalized);
    }
  });

  let selectedEdition = requestedEditionKey && editions.find((edition) => edition.key === requestedEditionKey);
  if (!selectedEdition && isEditionKey) {
    selectedEdition = editions.find((edition) => edition.key === key) || null;
  }
  if (!selectedEdition && fallbackBook?.isbn) {
    selectedEdition = editions.find((edition) =>
      edition.isbn13.includes(fallbackBook.isbn) || edition.isbn10.includes(fallbackBook.isbn)
    ) || null;
  }
  if (!selectedEdition) {
    selectedEdition = candidateEditionKeys
      .map((candidate) => editions.find((edition) => edition.key === candidate))
      .find((edition) => edition && (edition.isbn13.length || edition.isbn10.length)) || null;
  }

  if (!selectedEdition && isEditionKey) {
    selectedEdition = normalizeEditionRecord(initialRecord);
    if (selectedEdition && !editions.some((edition) => edition.key === selectedEdition.key)) {
      editions.unshift(selectedEdition);
    }
  }

  if (!selectedEdition) {
    selectedEdition = editions.find((edition) => edition.isbn13.length || edition.isbn10.length) ||
      candidateEditionKeys.map((candidate) => editions.find((edition) => edition.key === candidate)).find(Boolean) ||
      editions[0] || null;
  }

  let selectedEditionRecord = isEditionKey && selectedEdition?.key === key ? initialRecord : null;
  if (selectedEdition && !selectedEditionRecord) {
    try {
      selectedEditionRecord = await fetchOpenLibraryJson(selectedEdition.key);
      selectedEdition = normalizeEditionRecord(selectedEditionRecord) || selectedEdition;
    } catch (error) {
      console.warn("Selected Open Library edition details were unavailable:", error);
    }
  }

  const authorNames = await fetchOpenLibraryAuthorNames(workRecord || selectedEditionRecord);
  const description = getRecordDescription(workRecord) || getRecordDescription(selectedEditionRecord);
  const date = workRecord?.first_publish_date || "";
  const yearMatch = String(date).match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/);
  const coverId = selectedEdition?.coverId || (Array.isArray(workRecord?.covers) ? workRecord.covers.find((cover) => cover > 0) : null);
  const isbn = selectedEdition?.isbn13[0] || selectedEdition?.isbn10[0] || null;
  const title = workRecord?.title || selectedEdition?.title || fallbackBook?.title || "Untitled";
  const author = authorNames.slice(0, 2).join(", ") || fallbackBook?.author || "Unknown Author";
  const recordId = fallbackBook?.id || workKey || key;

  return {
    ...fallbackBook,
    id: recordId,
    key: workKey || key,
    workKey: workKey,
    editionKey: selectedEdition?.key || null,
    editionKeys: editions.map((edition) => edition.key),
    editions: editions,
    selectedEdition: selectedEdition,
    title: title,
    author: author,
    authorNames: authorNames.length ? authorNames : fallbackBook?.authorNames || [],
    languageCodes: selectedEdition?.language
      ? [selectedEdition.language]
      : fallbackBook?.languageCodes || [],
    hindiTitle: fallbackBook?.hindiTitle || (/godan/i.test(title) || /premchand/i.test(author) ? "गोदान" : ""),
    year: fallbackBook?.year || (yearMatch ? Number(yearMatch[0]) : null),
    coverId: coverId,
    coverUrl: coverId ? `${OPEN_LIBRARY_COVER_URL}${coverId}-M.jpg` : fallbackBook?.coverUrl || null,
    description: description,
    descriptionSource: description ? "Open Library" : "",
    genre: Array.isArray(workRecord?.subjects) && workRecord.subjects.length
      ? workRecord.subjects[0]
      : fallbackBook?.genre || "Book",
    isbn: isbn,
    isbns: isbn ? [isbn] : [],
    infoLink: fallbackBook?.infoLink || null,
    previewLink: fallbackBook?.previewLink || null,
    coverColor: getCoverColor(title),
  };
}

function appendDetailIdentifier(list, label, value) {
  if (!value) return;
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  list.append(term, description);
}

function loadQrLibrary() {
  if (typeof window.QRCode === "function") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = () => {
      if (typeof window.QRCode === "function") resolve();
      else reject(new Error("QR code library did not initialize."));
    };
    script.onerror = () => reject(new Error("QR code library could not be loaded."));
    document.head.appendChild(script);
  });
}

async function renderBookQr(book) {
  const output = document.getElementById("book-qr-code");
  const status = document.getElementById("book-qr-status");
  const downloadButton = document.getElementById("download-book-qr");
  if (!output || !status || !downloadButton) return;

  downloadButton.disabled = true;
  output.hidden = true;
  output.replaceChildren();
  try {
    await loadQrLibrary();
    const detailsUrl = new URL(getBookDetailsUrl(book), window.location.href).href;
    new window.QRCode(output, {
      text: detailsUrl,
      width: 240,
      height: 240,
      colorDark: "#2b2926",
      colorLight: "#fbf7f0",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    const canvas = output.querySelector("canvas");
    if (!canvas) throw new Error("QR canvas was not created.");
    output.hidden = false;
    downloadButton.disabled = false;
    status.textContent = "QR code ready for this book details page.";
    downloadButton.onclick = () => {
      const download = document.createElement("a");
      download.href = canvas.toDataURL("image/png");
      const filename = (book.title || "book").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "book";
      download.download = `${filename}-qr.png`;
      download.hidden = true;
      document.body.appendChild(download);
      download.click();
      download.remove();
    };
  } catch (error) {
    console.error("Could not generate book QR code:", error);
    status.textContent = "QR generation is unavailable. Check the connection and reload this page.";
  }
}

let html5QrcodeLoadPromise = null;
let qrScanner = null;
let qrScannerRunning = false;
let qrScanHandled = false;

function loadHtml5QrcodeLibrary() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (html5QrcodeLoadPromise) return html5QrcodeLoadPromise;
  html5QrcodeLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    script.onload = () => window.Html5Qrcode
      ? resolve()
      : reject(new Error("QR scanner library did not initialize."));
    script.onerror = () => reject(new Error("QR scanner library could not be loaded."));
    document.head.appendChild(script);
  });
  return html5QrcodeLoadPromise;
}

function resolveScannedBook(value) {
  const scanned = String(value || "").trim();
  if (!scanned) return null;

  // Accept a direct Open Library work/edition key or record URL.
  const directKey = getOpenLibraryKey(scanned);
  if (directKey) return directKey;
  if (booksCache.has(scanned) || savedBooksMap.has(scanned)) return scanned;

  let scannedUrl;
  try {
    scannedUrl = new URL(scanned, window.location.href);
  } catch (error) {
    return null;
  }

  // QR codes may have been created on localhost, 127.0.0.1, or another
  // development host. Read only the book identifier from a book.html URL;
  // never navigate to the scanned host itself.
  if (
    !["http:", "https:"].includes(scannedUrl.protocol) ||
    !scannedUrl.pathname.replace(/\/+$/, "").endsWith("/book.html")
  ) {
    return null;
  }

  const identifier = scannedUrl.searchParams.get("id") || scannedUrl.searchParams.get("key");
  if (!identifier) return null;

  const recordKey = getOpenLibraryKey(identifier);
  if (recordKey) return recordKey;
  if (booksCache.has(identifier) || savedBooksMap.has(identifier)) return identifier;
  return null;
}

async function stopQrScanner() {
  if (!qrScanner || !qrScannerRunning) return;
  try {
    await qrScanner.stop();
  } catch (error) {
    console.error("Could not stop QR scanner cleanly:", error);
  }
  qrScannerRunning = false;
  const stopButton = document.getElementById("stop-scanner");
  if (stopButton) stopButton.disabled = true;
}

async function handleScannedQr(value) {
  if (qrScanHandled) return;
  const identifier = resolveScannedBook(value);
  const status = document.getElementById("scanner-status");
  if (!identifier) {
    // Keep scanning after an unrelated QR code instead of getting stuck.
    qrScanHandled = false;
    if (status) status.textContent = "That code is not a recognized book record. Keep scanning or try a Lumen Press book QR code.";
    return;
  }

  qrScanHandled = true;
  if (status) status.textContent = "Book recognized. Opening details…";
  await stopQrScanner();
  window.location.href = getBookDetailsUrl({ id: identifier, key: getOpenLibraryKey(identifier) });
}

async function startQrScanner() {
  const startButton = document.getElementById("start-scanner");
  const stopButton = document.getElementById("stop-scanner");
  const status = document.getElementById("scanner-status");
  if (!startButton || !stopButton || !status) return;

  startButton.disabled = true;
  status.textContent = "Starting camera…";
  qrScanHandled = false;
  try {
    await loadHtml5QrcodeLibrary();
    if (!qrScanner) qrScanner = new window.Html5Qrcode("scanner-view");
    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => handleScannedQr(decodedText),
      () => {}
    );
    qrScannerRunning = true;
    stopButton.disabled = false;
    status.textContent = "Camera scanning is active.";
  } catch (error) {
    console.error("Could not start QR scanner:", error);
    if (error && error.name === "NotAllowedError") {
      status.textContent = "Camera permission was denied. Allow camera access in your browser settings, then try again.";
    } else if (error && error.name === "NotFoundError") {
      status.textContent = "No camera was found. You can still scan by choosing a QR image.";
    } else if (error && error.name === "NotReadableError") {
      status.textContent = "The camera may be in use by another app. Close it and try again, or upload a QR image.";
    } else {
      status.textContent = "Camera scanning could not start. Use HTTPS or localhost, check camera permission, or upload a QR image.";
    }
  } finally {
    startButton.disabled = false;
  }
}

async function scanQrImage(file) {
  const status = document.getElementById("scanner-status");
  if (!file || !status) return;
  if (!file.type.startsWith("image/")) {
    status.textContent = "Choose an image file containing a QR code.";
    return;
  }

  qrScanHandled = false;
  status.textContent = "Reading image…";
  try {
    await stopQrScanner();
    await loadHtml5QrcodeLibrary();
    if (!qrScanner) qrScanner = new window.Html5Qrcode("scanner-view");
    const decoded = await qrScanner.scanFile(file, true);
    await handleScannedQr(decoded);
  } catch (error) {
    console.error("Could not read QR image:", error);
    status.textContent = "No readable QR code was found in that image.";
  }
}

let lastFocusedFinderTrigger = null;

function openFinderModal(bookId) {
  if (!finderModal || !finderBookSummary || !finderLinks) return;

  const book = booksCache.get(bookId) || savedBooksMap.get(bookId);
  if (!book) return;

  lastFocusedFinderTrigger = document.activeElement;

  // Render book summary safely via DOM methods
  finderBookSummary.replaceChildren();

  const titleEl = document.createElement("h3");
  titleEl.textContent = book.title;

  const metaEl = document.createElement("p");
  metaEl.className = "finder-meta";
  metaEl.textContent = `${book.author}${book.year ? ` · First published ${book.year}` : ""}`;

  const infoEl = document.createElement("p");
  infoEl.className = "finder-query-info";

  const badgeEl = document.createElement("span");
  badgeEl.className = "query-badge";

  if (book.isbn) {
    badgeEl.textContent = isValidIsbn(book.isbn) ? "Verified ISBN" : "ISBN from record";
    const codeEl = document.createElement("code");
    codeEl.textContent = book.isbn;
    infoEl.appendChild(badgeEl);
    infoEl.appendChild(codeEl);
  } else {
    badgeEl.textContent = "Title Search";
    const textNode = document.createTextNode("Searching external sites by title & author (no ISBN in record)");
    infoEl.appendChild(badgeEl);
    infoEl.appendChild(textNode);
  }

  finderBookSummary.appendChild(titleEl);
  finderBookSummary.appendChild(metaEl);
  finderBookSummary.appendChild(infoEl);

  // Render external search links safely via DOM methods
  finderLinks.replaceChildren();

  const links = getBookSearchLinks(book);
  links.forEach((linkItem) => {
    const link = document.createElement("a");
    link.className = "finder-link-item";
    link.href = linkItem.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const mainDiv = document.createElement("div");
    mainDiv.className = "finder-link-main";

    const nameSpan = document.createElement("span");
    nameSpan.className = "finder-platform-name";
    nameSpan.textContent = linkItem.platform;

    const detailSpan = document.createElement("span");
    detailSpan.className = "finder-query-detail";
    detailSpan.textContent = `${linkItem.queryLabel} · ${linkItem.badge}`;

    mainDiv.appendChild(nameSpan);
    mainDiv.appendChild(detailSpan);

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "finder-external-arrow";
    arrowSpan.setAttribute("aria-hidden", "true");
    arrowSpan.textContent = "↗";

    link.appendChild(mainDiv);
    link.appendChild(arrowSpan);

    finderLinks.appendChild(link);
  });

  finderModal.hidden = false;
  document.body.classList.add("modal-open");

  if (closeFinderButton) {
    closeFinderButton.focus();
  }
}

function closeFinderModal() {
  if (!finderModal || finderModal.hidden) return;
  finderModal.hidden = true;

  // Remove modal-open from body if loginModal is also closed
  if (!loginModal || loginModal.hidden) {
    document.body.classList.remove("modal-open");
  }

  if (lastFocusedFinderTrigger && typeof lastFocusedFinderTrigger.focus === "function") {
    lastFocusedFinderTrigger.focus();
  }
}

if (closeFinderButton) {
  closeFinderButton.addEventListener("click", closeFinderModal);
}

// Close finder modal when clicking backdrop outside card
if (finderModal) {
  finderModal.addEventListener("click", (event) => {
    if (event.target === finderModal) {
      closeFinderModal();
    }
  });
}

const startScannerButton = document.getElementById("start-scanner");
const stopScannerButton = document.getElementById("stop-scanner");
const qrImageInput = document.getElementById("qr-image");

if (startScannerButton) startScannerButton.addEventListener("click", startQrScanner);
if (stopScannerButton) stopScannerButton.addEventListener("click", stopQrScanner);
if (qrImageInput) {
  qrImageInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) scanQrImage(file);
    event.target.value = "";
  });
}

// Delegated click listener for Find This Book ("Where to Find") buttons
document.addEventListener("click", (event) => {
  const findBtn = event.target.closest("[data-find-book-id]");
  if (!findBtn) return;
  openFinderModal(findBtn.getAttribute("data-find-book-id"));
});

// Close modals when Escape key is pressed
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (finderModal && !finderModal.hidden) {
      closeFinderModal();
    } else if (loginModal && !loginModal.hidden) {
      closeLoginModal();
    }
  }
});

// Check if user navigated to #login via hash
if (window.location.hash === "#login") {
  openLoginModal();
}
window.addEventListener("hashchange", () => {
  if (window.location.hash === "#login") {
    openLoginModal();
  }
});

// Firebase can hydrate this browser's shelf from the signed-in user's Firestore document.
window.addEventListener("lumen:cloud-library-loaded", () => {
  savedIds = loadSavedIds();
  savedBooksMap = loadSavedBooksMap();
  bookStates = loadBookStates();
  loadCachedBooks();
  if (libraryGrid) renderLibrary();
  document.dispatchEvent(new CustomEvent("lumen:library-rendered"));
});

// --- Initialization ---
if (genreFilters) renderGenreFilters();
if (libraryGrid) renderLibrary();
if (popularGrid || discoverGrid || genreGrid) loadHomepageBooks();
if (document.body.dataset.page === "book") loadBookDetails();
