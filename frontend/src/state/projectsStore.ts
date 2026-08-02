import { create } from 'zustand'
import { configApi } from '../api/config'

export interface Project {
  id: string
  name: string
  isDefault?: boolean
}

const PROJECTS_CONFIG_KEY = 'projects'

// Seeded once, the first time nothing has been saved yet - "Famileo" is the
// one project every existing article implicitly belonged to before this
// feature existed.
const DEFAULT_PROJECTS: Project[] = [{ id: 'famileo', name: 'Famileo', isDefault: true }]

interface ProjectsState {
  projects: Project[]
  isLoaded: boolean
  load: () => Promise<void>
  save: (projects: Project[]) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: DEFAULT_PROJECTS,
  isLoaded: false,

  load: async () => {
    try {
      const result = await configApi.get(PROJECTS_CONFIG_KEY)
      const parsed = result.value ? JSON.parse(result.value) : null
      set({
        projects: Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_PROJECTS,
        isLoaded: true,
      })
    } catch {
      set({ projects: DEFAULT_PROJECTS, isLoaded: true })
    }
  },

  save: async (projects) => {
    set({ projects })
    await configApi.set(PROJECTS_CONFIG_KEY, JSON.stringify(projects))
  },
}))
