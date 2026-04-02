'use client'

interface AvatarProps {
  nombre: string
  foto?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm:  'w-8  h-8  text-xs',
  md:  'w-10 h-10 text-sm',
  lg:  'w-14 h-14 text-lg',
  xl:  'w-20 h-20 text-2xl',
}

export default function Avatar({ nombre, foto, size = 'md' }: AvatarProps) {
  const initials = nombre
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  if (foto) {
    return (
      <img
        src={foto}
        alt={nombre}
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0`}
      />
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center font-bold text-white flex-shrink-0`}
    >
      {initials}
    </div>
  )
}
