import { ImageResponse } from 'next/og'

// Brand favicon: the same blue "aperture" tile used by <Logo /> on the
// landing page and dashboard sidebar.
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
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
          borderRadius: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: '7px solid white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white' }} />
        </div>
      </div>
    ),
    { ...size }
  )
}
