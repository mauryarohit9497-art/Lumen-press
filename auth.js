(() => {
  const config = window.LUMEN_FIREBASE_CONFIG || {};
  const authNav = document.querySelector("[data-auth-nav]");
  const configMessage = "Firebase is not configured. Check firebase-config.js and reload this page.";
  let auth = null;
  let db = null;
  let resetCode = new URLSearchParams(window.location.search).get("oobCode");
  let resetCodeValid = false;
  let currentUid = null;
  let syncTimer = null;
  let syncingFromCloud = false;

  const STORAGE_KEYS = ["lumen-library-ids", "lumen-saved-books-data", "lumen-book-states-v1"];
  const OWNER_KEY = "lumen-library-owner-uid";

  function setMessage(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", isError);
    element.classList.toggle("is-success", Boolean(message) && !isError);
  }

  function setFormBusy(form, busy, label) {
    const button = form.querySelector("button[type='submit']");
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = label;
      form.setAttribute("aria-busy", "true");
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalLabel || button.textContent;
      form.removeAttribute("aria-busy");
    }
  }

  function makeLink(label, href, className = "") {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    if (className) link.className = className;
    return link;
  }

  async function updateAdminNavigation(user) {
    const links = document.querySelectorAll("[data-admin-nav]");
    links.forEach((link) => { link.hidden = true; });
    if (!user || !db) return;
    try {
      const adminDoc = await db.collection("admins").doc(user.uid).get();
      if (adminDoc.exists && adminDoc.data().role === "admin") {
        links.forEach((link) => { link.hidden = false; });
      }
    } catch (error) {
      // Fail closed: admin navigation stays hidden if the role cannot be verified.
      console.warn("Could not verify Lumen Press admin access:", error);
    }
  }

  function renderAuthNav(user = null) {
    if (!authNav) return;
    authNav.replaceChildren();
    if (user) {
      const identity = document.createElement("span");
      identity.className = "auth-user-label";
      identity.textContent = user.displayName || user.email || "Signed in";
      identity.setAttribute("aria-label", `Signed in as ${identity.textContent}`);
      const logout = document.createElement("button");
      logout.type = "button";
      logout.className = "nav-login";
      logout.dataset.authAction = "sign-out";
      logout.textContent = "Log out";
      authNav.append(identity, logout);
    } else {
      authNav.append(makeLink("Login", "login.html", "nav-login"), makeLink("Sign up", "signup.html", "auth-signup-link"));
    }
  }

  function getInternalReturnPath() {
    const requested = new URLSearchParams(window.location.search).get("next");
    if (!requested) return "index.html";
    try {
      const url = new URL(requested, window.location.origin);
      const allowedPages = ["index.html", "catalog.html", "book.html", "my-library.html", "scanner.html", "about.html"];
      const page = url.pathname.split("/").pop();
      return url.origin === window.location.origin && allowedPages.includes(page) ? `${page}${url.search}${url.hash}` : "index.html";
    } catch (_) { return "index.html"; }
  }

  function initPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      const input = document.getElementById(button.getAttribute("aria-controls"));
      if (!input) return;
      button.addEventListener("click", () => {
        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        button.textContent = reveal ? "Hide" : "Show";
        button.setAttribute("aria-label", `${reveal ? "Hide" : "Show"} ${input.name}`);
        button.setAttribute("aria-pressed", String(reveal));
      });
    });
  }

  function readLocalLibrary() {
    const read = (key, fallback) => {
      try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
      catch (_) { return fallback; }
    };
    return {
      savedIds: read(STORAGE_KEYS[0], []),
      savedBooks: read(STORAGE_KEYS[1], []),
      bookStates: read(STORAGE_KEYS[2], {})
    };
  }

  function writeLocalLibrary(data) {
    localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(Array.isArray(data.savedIds) ? data.savedIds : []));
    localStorage.setItem(STORAGE_KEYS[1], JSON.stringify(Array.isArray(data.savedBooks) ? data.savedBooks : []));
    localStorage.setItem(STORAGE_KEYS[2], JSON.stringify(data.bookStates && typeof data.bookStates === "object" ? data.bookStates : {}));
    window.dispatchEvent(new CustomEvent("lumen:cloud-library-loaded"));
  }

  function clearLocalLibrary() {
    STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(OWNER_KEY);
    window.dispatchEvent(new CustomEvent("lumen:cloud-library-loaded"));
  }

  function showAuthError(message) {
    document.querySelectorAll("[data-auth-status]").forEach((element) => {
      element.textContent = message;
      element.classList.add("is-error");
    });
  }

  async function syncLibraryFromCloud(user) {
    if (!db || !user) return;
    const owner = localStorage.getItem(OWNER_KEY);
    // Do not show another account's cached shelf to this user.
    if (owner && owner !== user.uid) clearLocalLibrary();
    const ref = db.collection("users").doc(user.uid).collection("library").doc("data");
    syncingFromCloud = true;
    try {
      const snapshot = await ref.get();
      if (snapshot.exists) {
        writeLocalLibrary(snapshot.data());
      } else {
        // First login: preserve this browser's existing shelf by uploading it once.
        await ref.set({ ...readLocalLibrary(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      localStorage.setItem(OWNER_KEY, user.uid);
    } finally {
      syncingFromCloud = false;
    }
  }

  async function saveLibraryToCloud() {
    if (!db || !currentUid || syncingFromCloud) return;
    try {
      await db.collection("users").doc(currentUid).collection("library").doc("data").set({
        ...readLocalLibrary(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Could not sync Lumen Press library to Firestore:", error);
      const status = document.querySelector("[data-auth-status]");
      if (status) setMessage(status.id, "Your shelf changed on this device, but cloud sync failed. Check your connection and Firestore rules.", true);
    }
  }

  window.addEventListener("lumen:library-changed", () => {
    if (!currentUid || syncingFromCloud) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(saveLibraryToCloud, 500);
  });

  function initLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      if (!auth) return setMessage("login-status", configMessage, true);
      setMessage("login-status", ""); setFormBusy(form, true, "Signing in…");
      try {
        await auth.signInWithEmailAndPassword(email, password);
        setMessage("login-status", "Signed in successfully.");
        window.location.assign(getInternalReturnPath());
      } catch (error) {
        setMessage("login-status", friendlyAuthError(error), true);
      } finally { setFormBusy(form, false); }
    });
  }

  function initSignupForm() {
    const form = document.getElementById("signup-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const displayName = form.elements.displayName.value.trim();
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      const confirmPassword = form.elements.confirmPassword.value;
      if (!auth) return setMessage("signup-status", configMessage, true);
      if (!displayName || !email || !password || !confirmPassword) return setMessage("signup-status", "Complete every field to create your account.", true);
      if (password.length < 8) return setMessage("signup-status", "Use a password with at least 8 characters.", true);
      if (password !== confirmPassword) return setMessage("signup-status", "The passwords do not match.", true);
      setMessage("signup-status", ""); setFormBusy(form, true, "Creating account…");
      try {
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        await credential.user.updateProfile({ displayName });
        await db.collection("users").doc(credential.user.uid).set({ displayName, email, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        form.reset();
        setMessage("signup-status", "Your account is ready. You are now signed in.");
        window.setTimeout(() => window.location.assign("index.html"), 900);
      } catch (error) {
        setMessage("signup-status", friendlyAuthError(error), true);
      } finally { setFormBusy(form, false); }
    });
  }

  function initForgotPasswordForm() {
    const form = document.getElementById("forgot-password-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = form.elements.email.value.trim();
      if (!auth) return setMessage("forgot-password-status", configMessage, true);
      setMessage("forgot-password-status", ""); setFormBusy(form, true, "Sending…");
      try {
        const actionCodeSettings = { url: new URL("reset-password.html", window.location.href).href, handleCodeInApp: false };
        await auth.sendPasswordResetEmail(email, actionCodeSettings);
        form.reset();
        setMessage("forgot-password-status", "Password reset email sent. Open the link in your email to reset your password.");
      } catch (error) {
        setMessage("forgot-password-status", friendlyAuthError(error), true);
      } finally { setFormBusy(form, false); }
    });
  }

  async function initResetPasswordForm() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;
    const submit = form.querySelector("button[type='submit']");
    if (submit) submit.disabled = true;
    if (!auth) return setMessage("reset-password-status", configMessage, true);
    if (!resetCode) {
      setMessage("reset-password-status", "If Firebase opens its hosted reset page, finish the reset there. To use this form, set the Firebase password-reset email action URL to this page.");
      return;
    }
    try {
      await auth.verifyPasswordResetCode(resetCode);
      resetCodeValid = true;
      if (submit) submit.disabled = false;
      setMessage("reset-password-status", "Choose a new password for your account.");
    } catch (error) {
      setMessage("reset-password-status", "This password reset link is invalid or expired. Request a new one.", true);
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = form.elements.password.value;
      const confirmPassword = form.elements.confirmPassword.value;
      if (!resetCodeValid) return setMessage("reset-password-status", "Open a valid password reset link from your email first.", true);
      if (password.length < 8) return setMessage("reset-password-status", "Use a password with at least 8 characters.", true);
      if (password !== confirmPassword) return setMessage("reset-password-status", "The passwords do not match.", true);
      setMessage("reset-password-status", ""); setFormBusy(form, true, "Updating password…");
      try {
        await auth.confirmPasswordReset(resetCode, password);
        resetCodeValid = false; form.reset();
        setMessage("reset-password-status", "Password updated. You can now sign in with the new password.");
      } catch (error) {
        setMessage("reset-password-status", friendlyAuthError(error), true);
      } finally { setFormBusy(form, false); if (submit && !resetCodeValid) submit.disabled = true; }
    });
  }

  function friendlyAuthError(error) {
    const code = error && error.code;
    const messages = {
      "auth/invalid-email": "Enter a valid email address.",
      "auth/user-not-found": "No account was found for that email.",
      "auth/wrong-password": "Email or password is incorrect.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/email-already-in-use": "An account already exists for this email. Try signing in.",
      "auth/weak-password": "Choose a stronger password with at least 8 characters.",
      "auth/too-many-requests": "Too many attempts. Wait a while and try again.",
      "auth/network-request-failed": "Network error. Check your internet connection and try again.",
      "auth/operation-not-allowed": "Email/password sign-in is disabled in Firebase Authentication settings."
    };
    return messages[code] || (error && error.message) || "Something went wrong. Please try again.";
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest('[data-auth-action="sign-out"]');
    if (!button || !auth) return;
    button.disabled = true; button.textContent = "Signing out…";
    try { await auth.signOut(); window.location.assign("index.html"); }
    catch (error) { button.disabled = false; button.textContent = "Log out"; showAuthError(friendlyAuthError(error)); }
  });

  async function initAuth() {
    initPasswordToggles(); initLoginForm(); initSignupForm(); initForgotPasswordForm();
    renderAuthNav();
    if (!config.apiKey || !config.projectId) { showAuthError(configMessage); return; }
    if (!window.firebase || !firebase.initializeApp) { showAuthError("Firebase SDK could not load. Check your internet connection and reload."); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(config);
      auth = firebase.auth(); db = firebase.firestore();
      await initResetPasswordForm();
      auth.onAuthStateChanged(async (user) => {
        renderAuthNav(user || null);
        await updateAdminNavigation(user || null);
        currentUid = user ? user.uid : null;
        if (user) {
          try { await syncLibraryFromCloud(user); }
          catch (error) {
            console.error("Could not load library from Firestore:", error);
            showAuthError("Signed in, but your cloud library could not load. Check your Firestore rules and connection.");
          }
        } else {
          // Clear cached personal data on sign-out so it is not shown to the next visitor.
          if (localStorage.getItem(OWNER_KEY)) clearLocalLibrary();
        }
      });
    } catch (error) {
      showAuthError(friendlyAuthError(error));
    }
  }
  initAuth();
})();
