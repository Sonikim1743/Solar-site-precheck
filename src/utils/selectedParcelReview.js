import {isMapParcel} from './mapParcelSelection.js'

// A map selection starts a separate simulation scope. Other imported targets,
// the detailed boundary and exclusions remain in the user's original review.
// When no map-reference targets exist, preserve the original all-target flow.
export function selectedParcelUnionReview(review) {
  const selected=(review?.parcels||[]).filter(p=>p.role==='target'&&isMapParcel(p))
  return {...review,parcels:selected.length?selected:review.parcels,boundary:null,exclusions:[]}
}
