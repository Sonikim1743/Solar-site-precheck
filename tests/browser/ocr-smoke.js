import { createWorker, PSM } from 'tesseract.js'
import { NEDO_OCR_OPTIONS } from '../../src/services/ocrConfig.js'

const result = document.querySelector('#result')
const canvas = document.querySelector('#sample')
const context = canvas.getContext('2d')
context.fillStyle = '#fff'
context.fillRect(0, 0, canvas.width, canvas.height)
context.fillStyle = '#000'
context.font = '56px Arial'
context.fillText('52332286 0.27 0.17 0.95', 20, 90)
const violations = []
document.addEventListener('securitypolicyviolation', (event) => violations.push(`${event.violatedDirective}: ${event.blockedURI}`))
document.querySelector('#run').addEventListener('click', async (event) => {
  event.target.disabled = true
  let worker
  try {
    worker = await createWorker('eng', 1, {
      ...NEDO_OCR_OPTIONS,
      cacheMethod: 'none', // Force language download to test CSP on a cold start.
      logger: ({ status }) => { result.textContent = status },
    })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '0123456789. ' })
    const { data } = await worker.recognize(canvas)
    const success = ['52332286', '0.27', '0.17', '0.95'].every((text) => data.text.includes(text)) && !violations.length
    result.textContent = `${success ? 'PASS' : 'FAIL'}\n${data.text}\nCSP violations: ${violations.length}\n${violations.join('\n')}`
  } catch (error) {
    result.textContent = `FAIL: ${error.message}\n${violations.join('\n')}`
  } finally {
    await worker?.terminate()
    event.target.disabled = false
  }
})
