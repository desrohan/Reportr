import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();

    const S3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT, // e.g. https://<ACCOUNT_ID>.r2.cloudflarestorage.com
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });

    // Cloudflare R2 structure pattern
    const key = `reports/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "reportr",
      Key: key,
      ContentType: contentType, // e.g. "video/webm"
    });

    const preSignedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 });
    
    // Generating the public URL assuming R2 public bucket access or custom domain
    // If not public, we store the `key` in Supabase and fetch securely later.
    const publicUrl = `${process.env.R2_PUBLIC_DOMAIN}/${process.env.R2_BUCKET_NAME}/${key}`;

    return NextResponse.json({ uploadUrl: preSignedUrl, key, publicUrl });
  } catch (error: any) {
    console.error("Presigned URL Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
