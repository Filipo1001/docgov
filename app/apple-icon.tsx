import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: '#1d4ed8',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '36px',
      }}
    >
      <span
        style={{
          color: 'white',
          fontSize: '80px',
          fontWeight: 800,
          letterSpacing: '-3px',
          fontFamily: 'sans-serif',
        }}
      >
        CD
      </span>
    </div>,
    { ...size }
  )
}
