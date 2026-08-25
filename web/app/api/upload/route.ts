import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../utils/supabase/server'
import { resolveR2Config, r2Client, buildPublicUrl, authFromRequest } from '../../../utils/r2'

/**
 * Mints a short-lived presigned PUT URL so the browser can upload report media
 * straight to R2, skipping the server relay. This halves the transfer (the file
 * no longer travels browser→server→R2) and avoids buffering large recordings in
 * server memory.
 *
 * The browser PUT is cross-origin, so the target R2 bucket must allow PUT in its
 * CORS policy (see the setup guide on the Settings page). Buckets without it are
 * handled by the client falling back to the /api/store proxy.
 */
export async function POST(req: Request) {
  try {
    const { filename, contentType, workspaceId } = await req.json()

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

    const cfg = await resolveR2Config(supabase, user.id, workspaceId)
    if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) {
      return NextResponse.json({ error: 'Storage credentials are not configured.' }, { status: 400 })
    }

    const safeName = String(filename || 'file').replace(/[^\w.\-]+/g, '_')
    const key = `reports/${Date.now()}-${safeName}`

    // Sign the exact ContentType the browser will send on the PUT — the header is
    // part of the signature, so a mismatch fails the upload (surfaces as a CORS
    // error even though it's really a signature mismatch).
    const uploadUrl = await getSignedUrl(
      r2Client(cfg),
      new PutObjectCommand({ Bucket: cfg.bucketName, Key: key, ContentType: contentType }),
      { expiresIn: 3600 }
    )

    return NextResponse.json({ uploadUrl, key, publicUrl: buildPublicUrl(cfg, key) })
  } catch (error: unknown) {
    console.error('Presigned URL error:', error)
    const message = error instanceof Error && error.message ? error.message : 'Failed to presign upload'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
