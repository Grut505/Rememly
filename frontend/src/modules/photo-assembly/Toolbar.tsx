import { Button } from '../../ui/Button'

interface ToolbarProps {
  onAddPhoto: () => void
  onValidate: () => void
  onCancel: () => void
  onOpenZones: () => void
  isValid: boolean
}

export function Toolbar({
  onAddPhoto,
  onValidate,
  onCancel,
  onOpenZones,
  isValid,
}: ToolbarProps) {
  return (
    <div className="bg-white border-t border-gray-200 p-4 space-y-2">
      <Button onClick={onAddPhoto} variant="secondary" fullWidth>
        Ajouter des photos
      </Button>
      <Button onClick={onOpenZones} variant="secondary" fullWidth>
        Zones
      </Button>
      <Button onClick={onValidate} disabled={!isValid} fullWidth>
        Valider l'assemblage
      </Button>
      <Button onClick={onCancel} variant="secondary" fullWidth>
        Annuler
      </Button>
    </div>
  )
}
