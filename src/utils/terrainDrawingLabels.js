import polygonClipping from 'polygon-clipping'
import { terrainPolygonArea } from './terrainSlopeDistribution.js'

// Test the entire text halo rectangle, including holes and concave edges.
// Checking only its centre or corners can leak glyphs across an excluded area.
export function terrainDrawingLabelFits(box, boundary) {
  const {left,top,right,bottom}=box
  if (![left,top,right,bottom].every(Number.isFinite) || right<=left || bottom<=top) return false
  const rectangle=[[[[left,top],[right,top],[right,bottom],[left,bottom],[left,top]]]]
  return terrainPolygonArea(polygonClipping.difference(rectangle,boundary)) <= 1e-6
}
