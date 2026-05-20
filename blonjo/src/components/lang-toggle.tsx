import { useTranslation } from "react-i18next"

export function LanguageToggle() {
  const { i18n } = useTranslation()

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('id') ? 'en' : 'id'
    i18n.changeLanguage(nextLang)
  }

  return (
    <button
      onClick={toggleLanguage}
      className="inline-flex items-center justify-center rounded-md text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-10 px-3 py-2"
    >
      {i18n.language.startsWith('id') ? 'ID' : 'EN'}
    </button>
  )
}
