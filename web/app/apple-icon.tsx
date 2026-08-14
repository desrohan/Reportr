import { ImageResponse } from 'next/og'

// Apple touch icon: same aperture tile as icon.tsx, full-bleed (iOS applies
// its own corner mask).
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        }}
      >
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: '50%',
            border: '18px solid white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'white' }} />
        </div>
      </div>
    ),
    { ...size }
  )
}
