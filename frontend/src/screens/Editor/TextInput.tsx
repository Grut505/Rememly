import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { CONSTANTS } from '../../utils/constants'

interface LanguageToolMatch {
  offset: number
  length: number
  message: string
  replacements: { value: string }[]
  context?: { text: string; offset: number; length: number }
}

interface TextInputProps {
  value: string
  onChange: (value: string) => void
}

export function TextInput({ value, onChange }: TextInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [spellErrors, setSpellErrors] = useState<LanguageToolMatch[]>([])
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
      const body = new URLSearchParams()
      body.set('text', value)
      body.set('language', 'fr')

      const response = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      if (!response.ok) {
        throw new Error(`Spellcheck failed (${response.status})`)
      }

      const data = await response.json()
      const matches: LanguageToolMatch[] = Array.isArray(data.matches) ? data.matches : []
      setSpellErrors(matches)
      if (matches.length === 0) {
        setSpellErrorMessage('No spelling errors found.')
      }
    } catch (error) {
      setSpellErrors([])
      setSpellErrorMessage('Spellcheck unavailable. Please try again later.')
    } finally {
      setIsChecking(false)
    }
  }

  const applySuggestion = async (match: LanguageToolMatch, suggestion: string) => {
    const before = value.slice(0, match.offset)
    const after = value.slice(match.offset + match.length)
    const nextText = `${before}${suggestion}${after}`
    onChange(nextText)
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
            <div
              key={`${err.offset}-${err.length}-${err.message}`}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">
                  {value.slice(err.offset, err.offset + err.length)}
                </span>
                <span className="text-xs text-gray-500">Error</span>
              </div>
              {err.message && (
                <div className="mt-1 text-xs text-gray-500">
                  {err.message}
                </div>
              )}
              {err.replacements && err.replacements.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {err.replacements.slice(0, 5).map((replacement) => (
                    <button
                      key={replacement.value}
                      type="button"
                      onClick={() => applySuggestion(err, replacement.value)}
                      className="px-2 py-1 text-xs rounded-full border border-gray-200 text-gray-700 hover:border-primary-400 hover:text-primary-700"
                    >
                      {replacement.value}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-gray-500">No suggestions.</div>
              )}
            </div>
          ))}
          <div className="text-xs text-gray-400">
            Suggestions by LanguageTool.
          </div>
        </div>
      )}
    </div>
  )
}
