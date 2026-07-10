import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../utils/supabase/server";

export async function POST(req: Request) {
  try {
    const { filename, contentType, workspaceId } = await req.json();

    // Authenticate the user
    let user = null;
    let supabase = null;

    // Try Authorization header first (for Chrome extension)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.split(" ")[1];

    if (token) {
      supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          auth: { persistSession: false },
        }
      );
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } else {
      // Fallback to cookie session (for dashboard web uploads)
      supabase = await createServerClient();
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve storage settings
    // 1. Fetch personal R2 settings if configured
    const { data: personalSettings } = await supabase
      .from("user_r2_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // 2. Fetch workspace R2 settings if personal settings are not configured
    let workspaceSettings = null;
    if (workspaceId && (!personalSettings || !personalSettings.r2_endpoint)) {
      const { data } = await supabase
        .from("workspaces")
        .select("r2_endpoint, r2_access_key_id, r2_secret_access_key, r2_bucket_name, r2_public_domain")
        .eq("id", workspaceId)
        .maybeSingle();
      workspaceSettings = data;
    }

    // Determine final credentials to use
    let endpoint = "";
    let accessKeyId = "";
    let secretAccessKey = "";
    let bucketName = "";
    let publicDomain = "";
    let isCustom = false;

    if (personalSettings && personalSettings.r2_endpoint) {
      endpoint = personalSettings.r2_endpoint;
      accessKeyId = personalSettings.r2_access_key_id;
      secretAccessKey = personalSettings.r2_secret_access_key;
      bucketName = personalSettings.r2_bucket_name;
      publicDomain = personalSettings.r2_public_domain;
      isCustom = true;
    } else if (workspaceSettings && workspaceSettings.r2_endpoint) {
      endpoint = workspaceSettings.r2_endpoint;
      accessKeyId = workspaceSettings.r2_access_key_id;
      secretAccessKey = workspaceSettings.r2_secret_access_key;
      bucketName = workspaceSettings.r2_bucket_name;
      publicDomain = workspaceSettings.r2_public_domain;
      isCustom = true;
    } else {
      // Fallback to default env vars
      endpoint = process.env.R2_ENDPOINT || "";
      accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
      secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
      bucketName = process.env.R2_BUCKET_NAME || "reportr";
      publicDomain = process.env.R2_PUBLIC_DOMAIN || "";
    }

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("Storage credentials are not configured.");
    }

    const S3 = new S3Client({
      region: "auto",
      endpoint: cleanR2Endpoint(endpoint),
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    const key = `reports/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType, // e.g. "video/webm"
    });

    const preSignedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 });
    
    // Construct the public access URL
    let publicUrl = "";
    if (publicDomain) {
      const baseDomain = publicDomain.trim().replace(/\/$/, "");
      if (isCustom) {
        // Custom domain usually maps directly to the bucket root
        publicUrl = `${baseDomain}/${key}`;
      } else {
        // Default fallback format
        publicUrl = `${baseDomain}/${bucketName}/${key}`;
      }
    } else {
      // Fallback if no public domain is specified
      const cleanedEndpoint = cleanR2Endpoint(endpoint);
      publicUrl = `${cleanedEndpoint}/${bucketName}/${key}`;
    }

    return NextResponse.json({ uploadUrl: preSignedUrl, key, publicUrl });
  } catch (error: any) {
    console.error("Presigned URL Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function cleanR2Endpoint(endpoint: string): string {
  if (!endpoint) return "";
  let cleaned = endpoint.trim();
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = "https://" + cleaned;
  }
  try {
    const url = new URL(cleaned);
    if (url.hostname.endsWith(".r2.cloudflarestorage.com")) {
      return `${url.protocol}//${url.hostname}`;
    }
    return url.href.replace(/\/$/, "");
  } catch (_) {}
  return endpoint.trim();
}
