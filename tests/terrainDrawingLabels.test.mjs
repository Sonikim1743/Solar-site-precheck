import test from 'node:test'
import assert from 'node:assert/strict'
import {terrainDrawingLabelFits} from '../src/utils/terrainDrawingLabels.js'
import {layoutTerrainLabels,terrainLabelBounds} from '../src/utils/terrainLabelLayout.js'
const ring=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]]
test('full label boxes cannot cross a hole even when all four corners are inside',()=>{
 const boundary=[[ring(0,0,200,200),ring(90,90,110,110)]]
 assert.equal(terrainDrawingLabelFits({left:80,top:80,right:120,bottom:120},boundary),false)
 assert.equal(terrainDrawingLabelFits({left:20,top:20,right:70,bottom:70},boundary),true)
 assert.equal(terrainDrawingLabelFits({left:-1,top:20,right:70,bottom:70},boundary),false)
})
test('drawing label placement moves around holes, retains source anchors and lists impossible labels',()=>{
 const boundary=[[ring(0,0,200,200),ring(90,90,110,110)]]
 const output=layoutTerrainLabels([{id:'a',number:'123',screen:[100,100]}],{left:0,top:0,right:200,bottom:200},box=>terrainDrawingLabelFits(box,boundary))
 assert.equal(output.labels.length,1);assert.deepEqual(output.labels[0].anchorScreen,[100,100]);assert.equal(output.labels[0].displaced,true)
 assert.equal(terrainDrawingLabelFits(terrainLabelBounds('123',output.labels[0].screen),boundary),true)
 assert.equal(layoutTerrainLabels([{id:'b',number:'456',screen:[100,100]}],{left:0,top:0,right:200,bottom:200},()=>false).unplaced.length,1)
})
