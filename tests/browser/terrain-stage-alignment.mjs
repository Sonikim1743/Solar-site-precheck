import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const repo = process.cwd().split(path.sep).join('/')
const out = path.resolve(process.env.SOLAR_VERIFICATION_DIR || 'outputs/terrain-stage-regression')
await fs.mkdir(out,{recursive:true})
if(!process.env.SOLAR_PLAYWRIGHT_MODULE || !process.env.SOLAR_BROWSER_EXE) throw Error('Set existing SOLAR_PLAYWRIGHT_MODULE and SOLAR_BROWSER_EXE; no installation is performed')
const repoRequire = createRequire(path.join(repo, 'package.json'))
const viteRequire = createRequire(repoRequire.resolve('vite/package.json'))
const { build } = viteRequire('esbuild')
const {chromium}=await import(process.env.SOLAR_PLAYWRIGHT_MODULE)
const sourcePath = path.join(repo, 'src/components/TerrainAreaFigures.jsx')
const sourceBefore = await fs.readFile(sourcePath, 'utf8')
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {TerrainArea3D, diagnosticInternals} from '${sourcePath.replaceAll('\\', '/')}';
import {pointInTerrainBoundary} from '${repo}/src/utils/terrainArea.js';
const root=createRoot(document.getElementById('root'));
globalThis.renderFixture=({count=6,terrain='plane',scale=1,azimuth=29,pitch=15,report=false}={})=>{
 const square=(x,y)=>[[x,y],[x+20,y],[x+20,y+20],[x,y+20],[x,y]];
 const boundary=Array.from({length:count},(_,i)=>[square(-10+i%3*30,-10+Math.floor(i/3)*30)]);
 const grid={width:21,height:15,step:5,xMin:-20,yMin:-20,origin:{lat:35,lon:135},boundary};
 const plane=(x,y)=>terrain==='flat'?290:290+.1*x-.05*y;
 grid.elevations=Array.from({length:grid.width*grid.height},(_,i)=>plane(grid.xMin+i%grid.width*grid.step,grid.yMin+Math.floor(i/grid.width)*grid.step));
 grid.inside=grid.elevations.map((_,i)=>pointInTerrainBoundary([grid.xMin+i%grid.width*grid.step,grid.yMin+Math.floor(i/grid.width)*grid.step],boundary));
 if(terrain==='missing')grid.elevations[4*grid.width+4]=null;
 grid.slopes=grid.elevations.map(z=>z===null?null:terrain==='flat'?0:Math.atan(Math.hypot(.1,.05))*180/Math.PI);
 const valid=grid.elevations.filter((z,i)=>Number.isFinite(z)&&grid.inside[i]);
 const analysis={grid,contours:[],geometryKey:'synthetic-'+Math.random(),summary:{minElevation:Math.min(...valid),maxElevation:Math.max(...valid),heightRange:Math.max(...valid)-Math.min(...valid),coveragePercent:terrain==='missing'?99:100,polygonAreaM2:count*400,slopeCoveragePercent:100,medianSlope:6,p90Slope:6}};
 globalThis.fixtureState={analysis,plane,props:{count,terrain,scale,azimuth,pitch,report}};
 globalThis.__diagnosticPitch=pitch;
 root.render(React.createElement('div',{className:'terrain-area-panel'},React.createElement(TerrainArea3D,{key:analysis.geometryKey,analysis,position:{lat:35,lon:135},interactive:!report,reportMode:report,heightScale:scale,azimuth})));
};
globalThis.internals=diagnosticInternals;
`
const result = await build({stdin:{contents:fixture,loader:'jsx',resolveDir:repo},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(out,'diagnostic-bundle.js'),nodePaths:[path.join(repo,'node_modules')],plugins:[{name:'diagnostic-read-only-instrumentation',setup(builder){builder.onLoad({filter:/TerrainAreaFigures\.jsx$/},async({path:file})=>{let contents=await fs.readFile(file,'utf8');contents=contents.replaceAll('pitch: 32','pitch: globalThis.__diagnosticPitch ?? 32').replace('  const projectedFence = useMemo(() => {','  globalThis.__diagnosticDrawing = drawing;\n  const projectedFence = useMemo(() => {');contents+='\nexport const diagnosticInternals={interpolateElevation,surfaceBoundaryPoints};\n';return {contents,loader:'jsx',resolveDir:path.dirname(file)}})}}]})
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><style>body{margin:0;font-family:Meiryo,sans-serif}#root{width:800px}${css}</style><div id="root"></div><script>${js.replaceAll('</script','<\\/script')}</script></html>`
await fs.writeFile(path.join(out,'terrain-synthetic.html'),html)
const browser=await chromium.launch({executablePath:process.env.SOLAR_BROWSER_EXE,headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--disable-client-side-phishing-detection','--unsafely-disable-devtools-self-xss-warnings','--enable-unsafe-swiftshader'],args:['--disable-gpu']})
const page=await browser.newPage({viewport:{width:1000,height:750},deviceScaleFactor:1})
page.on('pageerror',error=>console.error(error))
await page.setContent(html)
const records=[]
async function inspect(opts,width=800,fix=false){
 await page.setViewportSize({width:width<640?width:1000,height:750})
 await page.evaluate(({opts,width,fix})=>{document.getElementById('root').style.width=width+'px';document.getElementById('diagnostic-fix')?.remove();if(fix==='regression-control'){const s=document.createElement('style');s.id='diagnostic-fix';s.textContent='.terrain-area-model--navigation .terrain-area-stage{align-self:stretch}';document.head.appendChild(s)}globalThis.__diagnosticDrawing=null;globalThis.renderFixture(opts)},{opts,width,fix})
 await page.waitForFunction(()=>globalThis.__diagnosticDrawing&&document.querySelector('.terrain-area-stage svg'))
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 return await page.evaluate(()=>{
  const d=globalThis.__diagnosticDrawing,{analysis,plane,props}=globalThis.fixtureState,g=analysis.grid;
  const canvas=document.querySelector('canvas'),svg=document.querySelector('.terrain-area-stage>svg'),stage=document.querySelector('.terrain-area-stage');
  const c=canvas?.getBoundingClientRect(),s=svg.getBoundingClientRect(),t=stage.getBoundingClientRect(),ctm=svg.getScreenCTM();
  const screenError=p=>{if(!c)return 0;const [x,y]=d.project(p),v=new DOMPoint(x,y).matrixTransform(ctm);return Math.hypot(c.left+x*c.width/800-v.x,c.top+y*c.height/440-v.y)};
  const outline=d.outlines.flat(),surface=d.faces.filter(f=>f.kind==='surface').flatMap(f=>f.rings.flat()),wallTops=d.walls.flatMap(f=>f.rings.flat()).filter(p=>p[2]!==d.base);
  const ground=globalThis.internals.interpolateElevation(g,0,0);
  return {props,width:s.width,stageHeight:t.height,svgHeight:s.height,canvasHeight:c?.height??null,svgScale:[ctm.a,ctm.d],canvasScale:c?[c.width/800,c.height/440]:null,
   maxScreenMismatch:Math.max(0,...outline.map(screenError)),selectedScreenMismatch:Number.isFinite(ground)?screenError([0,0,ground]):null,
   selectedZ:ground,selectedMarker:!!document.querySelector('.terrain-area-selected-point'),outlinePoints:outline.length,surfacePoints:surface.length,
   outlineElevationError:Math.max(0,...outline.map(([x,y,z])=>Math.abs(z-plane(x,y)))),surfaceElevationError:Math.max(0,...surface.map(([x,y,z])=>Math.abs(z-plane(x,y)))),wallElevationError:Math.max(0,...wallTops.map(([x,y,z])=>Math.abs(z-plane(x,y)))),
   floorBase:d.base,minElevation:analysis.summary.minElevation,maxElevation:analysis.summary.maxElevation,missingCellRendered:d.faces.some(f=>f.kind==='surface'&&f.rings.some(r=>r.some(p=>p[0]===0&&p[1]===0))),
   model:d.project([0,0,290])};
 })
}
try{
 const before=await inspect({count:6,terrain:'plane',scale:1,azimuth:29,pitch:15},800,'regression-control');records.push({case:'negative-control-800',...before});assert.ok(before.maxScreenMismatch>20,'unpatched CSS should reproduce visible separation');
 await page.screenshot({path:path.join(out,'terrain-before.png'),fullPage:true});
 const after=await inspect({count:6,terrain:'plane',scale:1,azimuth:29,pitch:15},800,false);records.push({case:'product-css-800',...after});assert.ok(after.maxScreenMismatch<1e-8);
 await page.screenshot({path:path.join(out,'terrain-after.png'),fullPage:true});
 for(const width of [375,640,641,800,920])for(const count of [1,6])for(const terrain of ['plane','flat','missing'])for(const scale of [1,2])for(const [azimuth,pitch] of [[29,15],[145,32],[270,65]]){
  const r=await inspect({count,terrain,scale,azimuth,pitch},width,false);records.push({case:'fixed-matrix',viewport:width,...r});
  assert.ok(r.maxScreenMismatch<.02,JSON.stringify(r));assert.ok(r.outlineElevationError<1e-9);assert.ok(r.surfaceElevationError<1e-9);assert.ok(r.wallElevationError<1e-9);assert.ok(r.floorBase<=r.minElevation-5);
  if(terrain==='missing'){assert.equal(r.selectedZ,null);assert.equal(r.selectedMarker,false);assert.equal(r.missingCellRendered,false)}else{assert.equal(r.selectedZ,290);assert.equal(r.selectedMarker,true)}
 }
 await inspect({count:6,terrain:'plane',scale:1,azimuth:149,pitch:29},800,false);
 const aligned=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const sizes=await page.evaluate(()=>{const c=document.querySelector('.terrain-area-stage canvas').getBoundingClientRect(),s=document.querySelector('.terrain-area-stage>svg').getBoundingClientRect();return {canvas:c.height,svg:s.height,width:c.width}});assert.ok(Math.abs(sizes.canvas-sizes.svg)<.02);return sizes};
 const menuClosed=await aligned();await page.getByRole('button',{name:'方位を選ぶ',exact:true}).click();const menuOpen=await aligned();assert.deepEqual(menuOpen,menuClosed);await page.getByRole('button',{name:'方位を選ぶ',exact:true}).click();await aligned();
 await page.getByRole('button',{name:'視点を左へ回す',exact:true}).click();await page.getByRole('button',{name:'見下ろしを増やす',exact:true}).click();await page.getByRole('button',{name:'3Dを拡大',exact:true}).click();await page.getByRole('button',{name:'高さ2倍 1:2',exact:true}).click();await aligned();records.push({case:'menu-and-camera-controls',menuClosed,menuOpen});
 const report=await inspect({count:6,terrain:'plane',scale:1,azimuth:29,pitch:15,report:true});records.push({case:'report',...report});assert.equal(report.canvasHeight,null);
 assert.equal(await fs.readFile(sourcePath,'utf8'),sourceBefore,'repository component was not changed');
 await fs.writeFile(path.join(out,'terrain-diagnostic-results.json'),JSON.stringify({sourcePath,readOnlySourceConfirmed:true,matrixCases:records.filter(r=>r.case==='fixed-matrix').length,records},null,2));
 console.log(JSON.stringify({baseline:before,fixed:after,matrixCases:records.filter(r=>r.case==='fixed-matrix').length,maxFixedMismatch:Math.max(...records.filter(r=>r.case==='fixed-matrix').map(r=>r.maxScreenMismatch)),sourceUnchanged:true},null,2));
}finally{await browser.close()}
