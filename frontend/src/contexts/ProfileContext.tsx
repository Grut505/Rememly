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
  avatar_url: string
}

interface ProfileContextType {
  profile: UserProfile | null
  isLoading: boolean
  saveProfile: (pseudo: string, avatarFile?: File) => Promise<void>
  reloadProfile: () => void
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadProfile = async () => {
    if (!isAuthenticated) return

    setIsLoading(true)
    try {
      const data = await profileApi.get()
      setProfile({
        pseudo: data.pseudo,
        avatar_url: data.avatar_url
      })
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

  const saveProfile = async (pseudo: string, avatarFile?: File) => {
    try {
      const payload: SaveProfilePayload = { pseudo }

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
