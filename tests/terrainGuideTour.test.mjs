import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceTerrainGuide,
  terrainGuideStartingStep,
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

test('starting the tour skips completed prerequisites and leaves the 3D controls discoverable', () => {
  const cases = [
    [{}, 0],
    [{ draftSelected: true }, 1],
    [{ confirmedSelection: true }, 2],
    [{ analyzing: true }, 2],
    [{ confirmedSelection: true, analyzing: true }, 2],
    [{ confirmedSelection: true, hasTerrain: true }, 3],
    [{ confirmedSelection: true, hasTerrain: true, hasLayout: true }, 3],
    [{ confirmedSelection: true, hasTerrain: true, hasLayout: true, modulesVisible: true }, 4],
    [{ draftSelected: true, confirmedSelection: true, hasTerrain: true, modulesVisible: true }, 1],
  ]
  for (const [status, expected] of cases) {
    assert.equal(terrainGuideStartingStep(status), expected, JSON.stringify(status))
  }
})

test('only the current tutorial action advances the guide and finishing reaches the end', () => {
  const actions = [
    'parcel-selected',
    'parcel-confirmed',
    'terrain-ready',
    'modules-shown',
    'slope-changed',
    'results-opened',
  ]
  assert.equal(advanceTerrainGuide(null, 'parcel-selected'), null)
  for (const [step, expectedAction] of actions.entries()) {
    for (const action of [...actions, 'unrelated-action']) {
      assert.equal(advanceTerrainGuide(step, action), step + Number(action === expectedAction), action)
    }
  }
})
