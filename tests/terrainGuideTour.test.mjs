import assert from 'node:assert/strict'
import test from 'node:test'
import {
  terrainGuideConditions,
  terrainGuideStartingStep,
  terrainGuideStepsFor,
  TERRAIN_GUIDE_STEPS,
} from '../src/utils/terrainGuideTour.js'

test('the terrain tour provides six guided steps with a real target at each step', () => {
  assert.equal(TERRAIN_GUIDE_STEPS.length, 6)
  for (const { anchor, message } of TERRAIN_GUIDE_STEPS) {
    const targets = Array.isArray(anchor) ? anchor : [anchor]
    assert.ok(targets.length > 0 && targets.every(target => typeof target === 'string' && target.length))
    assert.match(message, /[ぁ-んァ-ヶ一-龠]/)
  }
})

test('a pending selection, an open panel and finished analysis unlock distinct steps', () => {
  const cases = [
    [{}, 0],
    [{ parcelSelected: true, pendingSelection: true }, 1],
    [{ parcelSelected: true, panelOpen: false, analyzing: true }, 1],
    [{ parcelSelected: true, panelOpen: true }, 1],
    [{ parcelSelected: true, panelOpen: true, analyzing: true }, 2],
    [{ parcelSelected: true, panelOpen: true, hasTerrain: true }, 3],
    [{ parcelSelected: true, panelOpen: true, hasTerrain: true, modulesVisible: true }, 4],
  ]
  for (const [snapshot, expected] of cases) {
    assert.equal(terrainGuideStartingStep(terrainGuideConditions(snapshot)), expected, JSON.stringify(snapshot))
  }
})

test('the next unfinished condition can skip a later action already completed by the user', () => {
  const analysis = { parcelSelected: true, panelOpen: true, hasTerrain: true }
  const conditions = terrainGuideConditions({ ...analysis, slopeChanged: true, reportOpen: true })
  assert.deepEqual(conditions, [true, true, true, false, true, true])
  assert.equal(terrainGuideStartingStep(conditions), 3)
  assert.equal(terrainGuideStartingStep(conditions, 4), 5)
  assert.equal(terrainGuideStartingStep(conditions, 5), 5)
  assert.equal(terrainGuideStartingStep(Array(6).fill(true)), 5, 'completion remains an explicit action')
})

test('areas without public parcel data get import-or-draw guidance and a direct terrain step', () => {
  const steps = terrainGuideStepsFor({ noPublicData: true, draftFlow: false })
  assert.equal(steps.length, 6)
  assert.match(steps[0].message, /収録されていない/)
  assert.match(steps[0].message, /範囲を描く/)
  assert.match(steps[1].message, /地形を確認/)
  assert.equal(steps[2], TERRAIN_GUIDE_STEPS[2])
  for (const { anchor, message } of steps) {
    const targets = Array.isArray(anchor) ? anchor : [anchor]
    assert.ok(targets.length > 0 && targets.every(target => typeof target === 'string' && target.length))
    assert.match(message, /[ぁ-んァ-ヶ一-龠]/)
  }
})

test('the default tour steps are unchanged for the map-parcel draft flow', () => {
  assert.deepEqual(terrainGuideStepsFor(), [...TERRAIN_GUIDE_STEPS])
  assert.deepEqual(terrainGuideStepsFor({ noPublicData: false, draftFlow: true }), [...TERRAIN_GUIDE_STEPS])
  const drawnOnly = terrainGuideStepsFor({ noPublicData: false, draftFlow: false })
  assert.equal(drawnOnly[0], TERRAIN_GUIDE_STEPS[0])
  assert.notEqual(drawnOnly[1], TERRAIN_GUIDE_STEPS[1])
})
