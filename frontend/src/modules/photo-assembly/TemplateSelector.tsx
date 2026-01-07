import { Template, TEMPLATES } from './templates'

interface TemplateSelectorProps {
  selectedTemplateId: string
  onSelect: (template: Template) => void
}

export function TemplateSelector({
  selectedTemplateId,
  onSelect,
}: TemplateSelectorProps) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Select Layout
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            className={`aspect-square border-2 rounded-lg p-2 transition-colors touch-manipulation ${
              template.id === selectedTemplateId
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="text-xs text-center font-medium text-gray-700">
              {template.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
