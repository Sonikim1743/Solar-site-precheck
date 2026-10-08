import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTerrainSolid } from '../src/utils/terrainSolid.js'

const face = (rings, color = '#abc') => ({ rings, centroid: [0, 0, 10], color })
const square = (x, y, size = 1, z = 10) => [[x,y,z],[x+size,y,z],[x+size,y+size,z],[x,y+size,z]]
const wallLength = wall => Math.hypot(wall.rings[0][1][0] - wall.rings[0][0][0], wall.rings[0][1][1] - wall.rings[0][0][1])
const perimeter = solid => solid.walls.reduce((sum, wall) => sum + wallLength(wall), 0)
const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`)
const ringArea = ring => Math.abs(ring.reduce((sum, a, i) => { const b=ring[(i+1)%ring.length]; return sum+a[0]*b[1]-b[0]*a[1] }, 0)) / 2
const floorArea = solid => solid.floorFaces.reduce((sum, f) => sum + ringArea(f.rings[0]) - f.rings.slice(1).reduce((holes,r) => holes + ringArea(r), 0), 0)

test('a block has only its outside walls and a bottom at the requested display base', () => {
  const input = [face([square(0,0)])], before = structuredClone(input)
  const solid = buildTerrainSolid(input, 2)
  assert.equal(solid.walls.length, 4)
  assert.equal(solid.floorFaces.length, 1)
  close(perimeter(solid), 4)
  close(floorArea(solid), 1)
  for (const wall of solid.walls) { close(wall.centroid[2], 6); assert.equal(wall.kind, 'wall') }
  assert.ok(solid.floorFaces.flatMap(f=>f.rings.flat()).every(p=>p[2]===2))
  assert.deepEqual(input, before)
})

test('shared cell edges disappear regardless of winding, closure or roundoff at a bin boundary', () => {
  const left = square(0,0), right = square(1 + .3e-6,0).reverse()
  right.push([...right[0]])
  const solid = buildTerrainSolid([face([left]),face([right])], 0)
  assert.equal(solid.walls.length, 6)
  close(perimeter(solid), 6, 2e-6)
  assert.equal(solid.walls.filter(w=>w.rings[0].slice(0,2).every(p=>Math.abs(p[0]-1)<1e-6)).length, 0)
})

test('a hole retains its inside walls and is absent from the bottom independent of ring winding', () => {
  const outer = square(0,0,4), hole = square(1,1,2)
  const solid = buildTerrainSolid([face([outer,hole])], 0)
  assert.equal(solid.walls.length, 8)
  assert.equal(solid.floorFaces[0].rings.length, 2)
  close(perimeter(solid), 24)
  close(floorArea(solid), 12)
})

test('a missing DEM cell creates an open hole instead of walls on every retained cell', () => {
  const faces = []
  for (let y=0;y<3;y++) for (let x=0;x<3;x++) if (x!==1 || y!==1) faces.push(face([square(x,y)]))
  const solid = buildTerrainSolid(faces, 0)
  assert.equal(solid.walls.length, 16)
  close(perimeter(solid), 16)
  close(floorArea(solid), 8)
  assert.equal(solid.floorFaces.length, 8)
})

test('long and split collinear shared edges cancel at a T-junction', () => {
  const left = face([[[0,0,10],[1,0,10],[1,2,10],[0,2,10]]])
  const faces = [left,face([square(1,0)]),face([square(1,1).reverse()])]
  const solid = buildTerrainSolid(faces, 0)
  close(perimeter(solid), 8)
  close(floorArea(solid), 4)
  assert.equal(solid.walls.filter(w=>w.rings[0].slice(0,2).every(p=>p[0]===1)).length, 0)
})

test('oblique T-junctions are split and top elevations interpolate without artificial steps', () => {
  const z = ([x,y]) => [x,y,10+x+y]
  const a = face([[[0,0],[2,2],[0,2]].map(z)])
  const b = face([[[0,0],[1,1],[2,0]].map(z)])
  const c = face([[[1,1],[2,2],[2,0]].map(z)])
  const solid = buildTerrainSolid([a,b,c], 0)
  close(perimeter(solid), 8)
  close(floorArea(solid), 4)
  assert.equal(solid.walls.length, 4)
  for (const wall of solid.walls) for (const p of wall.rings[0].slice(0,2)) close(p[2], 10+p[0]+p[1])
})

test('partially shared edges keep only their unshared section, including its interpolated heights', () => {
  const left = face([[[0,0,10],[1,0,10],[1,2,14],[0,2,14]]])
  const right = face([[[1,0,10],[2,0,10],[2,1,12],[1,1,12]]])
  const solid = buildTerrainSolid([left,right], 0)
  const exposed = solid.walls.filter(w=>w.rings[0].slice(0,2).every(p=>p[0]===1))
  assert.equal(exposed.length, 1)
  assert.deepEqual(exposed[0].rings[0].slice(0,2).sort((a,b)=>a[1]-b[1]), [[1,1,12],[1,2,14]])
  close(perimeter(solid), 8)
  close(floorArea(solid), 3)
})

test('separate polygon islands stay separate and all output/depth centroids are finite', () => {
  const solid = buildTerrainSolid([face([square(-20,-20,2)]),face([square(20,20,3)])], -4)
  assert.equal(solid.walls.length, 8)
  close(perimeter(solid), 20)
  close(floorArea(solid), 13)
  for (const f of [...solid.walls,...solid.floorFaces]) {
    assert.ok(f.centroid.every(Number.isFinite))
    assert.ok(f.rings.flat().flat().every(Number.isFinite))
    for (const ring of f.rings) assert.deepEqual(ring[0],ring.at(-1))
  }
})

test('a triangular wall has its area centroid at one third of its height and does not divide by zero', () => {
  const solid = buildTerrainSolid([face([[[0,0,0],[2,0,6],[2,2,6],[0,2,0]]])], 0)
  const wall = solid.walls.find(w=>w.rings[0].slice(0,2).every(p=>p[1]===0))
  close(wall.centroid[0], 4/3)
  close(wall.centroid[2], 2)
  assert.equal(solid.walls.length, 3, 'the edge entirely on the base has no wall')
  assert.equal(buildTerrainSolid([face([square(0,0,1,0)])], 0).walls.length, 0)
})

test('wall normals point away from solid material and into holes for either input winding', () => {
  for (const reverse of [false,true]) {
    const outer=square(0,0,4), hole=square(1,1,2)
    const solid=buildTerrainSolid([face(reverse ? [outer.reverse(),hole.reverse()] : [outer,hole])], 0)
    for (const wall of solid.walls) {
      const [x,y]=wall.centroid, isOuter=x===0 || x===4 || y===0 || y===4
      close(Math.hypot(...wall.normal),1)
      assert.equal(wall.normal[2],0)
      const awayFromCenter=[x-2,y-2]
      const dot=wall.normal[0]*awayFromCenter[0]+wall.normal[1]*awayFromCenter[1]
      assert.ok(isOuter ? dot>0 : dot<0, 'outer walls face away from the island; hole walls face its empty centre')
      const [a,b,c]=wall.rings[0], ab=b.map((v,i)=>v-a[i]), ac=c.map((v,i)=>v-a[i])
      const windingNormal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
      assert.ok(windingNormal.reduce((sum,v,i)=>sum+v*wall.normal[i],0)>0, 'wall ring winding agrees with its shading normal')
    }
    assert.deepEqual(solid.floorFaces[0].normal,[0,0,-1])
  }
})

test('empty input is safe and non-finite or inverted extrusions are rejected', () => {
  assert.deepEqual(buildTerrainSolid([], 0), { walls:[], floorFaces:[] })
  assert.throws(()=>buildTerrainSolid([face([square(0,0)])], 11), /base/)
  assert.throws(()=>buildTerrainSolid([face([[[0,0,10],[1,0,NaN],[0,1,10]]])], 0), /non-finite/)
  assert.throws(()=>buildTerrainSolid([], 0, {epsilon:0}), /tolerance/)
})

test('a regular 10000-cell mesh has only perimeter walls and finishes within a bounded time', () => {
  const faces=[]
  for(let y=0;y<100;y++) for(let x=0;x<100;x++) faces.push(face([square(x*5,y*5,5)]))
  const start=performance.now(), solid=buildTerrainSolid(faces, 0)
  assert.equal(solid.walls.length, 400)
  assert.equal(solid.floorFaces.length, 10000)
  close(perimeter(solid), 2000)
  close(floorArea(solid), 250000)
  assert.ok(performance.now()-start<8000, 'solid extraction must not compare all edge pairs')
})
