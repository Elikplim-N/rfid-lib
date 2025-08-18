export type SerialEvent = {event:'card', uid:string} | {event:'item', tag:string} | {event:'hb', ts:string}

export async function requestPort(): Promise<any | null>{
  if(!('serial' in navigator)){
    alert('Web Serial API not supported. Use Chrome/Edge on desktop, or run the Python bridge.')
    return null
  }
  try{
    const port = await (navigator as any).serial.requestPort()
    return port
  }catch{
    return null
  }
}

export async function readLines(port: any, onMessage:(obj:any)=>void, onClose?:()=>void){
  await port.open({ baudRate: 115200 })
  const textDecoder = new TextDecoderStream()
  const readable = port.readable.pipeThrough(textDecoder)
  const reader = readable.getReader()
  let buffer = ''
  try{
    while(true){
      const {value, done} = await reader.read()
      if(done) break
      if(!value) continue
      buffer += value
      let idx
      while((idx = buffer.indexOf('\n')) >= 0){
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx+1)
        if(!line) continue
        if(line.startsWith('CARD_SCANNED:')){
          const uid = line.replace('CARD_SCANNED:', '').trim()
          onMessage({event: 'card', uid})
        } // Add similar for 'ITEM_SCANNED:' if needed
      }
    }
  } finally {
    try{ await reader.releaseLock() }catch{}
    try{ await port.close() }catch{}
    onClose && onClose()
  }
}