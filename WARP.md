# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Core Commands
- `npm install` - Install dependencies
- `npm run dev` - Start development server (Vite)
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

### TypeScript
- Use `npx tsc --noEmit` to check TypeScript without building

### Development Notes
- No linting or testing framework configured - TypeScript compiler provides type checking
- Environment variables are in `src/.env` (not root-level `.env`)
- Demo mode is enabled by default for development without hardware

## Architecture Overview

This is an **offline-first** RFID Library Manager web application built with React + TypeScript + Vite. The architecture follows these key patterns:

### Data Layer (IndexedDB + Dexie)
- **Primary storage**: IndexedDB via Dexie ORM (`src/lib/db.ts`)
- **Tables**: `students`, `transactions`, `loans`
- **Offline-first**: All operations work without internet
- **Optional sync**: Supabase integration for cloud backup (`src/lib/supabase.ts`)
- **Demo data**: Auto-seeded on startup (`src/lib/demo.ts`)

### Hardware Integration
- **Web Serial API**: Direct communication with RFID reader hardware (`src/lib/serial.ts`)
- **Protocol**: 115200 baud, JSON line-based messages
- **Fallback**: Demo mode works without hardware

### UI Structure
- **Single-page app**: Hash-based routing in `App.tsx`
- **Views**: Dashboard, Borrow, Return, Students, Transactions, Manage Students, Settings
- **State management**: React hooks, no external state library
- **Styling**: Custom CSS with CSS custom properties

### Key Workflows
1. **Borrow flow**: Scan student card → scan item → set duration → confirm
2. **Return flow**: Scan student card → select active loan → mark returned  
3. **Student management**: Add/edit/delete students with card UID association
4. **Transaction logging**: All actions create audit trail entries

## Configuration

### Environment Variables (src/.env)
- `VITE_SUPABASE_URL` - Optional Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Optional Supabase anon key  
- `VITE_ADMIN_USER` - Admin username (default: admin)
- `VITE_ADMIN_PASS` - Admin password (default: admin)
- **Note**: Environment file is located in `src/.env`, not root `.env`

### Hardware Requirements
- Chromium-based browser for Web Serial API
- ESP32-based RFID reader (optional - demo mode available)

## Code Guidelines

### File Organization
- `/src/App.tsx` - Main application component with hash-based routing
- `/src/main.tsx` - Application entry point
- `/src/lib/db.ts` - Database schema and operations (Dexie ORM)
- `/src/lib/serial.ts` - Hardware communication via Web Serial API
- `/src/lib/supabase.ts` - Cloud sync functionality
- `/src/lib/demo.ts` - Demo data seeding
- `/src/styles.css` - All styling (no CSS modules)
- `/src/.env` - Environment variables (note: not in project root)

### Data Flow
- All database operations go through Dexie
- State updates trigger UI re-renders
- Hardware events flow through serial event handlers
- Sync operations are background processes

### Authentication
- Simple client-side admin authentication
- No user sessions - single admin mode
- Credentials configurable via environment variables

## Development Notes

### Database Schema
The app uses a 3-table structure with versioned migrations (Dexie v1 → v2):
- **students**: User profiles with card UIDs (`++id, index_number, card_uid, created_at`)
- **loans**: Active/returned item borrowings (`id, status, due_at, student_index, user_uid, item_tag`)
- **transactions**: Immutable audit log (`id, synced, occurred_at, action`)
- **Migration**: v2 added `loans` table and `action` index to transactions

### Offline Capabilities
- Full CRUD operations work offline
- Data persists in browser storage
- Background sync when online
- Export/import for data portability

### Hardware Protocol
RFID reader firmware should send via 115200 baud serial:
```
CARD_SCANNED:E0A1B2C3
STATUS|SMS:ON|Students:5|ActiveBorrows:3|QueuePending:0|Auto:OFF|IntervalMin:0
SCAN_ARMED
SCAN_DONE
```

**Serial Events Parsed**:
- `CARD_SCANNED:` → `{event: 'card', uid: 'E0A1B2C3'}`
- `STATUS|` → `{event: 'status', data: {...}}`
- `SCAN_ARMED/SCAN_DONE` → `{event: 'scan', state: 'armed'|'done'}`

### Demo Mode
The app auto-seeds with sample data including:
- 3 students (Alice, Bob, Charlie)
- Active loans (including overdue items)
- Transaction history

This ensures the app is immediately usable for demonstration without manual setup.