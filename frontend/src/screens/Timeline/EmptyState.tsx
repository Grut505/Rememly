export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-6xl mb-4">📸</div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        No articles yet
      </h2>
      <p className="text-gray-600">
        Tap the + button to create your first photo article
      </p>
    </div>
  )
}
