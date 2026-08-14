import { ImageResponse } from 'next/og'

// Social card in the landing page style: zinc-950, blue spotlight, aperture
// logo tile, hero headline. Copy lives in app/page.tsx — keep them in sync.
export const alt = 'Reportr - Report a bug in one click'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          position: 'relative',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Blue spotlight, same as the landing hero */}
        <div
          style={{
            position: 'absolute',
            top: -180,
            width: 900,
            height: 460,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(37,99,235,0.35) 0%, rgba(37,99,235,0) 70%)',
          }}
        />

        {/* Logo tile + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
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
          <div style={{ fontSize: 52, color: 'white', letterSpacing: -1 }}>Reportr</div>
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 82,
            color: 'white',
            letterSpacing: -3,
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          Report a bug in one click.
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: '#a1a1aa',
            textAlign: 'center',
            maxWidth: 860,
            lineHeight: 1.4,
          }}
        >
          Annotated screenshots, screen recordings, and full session replays, shared on storage you own.
        </div>
      </div>
    ),
    { ...size }
  )
}
