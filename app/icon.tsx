import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#131B2B',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '8px',
      }}
    >
      <span
        style={{
          color: 'white',
          fontSize: '13px',
          fontWeight: 800,
          letterSpacing: '-0.5px',
          fontFamily: 'sans-serif',
        }}
      >
        CD
      </span>
    </div>,
    { ...size }
  )
}
