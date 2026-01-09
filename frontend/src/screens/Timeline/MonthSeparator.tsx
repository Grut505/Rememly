interface MonthSeparatorProps {
  monthYear: string
}

export function MonthSeparator({ monthYear }: MonthSeparatorProps) {
  return (
    <div className="bg-gray-100 px-4 pt-3 pb-2 sticky top-[108px] z-10">
      <h2 className="text-lg font-semibold text-gray-700">{monthYear}</h2>
    </div>
  )
}
