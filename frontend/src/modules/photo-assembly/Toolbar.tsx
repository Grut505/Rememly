import { Button } from '../../ui/Button'

interface ToolbarProps {
  onAddPhoto: () => void
  onValidate: () => void
  onCancel: () => void
  isValid: boolean
}

export function Toolbar({
  onAddPhoto,
  onValidate,
  onCancel,
  isValid,
}: ToolbarProps) {
  return (
    <div className="bg-white border-t border-gray-200 p-4 space-y-2">
      <Button onClick={onAddPhoto} variant="secondary" fullWidth>
        Add Photo
      </Button>
      <Button onClick={onValidate} disabled={!isValid} fullWidth>
        Validate Assembly
      </Button>
      <Button onClick={onCancel} variant="secondary" fullWidth>
        Cancel
      </Button>
    </div>
  )
}
