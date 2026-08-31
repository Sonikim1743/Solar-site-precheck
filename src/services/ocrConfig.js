// Paths must match build/ocrAssets.js. All OCR resources are served by this app.
export const NEDO_OCR_OPTIONS = Object.freeze({
  workerPath: '/ocr/tesseract-7/worker.min.js',
  corePath: '/ocr/tesseract-7',
  langPath: '/ocr/eng-1/4.0.0_best_int',
  workerBlobURL: true,
  gzip: true,
})
