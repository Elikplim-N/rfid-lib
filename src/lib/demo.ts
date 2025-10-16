import { db, Loan, Tx, addDays, Student } from './db';

export function startDemo(onEmit:(data:any)=>void){
  const iv = setInterval(async ()=>{
    const uid = 'DUID-' + Math.floor(100000+Math.random()*900000)
    const tag = 'DBOOK-' + Math.floor(100+Math.random()*900)
    onEmit({event:'card', uid})
    setTimeout(()=> onEmit({event:'item', tag}), 250)

    // --- Create a student for this card if one doesn't exist
    let stu: Student | undefined = await db.students.where('card_uid').equals(uid).first()
    if (!stu) {
        const now = new Date().toISOString()
        const newStudent: Student = {
            index_number: `DEMO-${uid.slice(-6)}`,
            full_name: `Demo Student ${uid.slice(-4)}`,
            program: 'DEMO',
            level: '100',
            phone: null,
            card_uid: uid,
            created_at: now
        }
        await db.students.add(newStudent)
        stu = await db.students.where('card_uid').equals(uid).first()
        onEmit({line: `[DEMO] Created student ${newStudent.index_number}`})
    }

    if(stu){
      // --- Create a loan
      const now = new Date().toISOString()
      const dueIso = addDays(now, 14)
  
      const loan: Loan = {
        id: crypto.randomUUID(),
        student_index: stu.index_number,
        user_uid: uid,
        item_tag: tag,
        item_title: `Demo Book ${tag.slice(-3)}`,
        borrowed_at: now,
        due_at: dueIso,
        returned_at: null,
        status: 'ACTIVE',
        device_id: 'web-kiosk-demo',
        synced: 0
      }
      await db.loans.add(loan)
  
      const tx: Tx = {
        id: crypto.randomUUID(),
        user_uid: uid,
        student_index: stu.index_number,
        item_tag: tag,
        action: 'BORROW',
        occurred_at: now,
        device_id: 'web-kiosk-demo',
        synced: 0
      }
      await db.transactions.add(tx)
  
      onEmit({line: `[DEMO] Created loan for ${stu.index_number} -> ${tag}`})
    }


  }, 8000 + Math.random()*3000)
  return ()=> clearInterval(iv)
}