interface MonthSeparatorProps {
  monthYear: string
  count: number
}

export function MonthSeparator({ monthYear, count }: MonthSeparatorProps) {
  return (
    <div className="bg-gray-100 px-4 pt-3 pb-2 sticky top-[108px] z-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">{monthYear}</h2>
        <span className="text-xs font-medium text-gray-600 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5">
          {count}
        </span>
      </div>
    </div>
  )
}
