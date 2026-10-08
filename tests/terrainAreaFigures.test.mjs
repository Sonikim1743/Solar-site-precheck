import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createEmptyParcelReview, measureParcelReview } from '../src/utils/parcelReview.js'
import { createTerrainPlan, normalizeTerrainArea, terrainTilePoint } from '../src/utils/terrainArea.js'

// Every coordinate, elevation and source entry below is synthetic. No site
// records or downloaded DEM/parcel data are used by these rendering tests.
let viteServer, TerrainArea3D, TerrainAreaReport
before(async () => {
  viteServer = await createServer({
    configFile: false, root: process.cwd(), plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', logLevel: 'error', optimizeDeps: { disabled: true },
  })
  TerrainArea3D = (await viteServer.ssrLoadModule('/src/components/TerrainAreaFigures.jsx')).TerrainArea3D
  TerrainAreaReport = (await viteServer.ssrLoadModule('/src/components/TerrainAreaReport.jsx')).default
}, { timeout: 30_000 })
after(async () => { await viteServer?.close() })

const square = (x, y, size) => [[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]
const close = (actual, expected, epsilon = .025) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`)
const render3D = (analysis, props = {}) => renderToStaticMarkup(React.createElement(TerrainArea3D, { analysis, reportMode: true, azimuth: 35, ...props }))

function insideRing([x,y], ring) {
  let inside = false
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const [ax,ay]=ring[i], [bx,by]=ring[j]
    if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside
  }
  return inside
}

// A padded, exact metre grid makes the expected cells and one-metre courtyard
// independent of geodetic rounding. Report tests below use a normalized record.
function localFixture({ hole = false, missing = false, allMissing = false } = {}) {
  const width=7, height=7, step=5, xMin=-5, yMin=-5
  const boundary=[[square(0,0,20), ...(hole ? [square(1.25,1.25,1)] : [])]]
  const inside=Array.from({length:width*height},(_,i)=>{
    const x=xMin+i%width*step, y=yMin+Math.floor(i/width)*step
    return x>=0 && x<=20 && y>=0 && y<=20 && !(hole && x>1.25 && x<2.25 && y>1.25 && y<2.25)
  })
  const elevations=inside.map(()=>110)
  if (missing) elevations[3*width+3]=null // (10,10): four adjacent 5m cells are omitted.
  if (allMissing) elevations.fill(null)
  return {
    version:1, geometryKey:'synthetic-local-fixture', fetchedAt:'2026-10-01T00:00:00.000Z',
    grid:{width,height,step,xMin,yMin,origin:{lat:35,lon:135},boundary,inside,elevations,slopes:elevations.map(z=>z===null?null:0)},
    contours:[], summary:{minElevation:allMissing?null:110,maxElevation:allMissing?null:110,heightRange:0,
      medianSlope:0,p90Slope:0,polygonAreaM2:hole?399:400,coveragePercent:missing?96:allMissing?0:100,slopeCoveragePercent:missing?80:allMissing?0:100},
  }
}

function paths(html, kind) {
  // Hidden back faces still have geometry. Use paintedPaths for visibility;
  // paths alone deliberately does not imply that a polygon is painted.
  return [...html.matchAll(/<path\b[^>]*>/g)].map(match=>match[0])
    .filter(path=>path.includes(`data-terrain-face="${kind}"`))
    .map(path=>({tag:path,d:path.match(/\sd="([^"]*)"/)?.[1]||''}))
}

const isPainted = path => !/\sdisplay="none"/.test(path.tag)
const paintedPaths = (html,kind) => paths(html,kind).filter(isPainted)

function ringsFromPath(d) {
  const tokens=d.match(/[MLZ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)||[]
  const rings=[]; let ring=[]
  for (let i=0; i<tokens.length;) {
    const command=tokens[i++]?.toUpperCase()
    if (command==='Z') { if(ring.length) rings.push(ring); ring=[] }
    else {
      assert.ok(command==='M'||command==='L', 'solid paths must contain inspectable straight polygon edges')
      if(command==='M'&&ring.length) { rings.push(ring); ring=[] }
      const p=[Number(tokens[i++]),Number(tokens[i++])]
      assert.ok(p.every(Number.isFinite)); ring.push(p)
    }
  }
  if(ring.length) rings.push(ring)
  return rings
}

function polygonArea(ring) {
  return Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1]},0))/2
}

// Independent orthographic camera for the explicit test grid. The 5m base
// thickness is only visual; terrain min/max remain 110m and height range zero.
function expectedProjection(azimuth=35) {
  const yaw=azimuth*Math.PI/180, pitch=32*Math.PI/180, base=105
  const transform=([x,y,z])=>{
    const east=x-10,north=y-10,up=z-base
    const forward=east*Math.sin(yaw)+north*Math.cos(yaw)
    return [-east*Math.cos(yaw)+north*Math.sin(yaw),forward*Math.sin(pitch)-up*Math.cos(pitch)]
  }
  const corners=[-5,25].flatMap(x=>[-5,25].flatMap(y=>[105,110].map(z=>transform([x,y,z]))))
  const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1])
  const xMin=Math.min(...xs),xMax=Math.max(...xs),yMin=Math.min(...ys),yMax=Math.max(...ys)
  const scale=Math.min(675/(xMax-xMin),335/(yMax-yMin))
  return {scale,pitch,point:p=>{const [x,y]=transform(p);return [400+(x-(xMin+xMax)/2)*scale,225+(y-(yMin+yMax)/2)*scale]}}
}

function bottomGeometryArea(html, projection) {
  return paths(html,'floor').reduce((sum,path)=>{
    const rings=ringsFromPath(path.d)
    return sum+polygonArea(rings[0])-rings.slice(1).reduce((holes,ring)=>holes+polygonArea(ring),0)
  },0)/(projection.scale**2*Math.sin(projection.pitch))
}

function geometryContainsPoint(html, kind, point) {
  return paths(html,kind).some(path=>ringsFromPath(path.d).reduce((inside,ring)=>inside!==insideRing(point,ring),false))
}

test('the static 3D block has real surface cells, outside walls and a matching clipped bottom',()=>{
  const analysis=localFixture(), original=structuredClone(analysis), html=render3D(analysis)
  assert.equal(paths(html,'surface').length,16)
  assert.equal(paths(html,'floor').length,16)
  assert.equal(paths(html,'wall').length,16, 'only the 4x4 mesh perimeter has walls')
  close(bottomGeometryArea(html,expectedProjection()),400,.05)
  assert.match(html,/高さ強調なし（1:1）/)
  assert.match(html,/側面・底面は表示用で、地層・土量を示しません。/)
  assert.doesNotMatch(html,/NaN|Infinity|undefined/)
  assert.deepEqual(analysis,original, 'visual extrusion must not change elevations or analysis statistics')
})

test('the five-metre display wall preserves the same metre scale as the unchanged top surface',()=>{
  for(const azimuth of [35,145]) {
    const html=render3D(localFixture(),{azimuth}), projection=expectedProjection(azimuth)
    const wallPoints=paths(html,'wall').flatMap(path=>ringsFromPath(path.d).flat())
    const top=projection.point([0,0,110]), bottom=projection.point([0,0,105])
    assert.ok(wallPoints.some(p=>Math.hypot(p[0]-top[0],p[1]-top[1])<.015), 'wall must meet the real 110m surface')
    assert.ok(wallPoints.some(p=>Math.hypot(p[0]-bottom[0],p[1]-bottom[1])<.015), 'wall must end at the explicitly chosen 105m visual base')
    close(Math.hypot(top[0]-bottom[0],top[1]-bottom[1]),5*projection.scale*Math.cos(projection.pitch),1e-9)
    close(bottomGeometryArea(html,projection),400,.05)
  }
})

test('flat report views retain hidden bottom geometry and paint only their front perimeter walls',()=>{
  for(const azimuth of [35,145]) {
    const html=render3D(localFixture(),{azimuth}), projection=expectedProjection(azimuth)
    assert.equal(paths(html,'floor').length,16,'bottom geometry is retained for verification')
    assert.equal(paintedPaths(html,'floor').length,0,'an observer above the terrain cannot see the downward-facing base')
    assert.equal(paintedPaths(html,'surface').length,16,'all horizontal top cells face the elevated camera')
    assert.equal(paintedPaths(html,'wall').length,8,'exactly two of the four perimeter sides face this camera')
    const sides=[
      {point:t=>[20,t],paint:true}, // Both fixed cameras are east of the model.
      {point:t=>[0,t],paint:false},
      {point:t=>[t,20],paint:azimuth===35},
      {point:t=>[t,0],paint:azimuth===145},
    ]
    for(const side of sides) for(let start=0;start<20;start+=5) {
      const [ax,ay]=side.point(start),[bx,by]=side.point(start+5)
      const expected=[[ax,ay,110],[bx,by,110],[ax,ay,105],[bx,by,105]].map(projection.point)
      const matches=paths(html,'wall').filter(path=>{
        const actual=ringsFromPath(path.d).flat()
        return expected.every(p=>actual.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.015))
      })
      assert.equal(matches.length,1,'each known perimeter segment must map to exactly one SVG wall')
      assert.equal(isPainted(matches[0]),side.paint,`wrong painted side at bearing ${azimuth}, edge ${ax},${ay}–${bx},${by}`)
    }
  }
})

test('each steep surface polygon is culled on its back side and painted from the opposite fixed view',()=>{
  for(const northRise of [2,-2]) {
    // z=110 +/- 2*y: normal is (0, -/+2, 1), independent of vertex winding.
    // At 32° elevation the north-facing camera sees only the north-facing slope.
    const analysis=localFixture({hole:true}), grid=analysis.grid
    grid.elevations=grid.elevations.map((_,i)=>110+northRise*(grid.yMin+Math.floor(i/grid.width)*grid.step))
    grid.slopes=grid.slopes.map(()=>Math.atan(2)*180/Math.PI)
    analysis.summary={...analysis.summary,minElevation:northRise>0?110:70,maxElevation:northRise>0?150:110,heightRange:40,
      medianSlope:Math.atan(2)*180/Math.PI,p90Slope:Math.atan(2)*180/Math.PI}
    const original=structuredClone(analysis)
    for(const azimuth of [35,145]) {
      const html=render3D(analysis,{azimuth}), surface=paths(html,'surface')
      const expectedPaint=northRise>0 ? azimuth===145 : azimuth===35
      assert.equal(surface.length,16,'the excluded sub-cell hole must not drop the whole cell')
      assert.ok(surface.some(path=>ringsFromPath(path.d).length===2),'clipped surface with a hole is also tested')
      for(const face of surface) {
        if(expectedPaint) assert.doesNotMatch(face.tag,/\sdisplay=/,'front-facing surface has no display override')
        else assert.match(face.tag,/\sdisplay="none"/,'back-facing steep surface must not cover nearer walls')
      }
      assert.equal(paintedPaths(html,'surface').length,expectedPaint?16:0)
      assert.equal(paths(html,'floor').length,16)
      assert.equal(paintedPaths(html,'floor').length,0)
      assert.match(html,/高さ強調なし（1:1）/)
    }
    assert.deepEqual(analysis,original,'visibility changes must not alter real slope or height range')
  }
})

test('a one-metre exclusion inside one 5m cell remains empty at the top and bottom',()=>{
  const analysis=localFixture({hole:true}), html=render3D(analysis), projection=expectedProjection()
  assert.equal(analysis.grid.inside.filter(Boolean).length,25, 'the tiny hole deliberately contains no grid node')
  close(bottomGeometryArea(html,projection),399,.06)
  assert.equal(geometryContainsPoint(html,'floor',projection.point([1.75,1.75,105])),false)
  assert.equal(geometryContainsPoint(html,'surface',projection.point([1.75,1.75,110])),false)
  assert.equal(geometryContainsPoint(html,'surface',projection.point([3,3,110])),true)
  assert.ok(paths(html,'wall').length>16,'the exclusion needs its own inside walls')
  assert.ok(paths(html,'floor').some(path=>ringsFromPath(path.d).length===2),'the sub-cell hole must survive as a second ring')
  for(const path of paths(html,'floor')) assert.match(path.tag,/fill-rule="evenodd"/)
})

test('an internal missing DEM sample leaves its four cells empty through the block',()=>{
  const analysis=localFixture({missing:true}), original=structuredClone(analysis), html=render3D(analysis), projection=expectedProjection()
  assert.equal(paths(html,'surface').length,12)
  assert.equal(paths(html,'floor').length,12)
  close(bottomGeometryArea(html,projection),300,.06)
  assert.equal(geometryContainsPoint(html,'floor',projection.point([9,9,105])),false)
  assert.equal(geometryContainsPoint(html,'surface',projection.point([9,9,110])),false)
  assert.equal(geometryContainsPoint(html,'floor',projection.point([2.5,2.5,105])),true)
  assert.ok(paths(html,'wall').length>16,'the missing-data opening has inside walls')
  assert.match(html,/未取得|欠測/)
  assert.deepEqual(analysis,original)
})

test('without finite terrain heights no artificial floor or block is fabricated',()=>{
  const html=render3D(localFixture({allMissing:true}))
  assert.match(html,/標高がありません|標高点が不足/)
  assert.equal(paths(html,'surface').length,0)
  assert.equal(paths(html,'wall').length,0)
  assert.equal(paths(html,'floor').length,0)
})

function reportFixture() {
  const parcelReview={...createEmptyParcelReview(),boundary:{type:'Polygon',coordinates:[square(135,35,.0004)]}}
  const geometry=measureParcelReview(parcelReview).geometry, plan=createTerrainPlan(geometry), grid=plan.grid
  const elevations=Array(grid.width*grid.height).fill(110), urls=new Set()
  for(let i=0;i<elevations.length;i++) {
    const [lon,lat]=plan.positionAt(i),[x,y]=terrainTilePoint(lon,lat,15)
    urls.add(`https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/15/${Math.floor(x/256)}/${Math.floor(y/256)}.png`)
  }
  const terrainArea=normalizeTerrainArea({version:1,geometryKey:plan.geometryKey,geometry:plan.geometry,fetchedAt:'2026-10-01T00:00:00.000Z',source:{urls:[...urls]},grid:{...grid,elevations,sourceIds:elevations.map(()=>'dem5b_png')}})
  return {terrainArea,parcelReview,position:{lat:35.0002,lon:135.0002},siteName:'合成地形・描画回帰用',appVersion:'test'}
}

test('the Japanese report remains two sheets with fixed views, source limits and unchanged real statistics',()=>{
  const report=reportFixture(), original=structuredClone(report)
  const html=renderToStaticMarkup(React.createElement(TerrainAreaReport,{report}))
  assert.equal((html.match(/report-print-page terrain-report-sheet/g)||[]).length,2)
  assert.equal((html.match(/<svg\b/g)||[]).length,3)
  assert.match(html,/北から時計回り35°/)
  assert.match(html,/北から時計回り145°/)
  assert.match(html,/3D高さ強調なし（1:1）/)
  assert.match(html,/data-view-azimuth="35" data-view-pitch="32"/)
  assert.match(html,/data-view-azimuth="145" data-view-pitch="32"/,'the A3 views retain their fixed directions')
  assert.match(html,/立体の底面/)
  assert.match(html,/地層・土量を示しません/)
  assert.match(html,/<dt>高低差<\/dt><dd>0 m<\/dd>/,'the visual 5m base is not terrain height difference')
  assert.match(html,/写真測量/)
  assert.match(html,/施工可否は未判定/)
  assert.doesNotMatch(html,/<canvas|<button|tabindex=|terrain-area-figure--interactive/)
  assert.ok(paths(html,'surface').length>0&&paths(html,'wall').length>0&&paths(html,'floor').length>0)
  assert.deepEqual(report,original)
})

test('report mode rejects interactive controls even when requested on a solid figure',()=>{
  const html=render3D(localFixture(),{reportMode:true,interactive:true,azimuth:145})
  assert.match(html,/北から時計回り145°/)
  assert.doesNotMatch(html,/<canvas|<button|tabindex=|terrain-area-drag-target/)
  assert.ok(paths(html,'wall').length>0)
})

test('interactive camera controls expose viewpoint movement without introducing extra buttons or changing terrain values',()=>{
  const analysis=localFixture(),original=structuredClone(analysis)
  const html=renderToStaticMarkup(React.createElement(TerrainArea3D,{analysis,interactive:true}))
  assert.match(html,/data-view-azimuth="35" data-view-pitch="32"/)
  assert.match(html,/地形の周囲を回って見られる立体図/)
  const modes=html.match(/<div class="terrain-area-camera-modes"[\s\S]*?<\/div>/)?.[0]||''
  assert.equal((modes.match(/<button\b/g)||[]).length,2)
  assert.match(modes,/>回転<\/button>/)
  assert.match(modes,/>視点の移動<\/button>/)
  assert.deepEqual(analysis,original)
})

test('height emphasis and slope shares use real summary values without modifying the analysis',()=>{
  const analysis=localFixture()
  analysis.summary.slopeBins=[{min:0,max:10,percent:80.7},{min:10,max:20,percent:14.9},{min:20,max:30,percent:4.4},{min:30,max:90,percent:0}]
  const original=structuredClone(analysis)
  const normal=render3D(analysis), emphasized=render3D(analysis,{heightScale:2})
  assert.match(normal,/data-height-scale="1"/)
  assert.match(emphasized,/data-height-scale="2"/)
  assert.match(emphasized,/高さ2倍（横1：縦2）/)
  assert.match(emphasized,/標高・勾配の数値と色は実DEMのまま/)
  assert.notEqual(paths(normal,'wall')[0].d,paths(emphasized,'wall')[0].d)
  for (const html of [normal,emphasized]) for(const value of ['80.7%','14.9%','4.4%','0%']) assert.ok(html.includes(value))
  assert.deepEqual(analysis,original)
  const interactive=render3D(analysis,{interactive:true,reportMode:false})
  assert.match(interactive,/3Dの高さ表示/)
  assert.match(interactive,/実寸 1:1/)
  assert.match(interactive,/高さ2倍 1:2/)
  assert.match(interactive,/<caption>10m幅で見た局所勾配/)
  assert.match(interactive,/格子点の分布/)
  assert.match(interactive,/有効範囲 約400 m²（除外後）/)
  assert.match(interactive,/約323 m²/)
  assert.match(interactive,/約60 m²/)
  assert.match(interactive,/約18 m²/)
  assert.match(interactive,/>0 m²</)
  const partial=render3D({...analysis,summary:{...analysis.summary,slopeCoveragePercent:75}},{interactive:true,reportMode:false})
  assert.match(partial,/勾配未確認 約100 m²/)
  assert.match(partial,/約242 m²/)
  const missing=render3D(localFixture(),{interactive:true,reportMode:false})
  assert.match(missing,/未計算/)
  assert.doesNotMatch(missing,/80.7%/)
})
