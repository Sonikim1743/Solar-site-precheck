import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let viteServer
let PdfToolsPage
let clearPendingImagePlacement

before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: {
      disabled: true,
    },
  })
  const module = await viteServer.ssrLoadModule('/src/components/PdfToolsPage.jsx')
  PdfToolsPage = module.default
  clearPendingImagePlacement = module.clearPendingImagePlacement
})

after(async () => {
  await viteServer?.close()
})

function noop() {}

function renderPdfToolsPage(overrides = {}) {
  const state = {
    drawingConvertStatus: { status: 'idle', message: '' },
    drawingJob: null,
    drawingSelectedPages: [],
    drawingMergeFiles: [],
    drawingMergePreview: true,
    activeDrawingPage: null,
    drawingImageTool: { src: '', annotations: {}, drag: null, selected: null, editDrag: null },
    drawingTextTool: { text: '', size: 28, annotations: {}, selected: null, editDrag: null },
    pdfPreviewView: { zoom: 1, x: 0, y: 0, panMode: false, drag: null },
    drawingPageRotations: {},
    canChooseSaveLocation: true,
    ...overrides.state,
  }

  const actions = {
    switchPage: noop,
    handleDrawingPdfToJpg: noop,
    handleMergePdfFiles: noop,
    handleImageFilesToPdf: noop,
    setDrawingMergePreview: noop,
    saveMergedDrawingPdfs: noop,
    setDrawingSelectedPages: noop,
    saveSelectedDrawingPages: noop,
    saveSelectedDrawingPagesAsPdf: noop,
    setDrawingTextPosition: noop,
    beginDrawingImageArea: noop,
    updateDrawingImageArea: noop,
    finishDrawingImageArea: noop,
    startDrawingImageMove: noop,
    startDrawingTextMove: noop,
    setDrawingImageTool: noop,
    setDrawingTextTool: noop,
    toggleDrawingPage: noop,
    changePdfPreviewZoom: noop,
    setPdfPreviewView: noop,
    resetPdfPreviewView: noop,
    rotateDrawingPage: noop,
    setActiveDrawingPageNumber: noop,
    loadClipboardImageForPdf: noop,
    changeDrawingTextSize: noop,
    activateTextPlacementMode: noop,
    resetDrawingTextTool: noop,
    resetDrawingImageTool: noop,
    scaleSelectedText: noop,
    deleteSelectedText: noop,
    rotateSelectedImage: noop,
    scaleSelectedImage: noop,
    deleteSelectedImage: noop,
    ...overrides.actions,
  }

  const helpers = {
    activePreviewBoxStyle: () => ({}),
    previewUrlForPage: () => '',
    activePreviewImageStyle: () => ({}),
    isRotatedPreviewReady: () => true,
    activePreviewPointStyle: () => ({}),
    ...overrides.helpers,
  }

  function ArrayLengthHelp() {
    return React.createElement('span', { className: 'help-tooltip' }, '?')
  }

  return renderToStaticMarkup(React.createElement(PdfToolsPage, {
    state,
    actions,
    refs: { activePdfPreviewRef: { current: null } },
    helpers,
    ArrayLengthHelp,
  }))
}

test('PdfToolsPage renders the main PDF workflow actions', () => {
  const html = renderPdfToolsPage()

  assert.match(html, /PDFツール/)
  assert.match(html, /PDFを開く/)
  assert.match(html, /PDFをまとめる/)
  assert.match(html, /画像→PDF/)
  assert.match(html, /PDFを開くか、複数PDFを選択するとページプレビューが表示されます。/)
})

test('PdfToolsPage renders selected page controls when a drawing job exists', () => {
  const html = renderPdfToolsPage({
    state: {
      drawingJob: {
        baseName: 'sample',
        pageCount: 1,
        pages: [{ pageNumber: 1, pageWidth: 100, pageHeight: 140, previewUrl: 'preview.png' }],
      },
      drawingSelectedPages: [1],
      activeDrawingPage: { pageNumber: 1, pageWidth: 100, pageHeight: 140, previewUrl: 'preview.png' },
    },
    helpers: {
      previewUrlForPage: () => 'preview.png',
    },
  })

  assert.match(html, /sample/)
  assert.match(html, /1\/1ページ選択中/)
  assert.match(html, /JPG保存/)
  assert.match(html, /選択ページPDF保存/)
  assert.match(html, /PDF保存は現在の選択順で保存します。/)
  assert.match(html, /注記・画像貼り付け/)
  assert.match(html, /文字入力・初期化/)
})

test('PdfToolsPage switches out of image placement mode when text is entered', () => {
  const current = {
    src: 'data:image/png;base64,test',
    name: 'clipboard',
    aspectRatio: 1,
    opacity: 0.6,
    annotations: { 1: [{ id: 'existing', src: 'old', x: 0.1, y: 0.1, width: 0.2, height: 0.2 }] },
    drag: { pageNumber: 1 },
    selected: { pageNumber: 1, id: 'existing' },
    editDrag: { pageNumber: 1, id: 'existing' },
  }
  const next = clearPendingImagePlacement(current)

  assert.equal(next.src, '')
  assert.equal(next.name, '')
  assert.equal(next.aspectRatio, null)
  assert.equal(next.drag, null)
  assert.equal(next.selected, null)
  assert.equal(next.editDrag, null)
  assert.equal(next.opacity, 0.6)
  assert.deepEqual(next.annotations, current.annotations)
})
