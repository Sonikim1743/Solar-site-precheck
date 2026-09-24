const pageHashes = {
  solar: '#site-select', generation: '#solar-generation', review: '#site-review',
  report: '#report-section', resources: '#use-cases', power: '#power-grid',
  pdf: '#pdf-tools', inheritance: '#inheritance-check',
}

export function pageFromHash(hash = '') {
  if (hash === '#solar-generation') return 'generation'
  if (hash === '#power-grid') return 'power'
  if (hash === '#pdf-tools') return 'pdf'
  if (hash === '#inheritance-check') return 'inheritance'
  return 'solar'
}

export function hashForPage(page) { return pageHashes[page] || pageHashes.solar }
