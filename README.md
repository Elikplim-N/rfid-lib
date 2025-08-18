# RFID Library Manager (Web)
Blue/Orange, sleek web UI with **offline-first** Dexie (IndexedDB), optional Supabase sync, and **Web Serial** for direct reader input. Demo mode works without hardware.

## Quick start
```bash
npm i
npm run dev
```
Open the URL Vite prints.

## Optional: Supabase
Create a `.env` file in project root:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
Create a `transactions` table with columns:
- id (uuid/text, PK)
- user_uid (text)
- student_index (text)
- item_tag (text)
- action (text: BORROW/RETURN)
- occurred_at (timestamptz)
- device_id (text)
- synced (int, optional)

## Reader input
Click **Connect Reader** (Chromium-based browsers) to choose the serial port. The firmware should stream JSON lines like:
```json
{"event":"card","uid":"ABC123"}
{"event":"item","tag":"BOOK-42"}
```
No device yet? Leave **Demo: ON** and the app will simulate scans.

## Packaging
This is a Vite + React + TS app. Build with:
```
npm run build
npm run preview
```
