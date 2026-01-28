interface MonthSeparatorProps {
  monthYear: string
  count: number
  showPlus?: boolean
}

export function MonthSeparator({ monthYear, count, showPlus }: MonthSeparatorProps) {
  return (
    <div className="bg-gray-100 px-4 pt-3 pb-2 sticky top-[108px] z-10">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold text-gray-700 uppercase">{monthYear}</h2>
        <span className="ml-2 text-xs font-medium text-gray-600 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5">
          {count}{showPlus ? '+' : ''}
        </span>
      </div>
    </div>
  )
}
