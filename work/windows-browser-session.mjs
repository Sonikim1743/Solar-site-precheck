import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {execFileSync} from 'node:child_process'

export async function openBrowserSession(chromium, out) {
  const snapshot=()=>({at:new Date().toISOString(),freeMiB:Math.round(os.freemem()/1048576),usedPercent:Number((100*(1-os.freemem()/os.totalmem())).toFixed(1))})
  const before=snapshot()
  if(before.usedPercent>85)throw Error('Browser test paused: insufficient free memory')
  const server=await chromium.launchServer({executablePath:process.env.SOLAR_BROWSER_EXE,headless:true})
  const processInfo={pid:server.process().pid,started:new Date().toISOString(),testPid:process.pid}
  let browser,context,closed=false,monitor,deadline
  const processes=()=>{
    const cmd=`$all=Get-CimInstance Win32_Process; $ids=@(${processInfo.pid}); do { $new=@($all | Where-Object {$_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids} | ForEach-Object ProcessId); $ids+= $new } while($new.Count); @($all | Where-Object {$_.ProcessId -in $ids} | Select-Object ProcessId,ParentProcessId,Name,CreationDate) | ConvertTo-Json -Compress`
    try{return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',cmd],{encoding:'utf8',timeout:15000,windowsHide:true})||'[]')}catch{return []}
  }
  let owned=[]
  const samples=[before]
  const close=async()=>{
    if(closed)return
    closed=true;clearInterval(monitor);clearTimeout(deadline)
    const limit=async(fn)=>{let timer;try{await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser close timeout')),10000)})]);return true}catch{return false}finally{clearTimeout(timer)}}
    if(context)await limit(()=>context.close())
    if(browser)await limit(()=>browser.close())
    if(!await limit(()=>server.close()))await server.kill()
    const remaining=processes(),after=snapshot()
    await fs.writeFile(path.join(out,'browser-process-end.json'),JSON.stringify({processInfo,owned,remaining,samples,after},null,2))
    if(Array.isArray(remaining)?remaining.length:remaining?.ProcessId)throw Error('Owned browser processes remain after cleanup')
    console.log('Browser cleanup complete',JSON.stringify(after))
  }
  try{
    owned=processes()
    await fs.writeFile(path.join(out,'browser-process-start.json'),JSON.stringify({processInfo,owned,before},null,2))
    browser=await chromium.connect(server.wsEndpoint())
    context=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true,serviceWorkers:'block'})
    const page=await context.newPage()
    monitor=setInterval(()=>{const s=snapshot();samples.push(s);if(s.usedPercent>88){console.error('Memory limit reached; closing test browser');process.exitCode=1;close().catch(console.error)}},10000)
    deadline=setTimeout(()=>{console.error('Browser test deadline reached');process.exitCode=1;close().catch(console.error)},7*60000)
    return {browser,context,page,close}
  }catch(error){await close();throw error}
}
