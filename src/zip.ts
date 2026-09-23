import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/**
 * Lightweight zip parser using Node.js built-in inflateRawSync.
 * Supports standard STORE (0) and DEFLATE (8) compression methods.
 */
export function unzip(buffer: Uint8Array): ZipEntry[] {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const entries: ZipEntry[] = [];

  // Find End of Central Directory (EOCD) record from the end of the buffer
  let eocdOffset = -1;
  const minEocdSize = 22;
  const maxSearchRange = Math.min(buffer.byteLength, 65535 + minEocdSize);
  for (
    let i = buffer.byteLength - minEocdSize;
    i >= buffer.byteLength - maxSearchRange;
    i--
  ) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error(
      "Invalid zip file: End of Central Directory record not found",
    );
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  let currentCdOffset = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(currentCdOffset, true) !== 0x02014b50) {
      break;
    }

    const method = view.getUint16(currentCdOffset + 10, true);
    const compressedSize = view.getUint32(currentCdOffset + 20, true);
    const fileNameLength = view.getUint16(currentCdOffset + 28, true);
    const extraFieldLength = view.getUint16(currentCdOffset + 30, true);
    const commentLength = view.getUint16(currentCdOffset + 32, true);
    const localHeaderOffset = view.getUint32(currentCdOffset + 42, true);

    const fileNameBytes = buffer.subarray(
      currentCdOffset + 46,
      currentCdOffset + 46 + fileNameLength,
    );
    const fileName = new TextDecoder("utf-8").decode(fileNameBytes);

    currentCdOffset += 46 + fileNameLength + extraFieldLength + commentLength;

    // Skip directories and Mac OS metadata
    if (
      fileName.endsWith("/") ||
      fileName.startsWith("__MACOSX/") ||
      fileName.includes("/.")
    ) {
      continue;
    }

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      continue;
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedData = buffer.subarray(
      dataStart,
      dataStart + compressedSize,
    );

    let fileData: Uint8Array;
    if (method === 0) {
      fileData = compressedData;
    } else if (method === 8) {
      fileData = inflateRawSync(compressedData);
    } else {
      // Unsupported compression method
      continue;
    }

    entries.push({
      path: fileName,
      data: fileData,
    });
  }

  return entries;
}
