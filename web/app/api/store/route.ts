import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../utils/supabase/server'
import { resolveR2Config, r2Client, buildPublicUrl, authFromRequest } from '../../../utils/r2'

/**
 * Server-side upload for report media. The browser sends the file bytes here and
 * we push them to R2 from the server, so there's no browser→R2 request and thus
 * no CORS preflight (which R2 buckets don't answer by default). Used for the
 * deferred save-time upload of recordings, screenshots, and thumbnails.
 *
 * The file is the raw request body; metadata comes from the query string.
 */
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const filename = searchParams.get('filename') || 'file'
    const contentType =
      searchParams.get('contentType') || req.headers.get('content-type') || 'application/octet-stream'
    const workspaceId = searchParams.get('workspaceId') || undefined

    const { user, supabase } = await authFromRequest(
      req,
      createServerClient,
      (token) =>
        createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
        )
    )

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bytes = await req.arrayBuffer()
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    }

    const cfg = await resolveR2Config(supabase, user.id, workspaceId)
    if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) {
      return NextResponse.json({ error: 'Storage credentials are not configured.' }, { status: 400 })
    }

    const safeName = filename.replace(/[^\w.\-]+/g, '_')
    const key = `reports/${Date.now()}-${safeName}`

    await r2Client(cfg).send(
      new PutObjectCommand({
        Bucket: cfg.bucketName,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: contentType,
      })
    )

    return NextResponse.json({ publicUrl: buildPublicUrl(cfg, key), key })
  } catch (error: unknown) {
    console.error('Store upload error:', error)
    const message = error instanceof Error && error.message ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
