import { S3Client } from '@aws-sdk/client-s3'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Server-side R2 credential resolution shared by the upload routes. Order of
 * precedence: the user's personal R2 → the workspace's R2 → the app default
 * (env). Kept in one place so the presign route and the direct-upload route
 * can't drift apart.
 */

export interface R2Config {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicDomain: string
  isCustom: boolean
}

export function cleanR2Endpoint(endpoint: string): string {
  if (!endpoint) return ''
  let cleaned = endpoint.trim()
  if (!/^https?:\/\//i.test(cleaned)) cleaned = 'https://' + cleaned
  try {
    const url = new URL(cleaned)
    if (url.hostname.endsWith('.r2.cloudflarestorage.com')) {
      return `${url.protocol}//${url.hostname}`
    }
    return url.href.replace(/\/$/, '')
  } catch {
    /* fall through */
  }
  return endpoint.trim()
}

// `supabase` is the request-scoped client (typed loosely as a plain
// SupabaseClient to avoid coupling to the SSR/JS client union).
export async function resolveR2Config(
  supabase: SupabaseClient,
  userId: string,
  workspaceId?: string | null
): Promise<R2Config> {
  const { data: personal } = await supabase
    .from('user_r2_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  let workspace = null
  if (workspaceId && (!personal || !personal.r2_endpoint)) {
    const { data } = await supabase
      .from('workspaces')
      .select('r2_endpoint, r2_access_key_id, r2_secret_access_key, r2_bucket_name, r2_public_domain')
      .eq('id', workspaceId)
      .maybeSingle()
    workspace = data
  }

  if (personal && personal.r2_endpoint) {
    return {
      endpoint: personal.r2_endpoint,
      accessKeyId: personal.r2_access_key_id,
      secretAccessKey: personal.r2_secret_access_key,
      bucketName: personal.r2_bucket_name,
      publicDomain: personal.r2_public_domain,
      isCustom: true,
    }
  }
  if (workspace && workspace.r2_endpoint) {
    return {
      endpoint: workspace.r2_endpoint,
      accessKeyId: workspace.r2_access_key_id,
      secretAccessKey: workspace.r2_secret_access_key,
      bucketName: workspace.r2_bucket_name,
      publicDomain: workspace.r2_public_domain,
      isCustom: true,
    }
  }
  return {
    endpoint: process.env.R2_ENDPOINT || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'reportr',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || '',
    isCustom: false,
  }
}

export function r2Client(cfg: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: cleanR2Endpoint(cfg.endpoint),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
}

export function buildPublicUrl(cfg: R2Config, key: string): string {
  if (cfg.publicDomain) {
    const base = cfg.publicDomain.trim().replace(/\/$/, '')
    return cfg.isCustom ? `${base}/${key}` : `${base}/${cfg.bucketName}/${key}`
  }
  return `${cleanR2Endpoint(cfg.endpoint)}/${cfg.bucketName}/${key}`
}

/** Authenticate via bearer token (extension) or cookie session (web). */
export async function authFromRequest(
  req: Request,
  createServerClient: () => Promise<SupabaseClient>,
  createTokenClient: (token: string) => SupabaseClient
): Promise<{ user: User | null; supabase: SupabaseClient }> {
  const token = req.headers.get('Authorization')?.split(' ')[1]
  if (token) {
    const supabase = createTokenClient(token)
    const { data } = await supabase.auth.getUser()
    return { user: data.user, supabase }
  }
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  return { user: data.user, supabase }
}
