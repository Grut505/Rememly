import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface RememblyDB extends DBSchema {
  drafts: {
    key: string
    value: {
      id: string
      texte: string
      imageData?: string
      assembly_state?: object
      timestamp: number
    }
  }
  assemblyStates: {
    key: string
    value: {
      articleId: string
      state: object
      timestamp: number
    }
  }
}

class StorageService {
  private dbPromise: Promise<IDBPDatabase<RememblyDB>>

  constructor() {
    this.dbPromise = openDB<RememblyDB>('rememly-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('assemblyStates')) {
          db.createObjectStore('assemblyStates', { keyPath: 'articleId' })
        }
      },
    })
  }

  async saveDraft(draft: {
    id: string
    texte: string
    imageData?: string
    assembly_state?: object
  }): Promise<void> {
    const db = await this.dbPromise
    await db.put('drafts', {
      ...draft,
      timestamp: Date.now(),
    })
  }

  async getDraft(id: string) {
    const db = await this.dbPromise
    return db.get('drafts', id)
  }

  async deleteDraft(id: string): Promise<void> {
    const db = await this.dbPromise
    await db.delete('drafts', id)
  }

  async saveAssemblyState(
    articleId: string,
    state: object
  ): Promise<void> {
    const db = await this.dbPromise
    await db.put('assemblyStates', {
      articleId,
      state,
      timestamp: Date.now(),
    })
  }

  async getAssemblyState(articleId: string) {
    const db = await this.dbPromise
    const result = await db.get('assemblyStates', articleId)
    return result?.state
  }

  async deleteAssemblyState(articleId: string): Promise<void> {
    const db = await this.dbPromise
    await db.delete('assemblyStates', articleId)
  }
}

export const storageService = new StorageService()
