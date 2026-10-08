import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parcelReportMapLayout, PARCEL_REPORT_MAP_MAX_TILES } from '../src/utils/parcelReportMap.js'

const polygon = coordinates => ({ type: 'Polygon', coordinates })
const ring = (x, y, dx, dy) => [[x,y],[x+dx,y],[x+dx,y+dy],[x,y+dy],[x,y]]
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)

test('standard-map pixels and boundary vertices share one independent Mercator coordinate system', () => {
  const geometry = polygon([ring(135,35,.0004,.0004)])
  const original = structuredClone(geometry), layout = parcelReportMapLayout([geometry])
  assert.equal(layout.width,720); assert.equal(layout.height,300)
  assert.ok(layout.tiles.length > 0 && layout.tiles.length <= PARCEL_REPORT_MAP_MAX_TILES)
  const worldWidth = 256 * 2 ** layout.zoom
  for (const point of geometry.coordinates[0]) {
    const [x, y] = layout.project(point), phi = point[1]*Math.PI/180
    close(x + layout.left, (point[0]+180)/360*worldWidth)
    close(y + layout.top, (1-Math.asinh(Math.tan(phi))/Math.PI)/2*worldWidth)
    assert.ok(x >= layout.padding && x <= layout.width-layout.padding)
    assert.ok(y >= layout.padding && y <= layout.height-layout.padding)
  }
  for(const tile of layout.tiles) {
    const [z, x, y] = tile.key.split('/').map(Number)
    assert.equal(z,layout.zoom); close(tile.x+layout.left,x*256); close(tile.y+layout.top,y*256)
    assert.match(tile.href,new RegExp(`/std/${z}/${x}/${y}\\.png$`))
    assert.ok(tile.x<layout.width && tile.x+256>0 && tile.y<layout.height && tile.y+256>0,'request visible tiles only')
  }
  assert.deepEqual(geometry,original,'display layout cannot change parcel geometry')
})

test('a long north-south range, courtyard and separate polygons all fit without stretching', () => {
  const wide={type:'MultiPolygon',coordinates:[[ring(135,35,.01,.7),ring(135.001,35.2,.002,.002)],[ring(135.03,35.8,.01,.01)]]}
  const layout=parcelReportMapLayout([wide])
  assert.ok(layout.zoom<18)
  for(const point of wide.coordinates.flat(2)) {
    const [x,y]=layout.project(point)
    assert.ok(x>=layout.padding && x<=720-layout.padding && y>=layout.padding && y<=300-layout.padding)
  }
  const [a,b]=[[135,35],[135.001,35]].map(layout.project)
  close(b[0]-a[0],.001/360*256*2**layout.zoom); close(b[1],a[1])
})

test('empty and invalid coordinates do not create map URLs or fabricated centres',()=>{
  assert.equal(parcelReportMapLayout([]),null)
  assert.equal(parcelReportMapLayout([polygon([ring(0,0,1,1)])]),null)
  assert.equal(parcelReportMapLayout([polygon([[[135,NaN],[135,35]]])]),null)
})
