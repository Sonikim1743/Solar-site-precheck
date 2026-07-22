import { useRef, useState } from 'react'

export const initialDrawingTextTool = {
  text: '',
  size: 28,
  opacity: 1,
  annotations: {},
  selected: null,
  editDrag: null,
}

export const initialDrawingImageTool = {
  src: '',
  name: '',
  aspectRatio: null,
  opacity: 1,
  annotations: {},
  drag: null,
  selected: null,
  editDrag: null,
}

export function initialPdfPreviewView() {
  return { zoom: 1, x: 0, y: 0, panMode: false, drag: null }
}

export default function usePdfToolState() {
  const [drawingConvertStatus, setDrawingConvertStatus] = useState({ status: 'idle', message: '' })
  const [drawingJob, setDrawingJob] = useState(null)
  const [drawingSelectedPages, setDrawingSelectedPages] = useState([])
  const [activeDrawingPageNumber, setActiveDrawingPageNumber] = useState(null)
  const [pdfPreviewView, setPdfPreviewView] = useState(initialPdfPreviewView)
  const activePdfPreviewRef = useRef(null)
  const [activePdfPreviewSize, setActivePdfPreviewSize] = useState({ width: 0, height: 0 })
  const [drawingPageRotations, setDrawingPageRotations] = useState({})
  const [drawingRotatedPreviews, setDrawingRotatedPreviews] = useState({})
  const [drawingTextTool, setDrawingTextTool] = useState(initialDrawingTextTool)
  const [drawingImageTool, setDrawingImageTool] = useState(initialDrawingImageTool)
  const [drawingMergeFiles, setDrawingMergeFiles] = useState([])
  const [drawingMergePreview, setDrawingMergePreview] = useState(true)
  const [drawingPanelOpen, setDrawingPanelOpen] = useState(false)

  return {
    drawingConvertStatus,
    setDrawingConvertStatus,
    drawingJob,
    setDrawingJob,
    drawingSelectedPages,
    setDrawingSelectedPages,
    activeDrawingPageNumber,
    setActiveDrawingPageNumber,
    pdfPreviewView,
    setPdfPreviewView,
    activePdfPreviewRef,
    activePdfPreviewSize,
    setActivePdfPreviewSize,
    drawingPageRotations,
    setDrawingPageRotations,
    drawingRotatedPreviews,
    setDrawingRotatedPreviews,
    drawingTextTool,
    setDrawingTextTool,
    drawingImageTool,
    setDrawingImageTool,
    drawingMergeFiles,
    setDrawingMergeFiles,
    drawingMergePreview,
    setDrawingMergePreview,
    drawingPanelOpen,
    setDrawingPanelOpen,
  }
}
