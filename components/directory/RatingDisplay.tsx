type RatingDisplayProps = {
  value: number | null
  count?: number
  size?: 'sm' | 'md' | 'lg'
  label?: string
  mutedWhenEmpty?: string
}

function clampRating(value: number) {
  return Math.max(0, Math.min(5, value))
}

export function RatingDisplay({
  value,
  count,
  size = 'md',
  label,
  mutedWhenEmpty,
}: RatingDisplayProps) {
  const safeValue = value === null ? null : clampRating(value)
  const percentage = safeValue === null ? 0 : (safeValue / 5) * 100

  return (
    <div className={`rating-display rating-display-${size}`}>
      {label && <span className="rating-label">{label}</span>}
      <div className="rating-main">
        <span className="rating-stars" aria-hidden="true">
          <span className="rating-stars-base">★★★★★</span>
          <span className="rating-stars-fill" style={{ width: `${percentage}%` }}>
            ★★★★★
          </span>
        </span>
        <span className="rating-value">{safeValue === null ? 'New' : safeValue.toFixed(1)}</span>
        {typeof count === 'number' && <span className="rating-count">({count} reviews)</span>}
      </div>
      {safeValue === null && mutedWhenEmpty && <span className="rating-empty">{mutedWhenEmpty}</span>}
    </div>
  )
}
