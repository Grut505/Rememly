import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { profileApi, SaveProfilePayload } from '../api/profile'
import { useAuth } from '../auth/AuthContext'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data:image/...;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
  })
}

export interface UserProfile {
  pseudo: string
  famileo_name?: string
  avatar_url: string
}

interface ProfileContextType {
  profile: UserProfile | null
  isLoading: boolean
  saveProfile: (pseudo: string, famileoName: string, avatarFile?: File) => Promise<void>
  reloadProfile: () => void
  avatarBlobUrl: string | null
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

// Cache for avatar blob URL to avoid multiple fetches
let cachedAvatarBlobUrl: string | null = null
let cachedAvatarDriveUrl: string | null = null

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null)

  const loadProfile = async () => {
    if (!isAuthenticated) return

    setIsLoading(true)
    try {
      const data = await profileApi.get()
      setProfile({
        pseudo: data.pseudo,
        famileo_name: data.famileo_name,
        avatar_url: data.avatar_url
      })

      // Convert base64 to data URL (from backend, no CORS issues)
      if (data.avatar_base64 && data.avatar_url !== cachedAvatarDriveUrl) {
        try {
          // Create data URL from base64
          const dataUrl = `data:image/jpeg;base64,${data.avatar_base64}`

          // Revoke old blob URL if exists
          if (cachedAvatarBlobUrl) {
            URL.revokeObjectURL(cachedAvatarBlobUrl)
          }

          // Store data URL (no need for blob, data URLs work directly)
          cachedAvatarBlobUrl = dataUrl
          cachedAvatarDriveUrl = data.avatar_url
          setAvatarBlobUrl(dataUrl)
        } catch (error) {
          console.error('Failed to convert avatar to data URL:', error)
          setAvatarBlobUrl(null)
        }
      } else if (data.avatar_url === cachedAvatarDriveUrl && cachedAvatarBlobUrl) {
        // Reuse cached data URL
        setAvatarBlobUrl(cachedAvatarBlobUrl)
      } else if (!data.avatar_base64) {
        // No avatar
        setAvatarBlobUrl(null)
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadProfile()
    }
  }, [isAuthenticated, authLoading])

  const saveProfile = async (pseudo: string, famileoName: string, avatarFile?: File) => {
    try {
      const payload: SaveProfilePayload = { pseudo, famileo_name: famileoName }

      if (avatarFile) {
        // Convert image to base64
        const base64 = await fileToBase64(avatarFile)
        payload.avatar = base64
      }

      const data = await profileApi.save(payload)
      setProfile({
        pseudo: data.pseudo,
        avatar_url: data.avatar_url
      })

      // Reload to update blob cache
      await loadProfile()
    } catch (error) {
      console.error('Failed to save profile:', error)
      throw error
    }
  }

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        saveProfile,
        reloadProfile: loadProfile,
        avatarBlobUrl,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider')
  }
  return context
}
