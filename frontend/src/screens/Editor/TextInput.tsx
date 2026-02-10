import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { CONSTANTS } from '../../utils/constants'
import { loadSpellchecker, extractWords, escapeRegex } from '../../utils/spellcheck'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
}

export function TextInput({ value, onChange }: TextInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [spellErrors, setSpellErrors] = useState<{ word: string; count: number; suggestions: string[] }[]>([])
  const [spellErrorMessage, setSpellErrorMessage] = useState<string | null>(null)

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    if (newValue.length <= CONSTANTS.MAX_TEXT_LENGTH) {
      onChange(newValue)
    }
  }

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }, [value])

  const remaining = CONSTANTS.MAX_TEXT_LENGTH - value.length

  const runSpellcheck = async () => {
    setIsChecking(true)
    setSpellErrorMessage(null)
    try {
      const spell = await loadSpellchecker()
      const words = extractWords(value)
      const counts = new Map<string, { count: number; suggestions: string[] }>()
      words.forEach((word) => {
        if (spell.correct(word)) return
        const entry = counts.get(word)
        if (entry) {
          entry.count += 1
          return
        }
        const suggestions = spell.suggest(word).slice(0, 5)
        counts.set(word, { count: 1, suggestions })
      })
      const next = Array.from(counts.entries()).map(([word, data]) => ({
        word,
        count: data.count,
        suggestions: data.suggestions,
      }))
      setSpellErrors(next)
      if (next.length === 0) {
        setSpellErrorMessage('No spelling errors found.')
      }
    } catch (error) {
      setSpellErrors([])
      setSpellErrorMessage('Spellcheck unavailable. Add fr_FR.aff and fr_FR.dic to /public/dictionaries.')
    } finally {
      setIsChecking(false)
    }
  }

  const applySuggestion = async (word: string, suggestion: string) => {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`)
    const nextText = value.replace(regex, suggestion)
    if (nextText !== value) {
      onChange(nextText)
    }
    await runSpellcheck()
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">
          Text (optional)
        </label>
        <button
          type="button"
          onClick={runSpellcheck}
          disabled={isChecking}
          className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-60"
        >
          {isChecking && (
            <span className="w-3 h-3 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></span>
          )}
          Check spelling
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder="Add a description..."
        className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={6}
      />
      <div className="mt-1 text-sm text-gray-500 text-right">
        {remaining} characters remaining
      </div>
      {spellErrorMessage && (
        <div className="mt-2 text-xs text-gray-500">
          {spellErrorMessage}
        </div>
      )}
      {spellErrors.length > 0 && (
        <div className="mt-3 space-y-2">
          {spellErrors.map((err) => (
            <div key={err.word} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">{err.word}</span>
                <span className="text-xs text-gray-500">x{err.count}</span>
              </div>
              {err.suggestions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {err.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => applySuggestion(err.word, suggestion)}
                      className="px-2 py-1 text-xs rounded-full border border-gray-200 text-gray-700 hover:border-primary-400 hover:text-primary-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-gray-500">No suggestions.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
