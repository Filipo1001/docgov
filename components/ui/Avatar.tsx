'use client'

import { avatarThumb } from '@/lib/avatar'
import { MARCA } from '@/lib/marca'

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
        src={avatarThumb(foto) ?? foto}
        alt={nombre}
        loading="lazy"
        decoding="async"
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0`}
      />
    )
  }

  return (
    <div
      /* Sólido en la tinta de marca. El degradado azul venía de antes de que
         existiera una identidad y era el color más visible de la aplicación. */
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: MARCA }}
    >
      {initials}
    </div>
  )
}
