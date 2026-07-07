export default function SolarProPreviewButton({
  label,
  image,
  caption,
  path,
  placement = 'right',
  highlight = '',
}) {
  return (
    <span className={`solarpro-preview solarpro-preview--${placement}`}>
      <button type="button" className="preview-button">{label}</button>
      <span className="preview-popover">
        {path && <span className="preview-path">{path}</span>}
        <span className="preview-image-wrap">
          <img src={image} alt={caption} />
          {highlight === 'location' && (
            <span className="preview-highlight preview-highlight--location">
              <em>ここに入力</em>
            </span>
          )}
        </span>
        <small>{caption}</small>
      </span>
    </span>
  )
}
