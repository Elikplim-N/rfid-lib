import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Tx } from './db' // Adjust the import path based on your project structure

// Type guard to check if Supabase is configured
const isSupabaseConfigured = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return !!url && !!key
}

// Initialize Supabase client lazily
let supa: SupabaseClient | null = null

if (isSupabaseConfigured()) {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  supa = createClient(url, key)
} else {
  console.error('Supabase not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const getSupabase = (): SupabaseClient | null => supa

export async function upsertTransactions(rows: Tx[]): Promise<{ ok: boolean; error?: string; data?: any[] }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, error: 'Supabase not configured' }
  }

  try {
    const { data, error } = await supabase
      .from('transactions')
      .upsert(rows, { onConflict: 'id' })
      .select() // Include select to return the upserted data
    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: `Upsert failed: ${e.message}` }
  }
}