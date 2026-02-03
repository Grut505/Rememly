import { ChangeEvent, useEffect, useRef } from 'react'
import { CONSTANTS } from '../../utils/constants'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
}

export function TextInput({ value, onChange }: TextInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Text (optional)
      </label>
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
    </div>
  )
}
