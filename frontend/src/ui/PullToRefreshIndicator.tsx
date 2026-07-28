interface PullToRefreshIndicatorProps {
  pullDistance: number
  isPulling: boolean
  isRefreshing: boolean
  pullThreshold: number
}

export function PullToRefreshIndicator({
  pullDistance,
  isPulling,
  isRefreshing,
  pullThreshold,
}: PullToRefreshIndicatorProps) {
  if (pullDistance <= 0 && !isRefreshing) return null

  return (
    <div
      className="absolute left-0 right-0 flex items-center justify-center pointer-events-none"
      style={{
        top: 0,
        transform: `translateY(${Math.min(pullDistance, 80)}px)`,
        transition: isPulling ? 'none' : 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease',
        opacity: Math.min(1, pullDistance / 40),
        zIndex: 5,
      }}
    >
      <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-full shadow-sm border border-gray-200">
        <div className="relative w-6 h-6">
          <svg className="absolute inset-0 w-6 h-6 text-gray-200" viewBox="0 0 36 36">
            <path
              d="M18 2.0845
                 a 15.9155 15.9155 0 0 1 0 31.831
                 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
          </svg>
          <svg
            className={`absolute inset-0 w-6 h-6 ${isRefreshing ? 'animate-spin text-primary-600' : 'text-primary-600'}`}
            viewBox="0 0 36 36"
            style={{
              transform: `rotate(-90deg)`,
              transformOrigin: '50% 50%',
              strokeDasharray: `${Math.min(100, (pullDistance / pullThreshold) * 100)}, 100`,
              transition: 'stroke-dasharray 120ms ease',
            }}
          >
            <path
              d="M18 2.0845
                 a 15.9155 15.9155 0 0 1 0 31.831
                 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center transition-transform ${pullDistance >= pullThreshold ? 'rotate-180' : ''}`}>
            <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'hidden' : 'block'} text-primary-700`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M12 5v14m0 0l-5-5m5 5l5-5"></path>
            </svg>
            <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'block' : 'hidden'} text-primary-700`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </div>
        </div>
        <span className="text-xs text-gray-600">
          {isRefreshing ? 'Refreshing...' : (pullDistance >= pullThreshold ? 'Release to refresh' : 'Pull to refresh')}
        </span>
      </div>
    </div>
  )
}
