declare module 'nspell' {
  interface Spellchecker {
    correct(word: string): boolean
    suggest(word: string): string[]
  }

  export default function nspell(aff: string, dic: string): Spellchecker
}
