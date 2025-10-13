import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

type UploadParams = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  cacheControl?: string;
};

function resolveBucketAndEndpoint() {
  const rawEndpoint = process.env.S3_ENDPOINT;
  const configuredBucket = process.env.S3_BUCKET || "";

  if (!rawEndpoint) {
    return {
      bucket: configuredBucket,
      endpointBase: undefined as string | undefined,
      isR2: false,
    };
  }

  const url = new URL(rawEndpoint);
  // If endpoint was provided as ...cloudflarestorage.com/<bucket>, strip the path for the client
  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  const pathBucket = path.split("/").filter(Boolean)[0] || "";
  const endpointBase = `${url.protocol}//${url.host}`;
  const bucket = configuredBucket || pathBucket;
  const isR2 = url.host.endsWith(".r2.cloudflarestorage.com");

  return { bucket, endpointBase, isR2 };
}

function getS3Client(): S3Client {
  const region = process.env.S3_REGION || "auto";
  const { endpointBase } = resolveBucketAndEndpoint();
  const credentials = {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  };

  const client = new S3Client({
    region,
    endpoint: endpointBase,
    forcePathStyle: !!endpointBase,
    credentials,
  });
  return client;
}

export async function uploadXmlToS3({
  key,
  body,
  contentType = "application/xml; charset=utf-8",
  cacheControl = "public, max-age=300",
}: UploadParams): Promise<string> {
  const { bucket } = resolveBucketAndEndpoint();
  if (!bucket) throw new Error("S3_BUCKET is not set and could not be inferred from S3_ENDPOINT");

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
      ACL: 'public-read', // Make the file publicly accessible
    })
  );
  return getPublicUrl(key);
}

export async function deleteXmlFromS3(key: string): Promise<void> {
  const { bucket } = resolveBucketAndEndpoint();
  if (!bucket) {
    console.warn("S3_BUCKET is not set, skipping file deletion");
    return;
  }

  try {
    const s3 = getS3Client();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    console.log(`Successfully deleted file from S3: ${key}`);
  } catch (error) {
    console.error(`Failed to delete file from S3: ${key}`, error);
    // Don't throw - allow feed deletion to continue even if S3 delete fails
  }
}

export function getPublicUrl(key: string): string {
  const { bucket, endpointBase, isR2 } = resolveBucketAndEndpoint();
  const cdnBase = process.env.FEED_CDN_BASE;
  if (cdnBase) return `${cdnBase.replace(/\/$/, "")}/${key}`;

  // If using an S3-compatible endpoint, prefer path-style URLs for broader compatibility (e.g., Cloudflare R2)
  if (endpointBase && bucket) {
    if (isR2) {
      // R2 path-style public URL. Ensure your bucket is public or fronted by a CDN/domain.
      return `${endpointBase.replace(/\/$/, "")}/${bucket}/${key}`;
    }
    // For generic S3-compatible providers, attempt virtual-hosted style as before
    try {
      const url = new URL(endpointBase);
      return `${url.protocol}//${bucket}.${url.host}/${key}`;
    } catch {
      return `${endpointBase.replace(/\/$/, "")}/${bucket}/${key}`;
    }
  }

  // Standard AWS S3 URL as a last resort
  const region = process.env.S3_REGION || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}


