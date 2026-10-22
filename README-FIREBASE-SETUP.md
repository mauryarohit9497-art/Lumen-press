# Lumen Press — Firebase setup

The site now uses Firebase Authentication (email/password) and Cloud Firestore for each signed-in user's saved books, favorites, reading status, and progress. Open Library search and QR scanner features remain in the existing frontend.

## Before testing

1. In Firebase Console, open **Authentication → Sign-in method** and enable **Email/Password**.
2. In **Authentication → Settings → Authorized domains**, make sure the domain you use to test the site is listed. For local testing, use `localhost` and serve the files through a local web server (for example, VS Code Live Server); do not open the HTML files as `file://` URLs.
3. In **Firestore Database → Rules**, use rules that limit each signed-in user to their own UID path. For the current app, these rules match its `/users/{uid}/library/data` and `/users/{uid}` profile documents:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

These rules enforce user ownership, but they do not validate every field or data size. For a production app, add field validation and consider splitting the library into individual book documents.

## Password reset page

The app sends password-reset emails with `reset-password.html` as the continue URL. Firebase's default email action handler may process the reset on Google's hosted page first. If you want the in-site form to process `oobCode` directly, configure the password-reset email template to use your site's reset handler/action URL and add the site's domain under Authorized domains. Test this with a real reset email before relying on it.

## Data behavior

- Signed-in library data is stored at `users/{uid}/library/data`.
- The site keeps a local cache for responsiveness and writes changes to Firestore after a short debounce.
- On first sign-in, existing local shelf data is uploaded if that account has no cloud library yet.
- On sign-out, cached personal shelf data is cleared from the browser so it is not shown to the next visitor. The cloud copy remains in Firestore.
- `firebase-config.js` contains normal browser/client configuration. Never add service-account JSON, private keys, or admin credentials to this frontend.

## Run locally

Open the project folder in VS Code, start Live Server from `index.html`, then test sign-up, log out, sign in, save a book, reload the page, and verify that the shelf is still there. Also test a second account to confirm users cannot see one another's library.


## QR scanner troubleshooting

- Run the project through VS Code Live Server (`http://localhost:...`) or a deployed HTTPS site. Camera access normally will not work from a `file://` URL.
- Allow camera access in the browser. If camera access fails, use **Choose a QR image** to test scanning from a saved PNG.
- The scanner now extracts a book identifier from a `book.html` QR URL even when the QR was generated on a different local development host (for example, `localhost` vs `127.0.0.1`). It opens the matching book on the currently open site instead of navigating to the scanned host.
- An unrelated QR code no longer permanently blocks later scans; the scanner remains available for the next code.
- QR codes generated while testing locally contain a local development URL. A phone's regular camera cannot open your Mac's `localhost` URL. Deploy the site to an HTTPS host before printing or sharing QR codes outside your computer.
- QR generation and camera scanning load their JavaScript libraries from CDNs, so an internet connection is needed for those features.


## Add Book with the free Firebase setup (no Storage or billing)

The Add Book page saves book metadata, a cover image URL, and an external reading link in Cloud Firestore. It does **not** upload image or ebook files, use Firebase Storage, or require a Storage bucket. The linked cover and reading page remain hosted by their original websites, so use stable image URLs and legal public reading sources.

### 1. Firestore rules and security tests

The matching `firestore.rules` file is included in this project. Back up the current rules in Firebase Console before publishing. Then open **Firestore Database → Rules**, replace the rules with the contents of `firestore.rules`, and click **Publish**. These rules keep user data private, allow public reads of catalog books, and restrict book writes to accounts with an admin record. Admin records must be provisioned manually in the Firebase Console; the browser cannot create or change them.

The rules validate required fields and HTTP/HTTPS URLs for new books. If you later change the fields written by `add-book.js`, update the rules and test them before deploying.

#### Test the rules in Firebase Console

Use **Firestore Database → Rules → Rules Playground** if available, or the Firebase Emulator Suite for repeatable tests. Use test UIDs and do not test destructive operations against real user data.

| Test | Expected result |
|---|---|
| Signed-out visitor reads `/books/{bookId}` | Allow |
| Signed-out visitor creates, edits, or deletes `/books/{bookId}` | Deny |
| Signed-in non-admin reads catalog books | Allow |
| Signed-in non-admin creates, edits, or deletes a book | Deny |
| Admin (UID has `/admins/{uid}` with `role: 'admin'`) creates a valid book with `createdBy` equal to their UID | Allow |
| Admin creates a book with missing title/author or an invalid cover/read URL | Deny |
| User reads `/admins/{theirUid}` | Allow |
| User reads another user's `/admins/{otherUid}` | Deny |
| User reads/writes `/users/{theirUid}/...` | Allow |
| User reads/writes `/users/{otherUid}/...` | Deny |
| Client attempts to create/update/delete an admin record | Deny |

After publishing, repeat the key checks in the actual website: test Add Book as the admin, then sign in with a separate non-admin account and confirm it cannot add or modify catalog books. A hidden button is not a security control; Firestore rules must deny the write too.

### 2. Grant your account admin access

1. Sign in to Lumen Press once so your account exists in **Authentication → Users**.
2. Copy your user's **UID**.
3. In **Firestore Database → Data**, create collection `admins`, document ID exactly equal to that UID, and field `role` (string) = `admin`.
4. Publish the Firestore rules above, then reload the website while signed in. The **Add Book** navigation item should appear.

### 3. Add a book

1. Open `add-book.html` while signed in as the admin.
2. Enter the title, author, genre, and any optional details.
3. Paste a direct cover image URL (for example, from a trusted book catalog) and a legal online reading link. Both should begin with `https://` where possible.
4. Confirm you have permission to share the links, then choose **Add book to catalog**.
5. Open `catalog.html` and check **The Lumen Press shelf**. Select a book to open its details and follow its reading link. A direct PDF link may preview in the page if its host permits embedding; other sources open in a new tab.

### What this free version does and does not do

- Book metadata is stored in Cloud Firestore.
- Cover images load from the URL you provide; Lumen Press does not store a copy of the image.
- Reading links open the original source. Lumen Press does not store or upload PDF/EPUB files.
- Firebase Storage is not used by this version, so you do not need to enable Storage or upgrade billing for the Add Book feature.
- Only use cover and reading links from sources you are allowed to share. Admin-only controls are enforced by Firestore rules, not just by hiding the form.
