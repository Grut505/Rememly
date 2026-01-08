import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { LoadingScreen } from '../../ui/Spinner'
import { useUiStore } from '../../state/uiStore'
import { useProfile } from '../../contexts/ProfileContext'

// Convert Drive URLs to uc?export=view format (avoids 429 rate limiting)
function convertDriveUrl(url: string): string {
  if (!url || url.startsWith('blob:')) return url

  // If already in uc?export=view format, return as-is
  if (url.includes('drive.google.com/uc?') && url.includes('export=view')) {
    return url
  }

  // Extract file ID from various Drive URL formats
  const patterns = [
    /drive\.google\.com\/file\/d\/([^\/]+)/,
    /drive\.google\.com\/uc\?.*[&?]id=([^&]+)/,
    /drive\.google\.com\/open\?.*[&?]id=([^&]+)/,
    /drive\.google\.com\/thumbnail\?id=([^&]+)/,
    /lh3\.googleusercontent\.com\/d\/([^?&=]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=view&id=${match[1]}`
    }
  }

  return url
}

export function Profile() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { showToast } = useUiStore()
  const { profile, isLoading, saveProfile } = useProfile()

  const [pseudo, setPseudo] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setPseudo(profile.pseudo)
      setPreviewUrl(profile.avatar_url)
    } else if (user) {
      setPseudo(user.name)
    }
  }, [profile, user])

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAvatarFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  const handleSave = async () => {
    if (!pseudo.trim()) {
      showToast('Please enter a pseudo', 'error')
      return
    }

    setIsSaving(true)
    try {
      await saveProfile(pseudo.trim(), avatarFile || undefined)
      showToast('Profile saved', 'success')
      navigate('/')
    } catch (error) {
      showToast('Failed to save profile', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = () => {
    logout()
  }

  if (isLoading) {
    return <LoadingScreen message="Loading profile..." />
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center sticky top-0 z-10">
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 touch-manipulation"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold ml-4">Profile</h1>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 pb-32 max-w-md mx-auto w-full">
        {/* Avatar */}
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            {previewUrl ? (
              <img
                src={convertDriveUrl(previewUrl)}
                alt="Avatar"
                className="w-32 h-32 rounded-full object-cover border-4 border-primary-200"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-primary-100 flex items-center justify-center border-4 border-primary-200">
                <span className="text-4xl font-semibold text-primary-600">
                  {pseudo.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
            )}
            <label
              htmlFor="avatar-upload"
              className="absolute bottom-0 right-0 bg-primary-600 text-white p-2 rounded-full cursor-pointer hover:bg-primary-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>
          <p className="text-sm text-gray-600">Click to change avatar</p>
        </div>

        {/* Pseudo */}
        <div>
          <Input
            label="Pseudo"
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder="Enter your pseudo"
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4 space-y-2 sticky bottom-0">
        <Button
          onClick={handleSave}
          disabled={isSaving || !pseudo.trim()}
          fullWidth
        >
          {isSaving ? 'Saving...' : 'Save Profile'}
        </Button>
        <Button
          variant="danger"
          onClick={handleLogout}
          disabled={isSaving}
          fullWidth
        >
          Logout
        </Button>
      </div>
    </div>
  )
}
