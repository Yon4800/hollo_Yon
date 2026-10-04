import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import mime from "mime";

import { db } from "../../db";
import { serializeMedium } from "../../entities/medium";
import { makeVideoScreenshot, uploadThumbnail } from "../../media";
import {
  scopeRequired,
  tokenRequired,
  withAccountOwner,
  type AccountOwnerVariables,
} from "../../oauth/middleware";
import { media } from "../../schema";
import { isUuid, uuidv7 } from "../../uuid";

const app = new Hono<{ Variables: AccountOwnerVariables }>();

const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/midi": "mid",
  "audio/x-midi": "mid",
  "audio/mid": "mid",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/webm": "weba",
};

const AUDIO_EXT_MIMES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mid: "audio/midi",
  midi: "audio/midi",
  ogg: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  weba: "audio/webm",
};

export function getFileExtension(filename?: string): string | undefined {
  if (!filename) return undefined;
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : undefined;
}

export function resolveAudioInfo(
  mimeType: string,
  filename?: string,
): { isAudio: boolean; resolvedType: string; extension: string } {
  const extFromName = getFileExtension(filename);
  let resolvedType = mimeType;
  let isAudio = resolvedType.startsWith("audio/");
  if (extFromName && AUDIO_EXT_MIMES[extFromName]) {
    isAudio = true;
    if (
      !resolvedType ||
      resolvedType === "application/octet-stream" ||
      !resolvedType.startsWith("audio/")
    ) {
      resolvedType = AUDIO_EXT_MIMES[extFromName];
    }
  }
  const extension =
    AUDIO_MIME_EXTENSIONS[resolvedType] ??
    extFromName ??
    mime.getExtension(resolvedType) ??
    "bin";
  return { isAudio, resolvedType, extension };
}

export async function postMedia(
  c: Context<{ Variables: AccountOwnerVariables }>,
) {
  const [{ drive }, { default: sharp }] = await Promise.all([
    import("../../storage"),
    import("sharp"),
  ]);
  const disk = drive.use();
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "file is required" }, 422);
  }
  const description = form.get("description")?.toString();
  const id = uuidv7();

  const {
    isAudio,
    resolvedType,
    extension: audioExtension,
  } = resolveAudioInfo(file.type, file.name);

  if (isAudio) {
    const sanitizedExt = audioExtension.replace(/[/\\]/g, "");
    const content = new Uint8Array(await file.arrayBuffer());
    const path = `media/${id}/original.${sanitizedExt}`;
    try {
      await disk.put(path, content, {
        contentType: resolvedType,
        contentLength: content.byteLength,
        visibility: "public",
      });
    } catch (_error) {
      return c.json({ error: "Failed to save media file" }, 500);
    }
    const url = await disk.getUrl(path);
    const result = await db
      .insert(media)
      .values({
        id,
        type: resolvedType,
        url,
        width: 0,
        height: 0,
        description,
        thumbnailUrl: url,
        thumbnailType: resolvedType,
        thumbnailWidth: 0,
        thumbnailHeight: 0,
      })
      .returning();
    if (result.length < 1) {
      return c.json({ error: "Failed to insert media" }, 500);
    }
    return c.json(serializeMedium(result[0], c.req.url));
  }

  const imageData = new Uint8Array(await file.arrayBuffer());
  let imageBytes: Uint8Array = imageData;
  if (file.type.startsWith("video/")) {
    imageBytes = await makeVideoScreenshot(imageData);
  }

  const image = sharp(imageBytes).rotate();
  const rmMetaImage = await image.keepIccProfile().toBuffer();
  const fileMetadata = await sharp(rmMetaImage).metadata();
  const content = file.type.startsWith("video/")
    ? new Uint8Array(imageData)
    : new Uint8Array(rmMetaImage);

  const extension = mime.getExtension(file.type);
  if (!extension) {
    return c.json({ error: "Unsupported media type" }, 400);
  }
  const sanitizedExt = extension.replace(/[/\\]/g, "");
  const path = `media/${id}/original.${sanitizedExt}`;
  try {
    await disk.put(path, content, {
      contentType: file.type,
      contentLength: content.byteLength,
      visibility: "public",
    });
  } catch (_error) {
    return c.json({ error: "Failed to save media file" }, 500);
  }
  const url = await disk.getUrl(path);
  const result = await db
    .insert(media)
    .values({
      id,
      type: file.type,
      url,
      width: fileMetadata.width!,
      height: fileMetadata.height!,
      description,
      ...(await uploadThumbnail(id, image)),
    })
    .returning();
  if (result.length < 1) {
    return c.json({ error: "Failed to insert media" }, 500);
  }
  return c.json(serializeMedium(result[0], c.req.url));
}

app.post(
  "/",
  tokenRequired,
  scopeRequired(["write:media"]),
  withAccountOwner,
  postMedia,
);

app.get("/:id", async (c) => {
  const mediumId = c.req.param("id");
  if (!isUuid(mediumId)) return c.json({ error: "Not found" }, 404);
  const medium = await db.query.media.findFirst({
    where: { id: { eq: mediumId } },
  });
  if (medium == null) return c.json({ error: "Not found" }, 404);
  return c.json(serializeMedium(medium, c.req.url));
});

app.put("/:id", tokenRequired, scopeRequired(["write:media"]), async (c) => {
  const mediumId = c.req.param("id");
  if (!isUuid(mediumId)) return c.json({ error: "Not found" }, 404);
  let description: string | undefined;
  try {
    const json = await c.req.json();
    description = json.description;
  } catch (_e) {
    const form = await c.req.formData();
    description = form.get("description")?.toString();
  }
  if (description == null) {
    return c.json({ error: "description is required" }, 422);
  }
  const result = await db
    .update(media)
    .set({ description })
    .where(eq(media.id, mediumId))
    .returning();
  if (result.length < 1) return c.json({ error: "Not found" }, 404);
  return c.json(serializeMedium(result[0], c.req.url));
});

export default app;
