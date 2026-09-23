import { describe, expect, it } from "vitest";

import { unzip } from "./zip";

function createTestZip(
  entries: Array<{ path: string; data: Uint8Array }>,
): Uint8Array {
  const parts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.path);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // STORE
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(entry.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // STORE
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    cdParts.push(cd);

    offset += localHeader.length + entry.data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const p of cdParts) cdSize += p.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);

  const totalLength = offset + cdSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const p of parts) {
    result.set(p, pos);
    pos += p.length;
  }
  for (const p of cdParts) {
    result.set(p, pos);
    pos += p.length;
  }
  result.set(eocd, pos);
  return result;
}

export { createTestZip };

describe("zip extractor", () => {
  it("extracts entries from a zip buffer", () => {
    const helloData = new TextEncoder().encode("Hello World");
    const zipBuffer = createTestZip([
      { path: "test.txt", data: helloData },
      { path: "sub/image.png", data: new Uint8Array([1, 2, 3]) },
    ]);

    const extracted = unzip(zipBuffer);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].path).toBe("test.txt");
    expect(new TextDecoder().decode(extracted[0].data)).toBe("Hello World");
    expect(extracted[1].path).toBe("sub/image.png");
    expect(extracted[1].data).toEqual(new Uint8Array([1, 2, 3]));
  });
});
