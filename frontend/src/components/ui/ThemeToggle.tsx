import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      className={`p-2 rounded-lg transition-all duration-200
        text-dark-400 hover:text-dark-900 dark:text-dark-400 dark:hover:text-white
        hover:bg-dark-100 dark:hover:bg-dark-800
        ${className}`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark'
        ? <Sun  size={16} className="text-yellow-400"/>
        : <Moon size={16} className="text-brand-500"/>
      }
    </button>
  )
}
