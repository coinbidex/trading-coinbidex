interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'full' | 'icon'
  className?: string
}

export default function Logo({ size = 'md', variant = 'full', className = '' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-8',   // 32px height
    md: 'h-12',  // 48px height
    lg: 'h-16',  // 64px height
  }

  return (
    <a
      href="https://coinbidex.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block ${className}`}
    >
      <img
        src="/logo.png"
        alt="COINBIDEX"
        className={`${sizeClasses[size]} w-auto object-contain cursor-pointer`}
      />
    </a>
  )
}