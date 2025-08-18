import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supa = (url && key) ? createClient(url, key) : null

export async function upsertTransactions(rows: any[]): Promise<{ok:boolean; error?:string}>{
  if(!supa) return { ok:false, error:'Supabase not configured' }
  try{
    const { error } = await supa.from('transactions').upsert(rows, { onConflict: 'id' })
    if(error) return { ok:false, error:error.message }
    return { ok:true }
  }catch(e:any){
    return { ok:false, error:String(e) }
  }
}
