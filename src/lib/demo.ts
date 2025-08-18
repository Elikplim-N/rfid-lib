export function startDemo(onEmit:(data:any)=>void){
  const iv = setInterval(()=>{
    const uid = 'DUID-' + Math.floor(100000+Math.random()*900000)
    const tag = 'DBOOK-' + Math.floor(100+Math.random()*900)
    onEmit({event:'card', uid})
    setTimeout(()=> onEmit({event:'item', tag}), 250)
  }, 8000 + Math.random()*3000)
  return ()=> clearInterval(iv)
}
