import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { LoadingScreen } from '../../ui/Spinner'
import { useUiStore } from '../../state/uiStore'
import { AppHeader } from '../../ui/AppHeader'
import { configApi } from '../../api/config'

export function Settings() {
  const navigate = useNavigate()
  const { showToast } = useUiStore()

  const [familyName, setFamilyName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const result = await configApi.get('family_name')
      setFamilyName(result.value || '')
    } catch (error) {
      showToast('Erreur lors du chargement', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await configApi.set('family_name', familyName.trim())
      showToast('Configuration sauvegardée', 'success')
      navigate('/')
    } catch (error) {
      showToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <LoadingScreen message="Chargement..." />
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />

      {/* Subheader */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-14 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
          >
            <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M15 19l-7-7 7-7"></path>
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Paramètres</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 pb-32 max-w-md mx-auto w-full">
        {/* Family Name */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Page de couverture PDF</h3>
          <Input
            label="Nom de la famille"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Ex: Famille Dupont"
          />
          <p className="text-xs text-gray-500 mt-2">
            Apparaîtra sur la couverture : "Livre de souvenirs de {familyName || '...'}"
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4 sticky bottom-0">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          fullWidth
        >
          {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  )
}
