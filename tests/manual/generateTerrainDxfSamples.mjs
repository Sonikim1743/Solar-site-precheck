import fs from 'node:fs'
import path from 'node:path'
import { terrainDxfSynthetic } from '../fixtures/terrainDxfSynthetic.mjs'
import { createTerrainDxf } from '../../src/utils/terrainDxf.js'
import { terrainReportLayouts } from '../../src/utils/terrainLayoutReport.js'

const directory = path.resolve(process.argv[2] || 'outputs/dxf')
fs.mkdirSync(directory, {recursive:true})
const manifest=[]
for(const tiltDeg of [10,15,20])for(const fence of [false,true]){
  const report=terrainDxfSynthetic({tiltDeg,fence}),result=createTerrainDxf(report)
  const name=`synthetic-tilt-${tiltDeg}-fence-${fence?'on':'off'}.dxf`
  fs.writeFileSync(path.join(directory,name),result.bytes)
  const {current:layout,fence:actualFence}=terrainReportLayouts(report.terrainArea,report.terrainPreview)
  manifest.push({name,tiltDeg,fence,units:result.units,origin:result.origin,counts:result.counts,moduleCount:layout.moduleCount,rackCount:layout.rackCount,
    boundary:report.terrainArea.grid.boundary,modules:layout.racks.flatMap(r=>r.modules.map(m=>m.corners.map(p=>p.slice(0,2)))),
    fencePaths:actualFence?.rails.map(r=>r.points.map(p=>p.slice(0,2)))||[],parcelText:'試験地番１２３－４・山林',
    projectedModuleHeightM:layout.options.moduleHeightM*Math.cos(tiltDeg*Math.PI/180),moduleWidthM:layout.options.moduleWidthM})
}
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({synthetic:true,note:'Invented WGS84 geometry and DEM. Not company land or surveyed data.',samples:manifest},null,2))
console.log(JSON.stringify(manifest.map(({name,moduleCount,rackCount,counts})=>({name,moduleCount,rackCount,counts})),null,2))
