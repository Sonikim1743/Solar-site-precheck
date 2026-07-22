export function clearPendingImagePlacement(current) {
  return {
    ...current,
    src: '',
    name: '',
    aspectRatio: null,
    drag: null,
    selected: null,
    editDrag: null,
  }
}

export default function PdfToolsPage({
  state,
  actions,
  refs,
  helpers,
}) {
  const {
    drawingConvertStatus,
    drawingJob,
    drawingSelectedPages,
    drawingMergeFiles,
    drawingMergePreview,
    activeDrawingPage,
    drawingImageTool,
    drawingTextTool,
    pdfPreviewView,
    drawingPageRotations,
    selectedImageOpacity,
    selectedTextOpacity,
    canChooseSaveLocation,
  } = state

  const {
    switchPage,
    handleDrawingPdfToJpg,
    handleMergePdfFiles,
    handleImageFilesToPdf,
    setDrawingMergePreview,
    saveMergedDrawingPdfs,
    setDrawingSelectedPages,
    saveSelectedDrawingPages,
    saveSelectedDrawingPagesAsPdf,
    setDrawingTextPosition,
    beginDrawingImageArea,
    updateDrawingImageArea,
    finishDrawingImageArea,
    startDrawingImageMove,
    startDrawingImageResize,
    startDrawingTextMove,
    setDrawingImageTool,
    setDrawingTextTool,
    toggleDrawingPage,
    changePdfPreviewZoom,
    setPdfPreviewView,
    resetPdfPreviewView,
    rotateDrawingPage,
    setActiveDrawingPageNumber,
    loadClipboardImageForPdf,
    changeDrawingTextSize,
    activateTextPlacementMode,
    resetDrawingTextTool,
    resetDrawingImageTool,
    scaleSelectedText,
    changeSelectedTextOpacity,
    deleteSelectedText,
    rotateSelectedImage,
    scaleSelectedImage,
    changeSelectedImageOpacity,
    deleteSelectedImage,
  } = actions

  const { activePdfPreviewRef } = refs

  const {
    activePreviewBoxStyle,
    previewUrlForPage,
    activePreviewImageStyle,
    isRotatedPreviewReady,
    activePreviewPointStyle,
  } = helpers

  return (
    <section className="inheritance-section panel inheritance-section--standalone pdf-tool-page" id="pdf-tools">
      <div className="inheritance-page-heading">
        <div className="section-heading">
          <div className="step-number">PDF</div>
          <div>
            <div className="heading-with-help">
              <h2>PDFツール</h2>
              <span className="help-tooltip help-tooltip--below" tabIndex="0" aria-label="PDF作業の基本順序。PDFを開く、ページ向きを決める、文字・画像を配置、保存。">
                ?
                <span className="help-tooltip__body" role="tooltip">
                  基本順序：PDFを開く → ページ向きを決める → 文字・画像を配置 → 保存。<br />
                  回転すると、そのページの注記・貼り付け画像は安全のためクリアされます。
                </span>
              </span>
            </div>
            <p>複数PDFのページ選択、1つのPDFへの保存、ページ回転、注記・クリップボード画像の貼り付けを行います。</p>
          </div>
        </div>
        <button type="button" className="secondary-button" onClick={() => switchPage('solar')}>
          太陽光チェックへ戻る
        </button>
      </div>

      <div className="pdf-tool-panel">
        <div className="privacy-note">
          <strong>PDF作業はブラウザ内で処理</strong>
          <span>図面や社内資料を外部サイトへ送らず、選択ページだけをまとめて保存できます。大容量PDFでは処理に時間がかかる場合があります。</span>
        </div>

        <div className="pdf-tool-actions">
          <label className="utility-button">
            PDFを開く
            <input type="file" accept="application/pdf,.pdf" onChange={handleDrawingPdfToJpg} />
          </label>
          <label className="utility-button utility-button--soft">
            PDFをまとめる
            <input type="file" accept="application/pdf,.pdf" multiple onChange={handleMergePdfFiles} />
          </label>
          <label className="utility-button utility-button--soft">
            画像→PDF
            <input type="file" accept="image/*,.jpg,.jpeg,.png,.webp" multiple onChange={handleImageFilesToPdf} />
          </label>
          <label className="pdf-tool-toggle">
            <input
              type="checkbox"
              checked={drawingMergePreview}
              onChange={(event) => setDrawingMergePreview(event.target.checked)}
            />
            <span>複数PDFもプレビューして必要ページだけ選ぶ</span>
          </label>
          {drawingMergeFiles.length >= 2 && !drawingMergePreview && (
            <button
              type="button"
              className="utility-button"
              disabled={drawingConvertStatus.status === 'loading'}
              onClick={saveMergedDrawingPdfs}
            >
              PDFまとめ保存
            </button>
          )}
        </div>

        {drawingConvertStatus.message && (
          <p className={`utility-message utility-message--${drawingConvertStatus.status}`}>
            {drawingConvertStatus.message}
          </p>
        )}

        {drawingJob ? (
          <div className="drawing-converter drawing-converter--pdf-tool">
            <div className="drawing-converter__toolbar">
              <strong>{drawingJob.baseName}</strong>
              <span>{drawingSelectedPages.length}/{drawingJob.pageCount}ページ選択中</span>
              <small className="pdf-order-note">PDF保存は現在の選択順で保存します。</small>
              <button type="button" onClick={() => setDrawingSelectedPages(drawingJob.pages.map((page) => page.pageNumber))}>選択</button>
              <button type="button" onClick={() => setDrawingSelectedPages([])}>選択解除</button>
              <button type="button" disabled={!drawingSelectedPages.length || drawingConvertStatus.status === 'loading'} onClick={() => saveSelectedDrawingPages({ chooseLocation: canChooseSaveLocation })}>
                JPG保存
              </button>
              <button type="button" disabled={!drawingSelectedPages.length || drawingConvertStatus.status === 'loading'} onClick={() => saveSelectedDrawingPagesAsPdf({ chooseLocation: canChooseSaveLocation })}>
                選択ページPDF保存
              </button>
            </div>

            <div className="pdf-workbench">
              <div className="pdf-workbench__main">
                {activeDrawingPage && (() => {
                  const page = activeDrawingPage
                  const drag = drawingImageTool.drag?.pageNumber === page.pageNumber ? drawingImageTool.drag : null
                  const dragStyle = drag
                    ? activePreviewBoxStyle(page, {
                        x: Math.min(drag.startX, drag.currentX),
                        y: Math.min(drag.startY, drag.currentY),
                        width: Math.abs(drag.currentX - drag.startX),
                        height: Math.abs(drag.currentY - drag.startY),
                      })
                    : null
                  return (
                    <div className="pdf-active-page">
                      <div className="pdf-active-page__head">
                        <div>
                          <strong>{page.sourceName ? `${page.sourceName} / ` : ''}{page.sourcePageNumber || page.pageNumber}ページ</strong>
                          <span>先にページ向きを決めてから、文字・画像を配置してください。回転するとこのページの注記はクリアされます。</span>
                        </div>
                        <label className="pdf-active-page__check">
                          <input type="checkbox" checked={drawingSelectedPages.includes(page.pageNumber)} onChange={() => toggleDrawingPage(page.pageNumber)} />
                          保存対象
                        </label>
                      </div>
                      <div
                        ref={activePdfPreviewRef}
                        className={`pdf-active-page__preview drawing-page-card__preview ${drawingImageTool.src ? 'drawing-page-card__preview--image-mode' : ''} ${pdfPreviewView.panMode ? 'pdf-active-page__preview--pan' : ''}`}
                        onClick={(event) => { if (!drawingImageTool.src) setDrawingTextPosition(page, event) }}
                        onMouseDown={(event) => beginDrawingImageArea(page, event)}
                        onMouseMove={(event) => updateDrawingImageArea(page, event)}
                        onMouseUp={(event) => finishDrawingImageArea(page, event)}
                        onMouseLeave={(event) => {
                          if (
                            drawingImageTool.drag?.pageNumber === page.pageNumber ||
                            drawingImageTool.editDrag?.pageNumber === page.pageNumber ||
                            drawingTextTool.editDrag?.pageNumber === page.pageNumber ||
                            pdfPreviewView.drag
                          ) finishDrawingImageArea(page, event)
                        }}
                      >
                        <img
                          className="pdf-active-page__image"
                          src={previewUrlForPage(page)}
                          alt={`${page.pageNumber}ページの大きいプレビュー`}
                          style={activePreviewImageStyle(page)}
                        />
                        {!isRotatedPreviewReady(page) && (
                          <div className="pdf-active-page__preparing">
                            回転プレビューを作成中…
                          </div>
                        )}
                        {(drawingImageTool.annotations[page.pageNumber] || []).map((annotation) => {
                          const selected = drawingImageTool.selected?.pageNumber === page.pageNumber && drawingImageTool.selected?.id === annotation.id
                          return (
                          <span
                            key={annotation.id}
                            className={`drawing-page-card__image-marker ${selected ? 'drawing-page-card__image-marker--selected' : ''}`}
                            onMouseDown={(event) => startDrawingImageMove(page, annotation, event)}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setDrawingImageTool((current) => ({ ...current, selected: { pageNumber: page.pageNumber, id: annotation.id } }))
                              setDrawingTextTool((current) => ({ ...current, selected: null, editDrag: null }))
                            }}
                            style={{
                              ...activePreviewBoxStyle(page, annotation),
                              transform: `rotate(${annotation.rotation || 0}deg)`,
                            }}
                          >
                            <img
                              src={annotation.src}
                              alt=""
                              draggable="false"
                              style={{
                                opacity: Number.isFinite(annotation.opacity) ? annotation.opacity : 1,
                              }}
                            />
                            {selected && (
                              <span
                                className="drawing-page-card__image-resize-handle"
                                title="比率を保って拡大・縮小"
                                onMouseDown={(event) => startDrawingImageResize(page, annotation, event)}
                              />
                            )}
                          </span>
                          )
                        })}
                        {(drawingTextTool.annotations[page.pageNumber] || []).map((annotation) => (
                          <span
                            key={annotation.id}
                            className={`drawing-page-card__text-marker ${drawingTextTool.selected?.pageNumber === page.pageNumber && drawingTextTool.selected?.id === annotation.id ? 'drawing-page-card__text-marker--selected' : ''}`}
                            onMouseDown={(event) => startDrawingTextMove(page, annotation, event)}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setDrawingTextTool((current) => ({ ...current, selected: { pageNumber: page.pageNumber, id: annotation.id } }))
                              setDrawingImageTool((current) => ({ ...current, selected: null, editDrag: null }))
                            }}
                            style={{
                              ...activePreviewPointStyle(page, annotation),
                              '--text-marker-scale': `${Math.max(1, Math.min(2.3, (annotation.size ?? drawingTextTool.size) / 28))}`,
                              opacity: Number.isFinite(annotation.opacity) ? annotation.opacity : 1,
                            }}
                          >
                            {annotation.text}
                          </span>
                        ))}
                        {dragStyle && <span className="drawing-page-card__drag-rect" style={dragStyle}></span>}
                      </div>
                      <div className="pdf-active-page__controls">
                        <button type="button" onClick={() => changePdfPreviewZoom(-0.2)}>−</button>
                        <span className="pdf-active-page__zoom">{Math.round(pdfPreviewView.zoom * 100)}%</span>
                        <button type="button" onClick={() => changePdfPreviewZoom(0.2)}>＋</button>
                        <button type="button" className={pdfPreviewView.panMode ? 'is-active' : ''} onClick={() => setPdfPreviewView((current) => ({ ...current, panMode: !current.panMode, drag: null }))}>移動</button>
                        <button type="button" onClick={resetPdfPreviewView}>表示リセット</button>
                        <button type="button" onClick={() => rotateDrawingPage(page.pageNumber, -90)}>↺ 左90°</button>
                        <button type="button" onClick={() => rotateDrawingPage(page.pageNumber, 90)}>↻ 右90°</button>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="pdf-workbench__side">
                <div className="pdf-workbench__side-title">
                  <strong>ページ一覧</strong>
                  <span>クリックで左に表示</span>
                </div>
                <div className="drawing-page-grid drawing-page-grid--wide">
                  {drawingJob.pages.map((page) => (
                  <label className={`drawing-page-card ${drawingSelectedPages.includes(page.pageNumber) ? 'drawing-page-card--selected' : ''} ${activeDrawingPage?.pageNumber === page.pageNumber ? 'drawing-page-card--active' : ''}`} key={page.pageNumber} onClick={() => setActiveDrawingPageNumber(page.pageNumber)}>
                    <input type="checkbox" checked={drawingSelectedPages.includes(page.pageNumber)} onChange={() => toggleDrawingPage(page.pageNumber)} />
                    <span>{page.sourceName ? `${page.sourceName} / ` : ''}{page.sourcePageNumber || page.pageNumber}ページ / 回転 {drawingPageRotations[page.pageNumber] || 0}°</span>
                    <div className="drawing-page-card__preview">
                      <img
                        src={previewUrlForPage(page)}
                        alt={`${page.pageNumber}ページのプレビュー`}
                      />
                    </div>
                    <div className="drawing-page-card__rotate">
                      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); rotateDrawingPage(page.pageNumber, -90) }}>↺ 左90°</button>
                      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); rotateDrawingPage(page.pageNumber, 90) }}>↻ 右90°</button>
                    </div>
                  </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="drawing-text-tool drawing-text-tool--pdf">
              <div>
                <strong>注記・画像貼り付け</strong>
                <span>文字は入力後にページをクリック。画像はクリップボードから読み込み、貼り付けたい範囲をドラッグします。</span>
              </div>
              <textarea
                value={drawingTextTool.text}
                onChange={(event) => {
                  const nextText = event.target.value
                  setDrawingTextTool((current) => ({ ...current, text: nextText }))
                  if (nextText.trim()) {
                    setDrawingImageTool(clearPendingImagePlacement)
                  }
                }}
                placeholder={'例：確認済 / 要差替 / 2026.07.15\n複数行も入力できます'}
                rows="2"
              />
              <label>
                文字サイズ
                <select
                  value={drawingTextTool.size}
                  onChange={(event) => changeDrawingTextSize(Number(event.target.value))}
                >
                  <option value="20">小</option>
                  <option value="28">標準</option>
                  <option value="38">大</option>
                  <option value="52">特大</option>
                </select>
              </label>
              <button type="button" onClick={loadClipboardImageForPdf}>画像読込</button>
              <button type="button" onClick={activateTextPlacementMode}>文字入力・初期化</button>
              <button type="button" onClick={resetDrawingImageTool}>画像クリア</button>
            </div>
            <div className="drawing-image-edit-tool drawing-text-edit-tool">
              <div>
                <strong>選択文字の調整</strong>
                <span>配置した文字をクリックして選択。文字をドラッグすると位置を動かせます。</span>
              </div>
              <button type="button" onClick={() => scaleSelectedText(0.88)} disabled={!drawingTextTool.selected}>縮小</button>
              <button type="button" onClick={() => scaleSelectedText(1.14)} disabled={!drawingTextTool.selected}>拡大</button>
              <label className="drawing-opacity-control">
                透明度
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={Math.round((Number.isFinite(selectedTextOpacity) ? selectedTextOpacity : 1) * 100)}
                  onChange={(event) => changeSelectedTextOpacity(Number(event.target.value) / 100)}
                />
                <span>{Math.round((Number.isFinite(selectedTextOpacity) ? selectedTextOpacity : 1) * 100)}%</span>
              </label>
              <button type="button" onClick={deleteSelectedText} disabled={!drawingTextTool.selected}>削除</button>
            </div>
            <div className="drawing-image-edit-tool">
              <div>
                <strong>選択画像の調整</strong>
                <span>貼り付けた画像をクリックして選択。画像をドラッグすると位置を動かせます。</span>
              </div>
              <button type="button" onClick={() => rotateSelectedImage(-90)}>↺ 90°</button>
              <button type="button" onClick={() => rotateSelectedImage(90)}>↻ 90°</button>
              <button type="button" onClick={() => scaleSelectedImage(0.9)}>縮小</button>
              <button type="button" onClick={() => scaleSelectedImage(1.1)}>拡大</button>
              <label className="drawing-opacity-control">
                透明度
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={Math.round((Number.isFinite(selectedImageOpacity) ? selectedImageOpacity : 1) * 100)}
                  onChange={(event) => changeSelectedImageOpacity(Number(event.target.value) / 100)}
                />
                <span>{Math.round((Number.isFinite(selectedImageOpacity) ? selectedImageOpacity : 1) * 100)}%</span>
              </label>
              <button type="button" onClick={() => changeSelectedImageOpacity(0.5)} disabled={!drawingImageTool.selected}>50%</button>
              <button type="button" onClick={() => changeSelectedImageOpacity(1)} disabled={!drawingImageTool.selected}>100%</button>
              <button type="button" onClick={deleteSelectedImage}>削除</button>
            </div>
          </div>
        ) : (
          <p className="inline-message">PDFを開くか、複数PDFを選択するとページプレビューが表示されます。</p>
        )}
      </div>
    </section>
  )
}
