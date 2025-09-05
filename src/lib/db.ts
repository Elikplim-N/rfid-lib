import Dexie, { Table } from 'dexie'
// @ts-expect-error types are optional; tiny helper for backup/restore
import { exportDB, importInto } from 'dexie-export-import'

export interface Tx {
  id: string
  user_uid: string | null
  student_index: string | null
  item_tag: string
  action: 'BORROW' | 'RETURN'
  occurred_at: string
  device_id: string
  synced?: number
}

export interface Student {
  id?: number
  index_number: string
  full_name: string
  program?: string | null
  level?: string | null
  phone?: string | null
  card_uid?: string | null
  created_at?: string
}

export interface Loan {
  id: string
  student_index: string | null
  user_uid: string | null
  item_tag: string
  item_title: string | null
  borrowed_at: string
  due_at: string
  returned_at: string | null
  status: 'ACTIVE' | 'RETURNED'
  device_id: string
  synced?: number
}

class DB extends Dexie {
  transactions!: Table<Tx, string>
  students!: Table<Student, number>
  loans!: Table<Loan, string>

  constructor() {
    // ⚠️ keep DB name stable to preserve data across refreshes
    super('library_web')

    // v1 (initial)
    this.version(1).stores({
      transactions: 'id, synced, occurred_at',
      students: '++id, index_number, card_uid, created_at'
    })

    // v2 (adds loans + index on action)
    this.version(2).stores({
      transactions: 'id, synced, occurred_at, action',
      students: '++id, index_number, card_uid, created_at',
      loans: 'id, status, due_at, student_index, user_uid, item_tag'
    })
  }
}

export const db = new DB()

// ---- Persistence helpers ----

// Call once at startup. Requests “persistent storage” so the browser won’t evict IndexedDB.
export async function ensurePersistence(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      // If already persisted, this returns true; otherwise request it.
      const persisted = await navigator.storage.persisted?.()
      if (persisted) return true
      return await navigator.storage.persist()
    } catch {
      return false
    }
  }
  return false
}

// Optional: explicit open (helps in Safari/Edge quirks on first load)
export async function openDB() {
  if (db.isOpen()) return
  await db.open()
}

// ---- Quick stats (unchanged) ----
export async function stats() {
  const total = await db.transactions.count()
  const todayStr = new Date().toISOString().slice(0, 10)
  const today = await db.transactions.where('occurred_at').between(todayStr, todayStr + '\uFFFF').count()
  const unsynced = await db.transactions.where('synced').notEqual(1).count()
  const borrowed = await db.transactions.where('action').equals('BORROW').count()
  const returned = await db.transactions.where('action').equals('RETURN').count()
  return { total, today, unsynced, borrowed, returned }
}

// ---- Queries (unchanged) ----
export async function activeLoansForStudent(indexOrUid: { index_number?: string; card_uid?: string }) {
  let idx: string | null = null
  if (indexOrUid.index_number) {
    idx = indexOrUid.index_number
  } else if (indexOrUid.card_uid) {
    const stu = await db.students.where('card_uid').equals(indexOrUid.card_uid).first()
    idx = stu?.index_number ?? null
  }
  if (!idx) return []
  return db.loans.where({ status: 'ACTIVE' as const }).filter(l => l.student_index === idx).toArray()
}

export async function countActiveLoans(index_number: string) {
  return db.loans.where({ status: 'ACTIVE' as const }).filter(l => l.student_index === index_number).count()
}

export function addDays(dateIso: string, days: number) {
  const d = new Date(dateIso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// ---- Backup / Restore ----
export async function exportJsonBlob(): Promise<Blob> {
  // includes all tables + schema
  return exportDB(db)
}

export async function importFromJson(file: File): Promise<void> {
  // merge into current DB (without dropping)
  await importInto(db, file, { overwriteValues: true })
}
