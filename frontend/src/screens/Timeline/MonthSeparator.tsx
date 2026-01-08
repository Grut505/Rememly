interface MonthSeparatorProps {
  monthYear: string
}

export function MonthSeparator({ monthYear }: MonthSeparatorProps) {
  return (
    <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 sticky top-[53px] z-5">
      <h2 className="text-lg font-semibold text-gray-700">{monthYear}</h2>
    </div>
  )
}
