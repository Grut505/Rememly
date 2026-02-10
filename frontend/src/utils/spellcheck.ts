import nspell from 'nspell'

let spellcheckerPromise: Promise<ReturnType<typeof nspell>> | null = null

async function fetchDictionary(path: string): Promise<string> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load dictionary: ${path}`)
  }
  return response.text()
}

export async function loadSpellchecker(): Promise<ReturnType<typeof nspell>> {
  if (!spellcheckerPromise) {
    spellcheckerPromise = (async () => {
      const [aff, dic] = await Promise.all([
        fetchDictionary('/dictionaries/fr_FR.aff'),
        fetchDictionary('/dictionaries/fr_FR.dic'),
      ])
      return nspell(aff, dic)
    })()
  }
  return spellcheckerPromise
}

export function extractWords(text: string): string[] {
  if (!text) return []
  const matches = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ'-]+/g)
  if (!matches) return []
  return matches.filter((word) => word.length > 1)
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
