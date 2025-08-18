import React, { useEffect, useMemo, useRef, useState } from 'react'
import { stats, db, Tx, Student, Loan, addDays, activeLoansForStudent, countActiveLoans } from './lib/db'
import { requestPort, readJsonLines } from './lib/serial'
import { upsertTransactions } from './lib/supabase'

const BLUE = '#166FE5'
const ORANGE = '#FF7A00'

// ---- Admin auth (simple, client-side)
const ADMIN_USER = (import.meta.env.VITE_ADMIN_USER as string) || 'admin'
const ADMIN_PASS = (import.meta.env.VITE_ADMIN_PASS as string) || 'admin'

function useRoute() {
  const [route, setRoute] = useState<string>(location.hash || '#dashboard')
  useEffect(() => {
    const fn = () => setRoute(location.hash || '#dashboard')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return [route, (r: string) => (location.hash = r)] as const
}

function useBadges(){
  const [b, setB] = useState({total:0, today:0, unsynced:0})
  const refresh = async()=>{
    const s = await stats()
    setB({ total:s.total, today:s.today, unsynced:s.unsynced })
  }
  useEffect(()=>{ refresh() }, [])
  return { ...b, refresh }
}

function Card({title, value, color}:{title:string; value:React.ReactNode; color:string}){
  return <div className="card">
    <div className="stripe" style={{background:color}}/>
    <div style={{color:'#64748B', fontSize:13}}>{title}</div>
    <div style={{fontWeight:800, fontSize:24}}>{value}</div>
  </div>
}

export default function App(){
  // Simple auth
  const [authed, setAuthed] = useState<boolean>(() => localStorage.getItem('authed') === '1')
  const [u, setU] = useState(''); const [p, setP] = useState('')

  // App state
  const [route, setRoute] = useRoute()
  const [log, setLog] = useState<string>('')
  const logBoxRef = useRef<HTMLDivElement>(null)
  const [connected, setConnected] = useState(false)           // real/serial port
  const [manualConnected, setManualConnected] = useState(false) // manual admin toggle
  const [autosync, setAutosync] = useState(true)

  // Borrow/Return inputs
  const borrowCardRef = useRef<HTMLInputElement>(null)
  const borrowIndexRef = useRef<HTMLInputElement>(null)
  const borrowItemTagRef = useRef<HTMLInputElement>(null)
  const borrowItemTitleRef = useRef<HTMLInputElement>(null)
  const borrowDaysRef = useRef<HTMLInputElement>(null)

  const returnCardRef = useRef<HTMLInputElement>(null)
  const returnIndexRef = useRef<HTMLInputElement>(null)

  const { total, today, unsynced, refresh } = useBadges()
  const [students, setStudents] = useState<Student[]>([])
  const [stQuery, setStQuery] = useState('')
  const [tx, setTx] = useState<Tx[]>([])
  const [txQuery, setTxQuery] = useState('')
  const [loans, setLoans] = useState<Loan[]>([])
  const [alerts, setAlerts] = useState<Loan[]>([])

  useEffect(()=>{
    if(!authed) return
    (async()=>{
      setStudents(await db.students.orderBy('created_at').reverse().toArray())
      setTx(await db.transactions.orderBy('occurred_at').reverse().limit(500).toArray())
      refreshAlerts()
    })()
  }, [authed])

  // Autosync
  useEffect(()=>{
    if(!authed) return
    if(!autosync) return
    const iv = setInterval(()=> trySync(true), 10000)
    return ()=> clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosync, authed])

  function append(s:string){
    setLog(l => l + `[${new Date().toLocaleTimeString()}] ${s}\n`)
    // scroll to bottom
    setTimeout(()=>{
      const el = logBoxRef.current
      if(el) el.scrollTop = el.scrollHeight
    }, 0)
  }

  // Serial → route-aware inputs
  function handleEvent(data:any){
    const evt = data?.event
    if(evt === 'card'){
      if (route === '#borrow' && borrowCardRef.current) {
        borrowCardRef.current.value = data.uid
        append(`[CARD→Borrow] ${data.uid}`)
      } else if (route === '#return' && returnCardRef.current) {
        returnCardRef.current.value = data.uid
        append(`[CARD→Return] ${data.uid}`)
        loadLoansForReturn()
      } else {
        append(`[CARD] ${data.uid}`)
      }
    } else if(evt === 'item'){
      if (route === '#borrow' && borrowItemTagRef.current) {
        borrowItemTagRef.current.value = data.tag
        append(`[ITEM→Borrow] ${data.tag}`)
      } else {
        append(`[ITEM] ${data.tag}`)
      }
    }
  }

  async function connectSerial(){
    const port = await requestPort()
    if(!port){ append('Serial not available or cancelled.'); return }
    setConnected(true)
    append('Connected to reader.')
    readJsonLines(port, handleEvent, ()=>{
      append('Port closed.')
      setConnected(false)
    })
  }

  async function trySync(background:boolean){
    const uns = await db.transactions.where('synced').notEqual(1).toArray()
    if(uns.length === 0){
      if(!background) append('No unsynced transactions.')
      return
    }
    const ok = await fetch((import.meta.env.VITE_SUPABASE_URL||'') + '/status').then(r=>r.ok).catch(()=>false)
    if(!ok){ if(!background) append('Offline.'); return }
    const { ok:ok2, error } = await upsertTransactions(uns)
    if(ok2){
      await db.transactions.bulkPut(uns.map(r=>({...r, synced:1})))
      append(`Synced ${uns.length} transactions.`)
      refresh()
    }else{
      append(`Sync failed: ${error}`)
    }
  }

  // ===== Borrow flow =====
  async function submitBorrow(){
    const card_uid = borrowCardRef.current!.value.trim() || null
    const index_number = borrowIndexRef.current!.value.trim() || null
    const item_tag = borrowItemTagRef.current!.value.trim()
    const item_title = borrowItemTitleRef.current!.value.trim() || null
    const days = Math.max(1, parseInt(borrowDaysRef.current!.value || '14', 10))

    if(!item_tag){
      alert('Enter item tag (or scan item).'); return
    }
    if(!card_uid && !index_number){
      alert('Scan/enter a card UID or provide a student index.'); return
    }

    let stu: Student | undefined
    if(index_number){
      stu = await db.students.where('index_number').equals(index_number).first()
    } else if(card_uid){
      stu = await db.students.where('card_uid').equals(card_uid).first()
    }
    if(!stu){ alert('Student not found. Register the student first.'); return }

    const activeCnt = await countActiveLoans(stu.index_number)
    if(activeCnt >= 3){ alert(`Loan limit reached. ${stu.full_name} already has ${activeCnt} active loan(s).`); return }

    const now = new Date().toISOString()
    const loan: Loan = {
      id: crypto.randomUUID(),
      student_index: stu.index_number,
      user_uid: card_uid,
      item_tag,
      item_title,
      borrowed_at: now,
      due_at: addDays(now, days),
      returned_at: null,
      status: 'ACTIVE',
      device_id: 'web-kiosk',
      synced: 0
    }
    await db.loans.add(loan)

    const tx: Tx = {
      id: crypto.randomUUID(),
      user_uid: card_uid,
      student_index: stu.index_number,
      item_tag,
      action: 'BORROW',
      occurred_at: now,
      device_id: 'web-kiosk',
      synced: 0
    }
    await db.transactions.add(tx)
    setTx(v => [tx, ...v])
    refresh(); refreshAlerts()
    append(`[BORROW] ${stu.index_number} -> ${item_tag} (due ${loan.due_at.slice(0,10)})`)
    borrowItemTagRef.current!.value = ''; borrowItemTitleRef.current!.value = ''
  }

  // ===== Return flow =====
  async function loadLoansForReturn(){
    const idx = returnIndexRef.current!.value.trim()
    const uid = returnCardRef.current!.value.trim()
    const list = await activeLoansForStudent({ index_number: idx || undefined, card_uid: uid || undefined })
    setLoans(list.sort((a,b)=> a.due_at.localeCompare(b.due_at)))
  }

  async function markReturned(loan: Loan){
    if(!loan || loan.status !== 'ACTIVE') return
    const now = new Date().toISOString()
    const updated: Loan = { ...loan, status: 'RETURNED', returned_at: now }
    await db.loans.put(updated)

    const tx: Tx = {
      id: crypto.randomUUID(),
      user_uid: loan.user_uid,
      student_index: loan.student_index,
      item_tag: loan.item_tag,
      action: 'RETURN',
      occurred_at: now,
      device_id: 'web-kiosk',
      synced: 0
    }
    await db.transactions.add(tx)
    setTx(v => [tx, ...v])
    refresh(); refreshAlerts()
    append(`[RETURN] ${loan.student_index} -> ${loan.item_tag}`)
    await loadLoansForReturn()
  }

  // ===== Alerts =====
  async function refreshAlerts(){
    const all = await db.loans.where('status').equals('ACTIVE').toArray()
    const soonCutoff = new Date(); soonCutoff.setDate(soonCutoff.getDate() + 2)
    const flagged = all
      .filter(l => new Date(l.due_at) <= soonCutoff)
      .sort((a,b)=> a.due_at.localeCompare(b.due_at))
    setAlerts(flagged)
  }

  // Filters
  const filtStudents = useMemo(()=>{
    const q = stQuery.toLowerCase()
    if(!q) return students
    return students.filter(s=> Object.values(s).some(v=> String(v??'').toLowerCase().includes(q)))
  }, [students, stQuery])

  const filtTx = useMemo(()=>{
    const q = txQuery.toLowerCase()
    if(!q) return tx
    return tx.filter(t=> Object.values(t).some(v=> String(v??'').toLowerCase().includes(q)))
  }, [tx, txQuery])

  // Gate: login
  if(!authed){
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-title">Admin Login</div>
          <div className="notice">Default is <b>admin / admin</b>. You can set <code>VITE_ADMIN_USER</code> and <code>VITE_ADMIN_PASS</code> in a <code>.env</code> file.</div>
          <div className="login-row">
            <input className="search" placeholder="Username" value={u} onChange={e=> setU(e.target.value)} />
            <input className="search" placeholder="Password" type="password" value={p} onChange={e=> setP(e.target.value)} />
            <button className="btn primary" onClick={()=>{
              if(u === ADMIN_USER && p === ADMIN_PASS){
                localStorage.setItem('authed', '1'); setAuthed(true)
              } else {
                alert('Invalid credentials')
              }
            }}>Login</button>
          </div>
        </div>
      </div>
    )
  }

  return <>
    <div className="header">
      <div style={{width:14, height:14, borderRadius:9999, background:BLUE}}/>
      <b>RFID Library Manager (Web)</b>
      <div className="topactions">
        <button className="btn" onClick={()=> setAutosync(a=>!a)}>{autosync ? 'Auto-sync: ON' : 'Auto-sync: OFF'}</button>
        <button className="btn primary" onClick={()=> trySync(false)}>Sync Now</button>
        <button className="btn" onClick={connectSerial} disabled={connected}>{connected ? 'Port: Connected' : 'Connect Reader'}</button>
        <button className="btn" onClick={()=> setManualConnected(v=>!v)}>{manualConnected ? 'Mark Disconnected' : 'Mark Connected'}</button>
        <button className="btn" onClick={()=> { localStorage.removeItem('authed'); setAuthed(false) }}>Logout</button>
      </div>
      <div className="badge">
        <span>Device: <b>{connected || manualConnected ? 'Connected' : 'Disconnected'}</b></span>
        <span>Today: <b>{today}</b></span>
        <span>Total: <b>{total}</b></span>
        <span>Unsynced: <b style={{color: unsynced? ORANGE : 'inherit'}}>{unsynced}</b></span>
      </div>
    </div>

    <div className="layout">
      <div className="sidebar">
        <button className="navbtn" onClick={()=> setRoute('#dashboard')}>🏠 Dashboard</button>
        <button className="navbtn" onClick={()=> setRoute('#borrow')}>📥 Borrow</button>
        <button className="navbtn" onClick={()=> setRoute('#return')}>📤 Return</button>
        <button className="navbtn" onClick={()=> setRoute('#transactions')}>🧾 Transactions</button>
        <button className="navbtn" onClick={()=> setRoute('#students')}>👥 Students</button>
        <button className="navbtn" onClick={()=> setRoute('#settings')}>⚙️ Settings</button>
      </div>

      <div className="content">
        {route === '#borrow' ? (
          <BorrowView refs={{ borrowCardRef, borrowIndexRef, borrowItemTagRef, borrowItemTitleRef, borrowDaysRef }} onSubmit={submitBorrow} />
        ) : route === '#return' ? (
          <ReturnView refs={{ returnCardRef, returnIndexRef }} loans={loans} loadLoans={loadLoansForReturn} onReturn={markReturned} />
        ) : route === '#students' ? (
          <StudentsView list={filtStudents} stQuery={stQuery} setStQuery={setStQuery} />
        ) : route === '#transactions' ? (
          <TransactionsView list={filtTx} txQuery={txQuery} setTxQuery={setTxQuery} />
        ) : route === '#settings' ? (
          <SettingsView/>
        ) : (
          <DashboardView log={log} alerts={alerts} onRefreshAlerts={refreshAlerts} logBoxRef={logBoxRef} />
        )}
      </div>
    </div>
  </>
}

// ---------- Views ----------

function DashboardView({log, alerts, onRefreshAlerts, logBoxRef}:{log:string; alerts:Loan[]; onRefreshAlerts:()=>void; logBoxRef:React.RefObject<HTMLDivElement>}){
  const [s, setS] = useState({total:0,today:0,unsynced:0,borrowed:0,returned:0})
  useEffect(()=>{ stats().then(setS) }, [log])
  useEffect(()=>{ onRefreshAlerts() }, [log])

  return <>
    <div className="cards">
      <Card title="Total Transactions" value={s.total} color="#166FE5" />
      <Card title="Today" value={s.today} color="#FF7A00" />
      <Card title="Unsynced" value={<span style={{color: s.unsynced? '#DC2626':'#16A34A'}}>{s.unsynced}</span>} color="#16A34A" />
      <Card title="Borrowed" value={s.borrowed} color="#166FE5" />
      <Card title="Returned" value={s.returned} color="#FF7A00" />
    </div>
    <hr className="sep"/>

    <div style={{display:'grid', gridTemplateColumns:'1fr', gap:12}}>
      <div>
        <div style={{fontWeight:600, marginBottom:6}}>Live Log</div>
        <div className="logbox" ref={logBoxRef}>
          <pre className="log">{log || '[info] ready'}</pre>
        </div>
      </div>

      <div>
        <div style={{fontWeight:600, marginBottom:6}}>Due Soon / Overdue</div>
        <table className="table">
          <thead><tr>
            <th>Student</th><th>Book</th><th>Due</th><th>Status</th>
          </tr></thead>
          <tbody>
            {alerts.map(l=>{
              const overdue = new Date(l.due_at) < new Date()
              return (
                <tr key={l.id}>
                  <td>{l.student_index}</td>
                  <td>{l.item_title ?? l.item_tag}</td>
                  <td>{l.due_at.slice(0,19).replace('T',' ')}</td>
                  <td style={{color: overdue ? '#DC2626' : '#B45309'}}>{overdue ? 'Overdue' : 'Due soon'}</td>
                </tr>
              )
            })}
            {alerts.length===0 && <tr><td colSpan={4} className="notice">No upcoming or overdue items.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </>
}

function BorrowView({refs, onSubmit}:{refs:any; onSubmit:()=>void}){
  return <div style={{maxWidth:860}}>
    <div style={{fontWeight:700, fontSize:18, marginBottom:8}}>Borrow</div>
    <p className="notice">Scan card (or enter manually), then enter book details and duration. Students may hold up to <b>3</b> active loans.</p>
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
      <div>
        <div style={{fontWeight:600, marginBottom:4}}>Identity</div>
        <input ref={refs.borrowCardRef} placeholder="Card UID (scan or type)" className="search" />
        <div style={{fontSize:12, color:'#64748B', margin:'6px 0'}}>or</div>
        <input ref={refs.borrowIndexRef} placeholder="Student Index" className="search" />
      </div>
      <div>
        <div style={{fontWeight:600, marginBottom:4}}>Book</div>
        <input ref={refs.borrowItemTagRef} placeholder="Item Tag (scan or type)" className="search" />
        <input ref={refs.borrowItemTitleRef} placeholder="Title (optional but nice)" className="search" style={{marginTop:8}} />
      </div>
    </div>
    <div style={{display:'flex', gap:12, marginTop:12, alignItems:'center'}}>
      <input ref={refs.borrowDaysRef} defaultValue="14" type="number" min={1} className="search" style={{width:120}} />
      <span className="notice">days</span>
      <button className="btn primary" onClick={onSubmit}>Confirm Borrow</button>
    </div>
  </div>
}

function ReturnView({refs, loans, loadLoans, onReturn}:{refs:any; loans:Loan[]; loadLoans:()=>void; onReturn:(l:Loan)=>void}){
  return <div style={{maxWidth:960}}>
    <div style={{fontWeight:700, fontSize:18, marginBottom:8}}>Return</div>
    <p className="notice">Scan card (or enter index) to list active loans for that student, then mark the returned item.</p>
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
      <input ref={refs.returnCardRef} placeholder="Card UID (scan or type)" className="search" />
      <input ref={refs.returnIndexRef} placeholder="Student Index (optional)" className="search" />
    </div>
    <div style={{marginTop:10}}>
      <button className="btn" onClick={loadLoans}>Load Loans</button>
    </div>

    <table className="table" style={{marginTop:12}}>
      <thead><tr>
        <th>Book</th><th>Item Tag</th><th>Borrowed</th><th>Due</th><th>Status</th><th>Action</th>
      </tr></thead>
      <tbody>
        {loans.map(l=>{
          const overdue = new Date(l.due_at) < new Date()
          return (
            <tr key={l.id}>
              <td>{l.item_title ?? '-'}</td>
              <td>{l.item_tag}</td>
              <td>{l.borrowed_at.slice(0,19).replace('T',' ')}</td>
              <td>{l.due_at.slice(0,19).replace('T',' ')}</td>
              <td style={{color: overdue ? '#DC2626' : '#16A34A'}}>{overdue ? 'Overdue' : 'Active'}</td>
              <td><button className="btn primary" onClick={()=> onReturn(l)}>Mark Returned</button></td>
            </tr>
          )
        })}
        {loans.length===0 && <tr><td colSpan={6} className="notice">No active loans for that student.</td></tr>}
      </tbody>
    </table>
  </div>
}

function StudentsView({list, stQuery, setStQuery}:{list:Student[]; stQuery:string; setStQuery:(s:string)=>void}){
  return <div>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <div style={{fontWeight:700}}>Students</div>
      <input className="search" placeholder="Search" value={stQuery} onChange={e=> setStQuery(e.target.value)} />
    </div>
    <table className="table" style={{marginTop:8}}>
      <thead><tr>
        <th>Index</th><th>Name</th><th>Program</th><th>Level</th><th>Phone</th><th>Card UID</th><th>Created</th>
      </tr></thead>
      <tbody>
        {list.map(s=> <tr key={s.id}>
          <td>{s.index_number}</td><td>{s.full_name}</td><td>{s.program}</td><td>{s.level}</td><td>{s.phone}</td><td>{s.card_uid}</td><td>{s.created_at?.slice(0,19).replace('T',' ')}</td>
        </tr>)}
        {list.length===0 && <tr><td colSpan={7} className="notice">No students yet.</td></tr>}
      </tbody>
    </table>
  </div>
}

function TransactionsView({list, txQuery, setTxQuery}:{list:Tx[]; txQuery:string; setTxQuery:(s:string)=>void}){
  return <div>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <div style={{fontWeight:700}}>Transactions</div>
      <input className="search" placeholder="Search" value={txQuery} onChange={e=> setTxQuery(e.target.value)} />
    </div>
    <table className="table" style={{marginTop:8}}>
      <thead><tr>
        <th>Time</th><th>Action</th><th>Student</th><th>User UID</th><th>Item Tag</th><th>ID</th><th>Synced</th>
      </tr></thead>
      <tbody>
        {list.map(t=> <tr key={t.id}>
          <td>{t.occurred_at.slice(0,19).replace('T',' ')}</td>
          <td>{t.action}</td>
          <td>{t.student_index}</td>
          <td>{t.user_uid}</td>
          <td>{t.item_tag}</td>
          <td style={{maxWidth:240, overflow:'hidden', textOverflow:'ellipsis'}}>{t.id}</td>
          <td>{t.synced ? '1' : '0'}</td>
        </tr>)}
        {list.length===0 && <tr><td colSpan={7} className="notice">No transactions yet.</td></tr>}
      </tbody>
    </table>
  </div>
}

function SettingsView(){
  return <div>
    <div style={{fontWeight:700}}>Settings</div>
    <p className="notice">Set env vars in <code>.env</code>:
      <br/>• <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code> (optional for cloud sync)
      <br/>• <code>VITE_ADMIN_USER</code>, <code>VITE_ADMIN_PASS</code> (optional admin login)
    </p>
    <p className="notice">Works fully with manual input if no hardware is connected. Use <b>Connect Reader</b> for Web Serial.</p>
  </div>
}
