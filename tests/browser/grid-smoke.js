import { fetchNearbyPowerGrid } from '../../src/services/powerGrid.js'
const result = document.querySelector('#result')
document.addEventListener('securitypolicyviolation', (event) => { result.textContent += `\nCSP: ${event.violatedDirective} ${event.blockedURI}` })
document.querySelector('#run').addEventListener('click', async () => {
  result.textContent = 'Start'
  try {
    const data = await fetchNearbyPowerGrid(34.9, 133.3, {
      fetchImpl: async (url, options) => {
        result.textContent += `\nRequest: ${url}`
        try {
          const response = await fetch(url, options)
          result.textContent += `\nHTTP ${response.status}, ${response.headers.get('Content-Type')}`
          return response
        } catch (error) { result.textContent += `\n${error.name}: ${error.message}`; throw error }
      },
    })
    result.textContent += `\nPASS: ${data.lines.length} lines, ${data.substations.length} substations`
  } catch (error) { result.textContent += `\nFAIL: ${error.message}` }
})
