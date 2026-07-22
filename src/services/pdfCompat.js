import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

export function isMobileSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const vendor = navigator.vendor || ''
  const isApple = /Apple/.test(vendor) || /iPad|iPhone|iPod/.test(ua)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isApple && isSafari
}

export function pdfLoadOptions(data, options = {}) {
  const mobileSafari = isMobileSafari()
  return {
    data,
    isOffscreenCanvasSupported: false,
    useWorkerFetch: false,
    isImageDecoderSupported: false,
    useWasm: !mobileSafari,
    disableFontFace: mobileSafari,
    useSystemFonts: !mobileSafari,
    ...options,
  }
}

export async function configurePdfJs() {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  if (!isMobileSafari()) return
  if (globalThis.pdfjsWorker?.WorkerMessageHandler) return

  try {
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
    globalThis.pdfjsWorker = {
      WorkerMessageHandler: workerModule.WorkerMessageHandler,
    }
  } catch {
    // If this preload fails, PDF.js will still try its normal worker fallback path.
  }
}
