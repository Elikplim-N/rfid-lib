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

### Environment Variables (.env)
- `VITE_SUPABASE_URL` - Optional Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Optional Supabase anon key  
- `VITE_ADMIN_USER` - Admin username (default: admin)
- `VITE_ADMIN_PASS` - Admin password (default: admin)

### Hardware Requirements
- Chromium-based browser for Web Serial API
- ESP32-based RFID reader (optional - demo mode available)

## Code Guidelines

### File Organization
- `/src/App.tsx` - Main application component and routing
- `/src/lib/db.ts` - Database schema and operations
- `/src/lib/serial.ts` - Hardware communication
- `/src/lib/supabase.ts` - Cloud sync functionality
- `/src/lib/demo.ts` - Demo data seeding
- `/src/styles.css` - All styling (no CSS modules)

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
The app uses a 3-table structure with versioned migrations:
- **students**: User profiles with card UIDs
- **loans**: Active/returned item borrowings  
- **transactions**: Immutable audit log

### Offline Capabilities
- Full CRUD operations work offline
- Data persists in browser storage
- Background sync when online
- Export/import for data portability

### Hardware Protocol
RFID reader firmware should send:
```
CARD_SCANNED:E0A1B2C3
STATUS|SMS:ON|Students:5|ActiveBorrows:3|...
```

### Demo Mode
The app auto-seeds with sample data including:
- 3 students (Alice, Bob, Charlie)
- Active loans (including overdue items)
- Transaction history

This ensures the app is immediately usable for demonstration without manual setup.