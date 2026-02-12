# Familia Bendecida App v2.0

This application has been upgraded to a modern, robust architecture.

## Improvements

### 1. Backend Modernization (Async/Await)
- Converted all Database operations from "Callback Hell" to modern **Async/Await** promises.
- Improved error handling across all routes.
- Created a `database.js` wrapper that simplifies SQL execution.

### 2. Real-Time Syncing (Socket.io)
- **Instant Updates:** When any user adds a Task or Item to the Shopping List, it now instantly appears on everyone else's screen without reloading.
- Events handled: `tasksUpdated`, `shoppingUpdated`, `userUpdated`, `activityUpdated`.

### 3. Code Quality
- Refactored `server.js` to properly inject dependencies.
- Fixed a bug where the Dashboard would crash due to a missing `renderActivities` function.
- Modularized the API routes.

## How to Run

1.  Make sure Node.js is installed.
2.  Install dependencies (if not already):
    ```bash
    npm install
    ```
3.  Start the server:
    ```bash
    npm start
    ```
4.  Open `http://localhost:3000` in your browser.

## Tech Stack
- **Backend:** Node.js, Express, SQLite3 (Async Wrapper), Socket.io
- **Frontend:** Vanilla JS (SPA-like), CSS3, FontAwesome
