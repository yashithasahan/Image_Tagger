import piexif from 'piexifjs';

// Convert a File to a JPEG Data URL
export const convertToJpeg = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 1.0));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Convert a File to a WebP Data URL
export const convertToWebp = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/webp', 0.9));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Encode string to UTF-16LE byte array for Windows XP tags
const encodeXPString = (str: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes.push(code & 0xff);
    bytes.push((code >> 8) & 0xff);
  }
  // Null termination (2 bytes for UTF-16)
  bytes.push(0);
  bytes.push(0);
  return bytes;
};

// Write Exif tags to JPEG Data URL
export const writeExifData = (
  jpegDataUrl: string, 
  title: string, 
  tags: string, 
  author: string, 
  copyright: string
): string => {
  let exifObj: any = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {} };
  
  try {
    const loadedExif = piexif.load(jpegDataUrl);
    if (loadedExif && typeof loadedExif === 'object') {
      exifObj = { ...exifObj, ...loadedExif };
    }
  } catch (_e) {
    // Ignore error if it fails to load EXIF
  }

  if (!exifObj["0th"]) exifObj["0th"] = {};

  if (title) {
    exifObj["0th"][piexif.ImageIFD.XPTitle] = encodeXPString(title);
  }
  
  if (tags) {
    const formattedTags = tags.split(',').map(t => t.trim()).join(';');
    exifObj["0th"][piexif.ImageIFD.XPKeywords] = encodeXPString(formattedTags);
  }

  if (author) {
    exifObj["0th"][piexif.ImageIFD.XPAuthor] = encodeXPString(author);
    exifObj["0th"][piexif.ImageIFD.Artist] = author;
  }

  if (copyright) {
    exifObj["0th"][piexif.ImageIFD.Copyright] = copyright;
  }

  const exifBytes = piexif.dump(exifObj);
  return piexif.insert(exifBytes, jpegDataUrl);
};

// ── WebP EXIF Injection ──────────────────────────────────────────────────────

// RIFF helpers
const readUint32LE = (d: Uint8Array, o: number): number =>
  d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | ((d[o + 3] << 24) >>> 0);

const writeUint32LE = (d: Uint8Array, o: number, v: number): void => {
  d[o] = v & 0xFF;
  d[o + 1] = (v >> 8) & 0xFF;
  d[o + 2] = (v >> 16) & 0xFF;
  d[o + 3] = (v >> 24) & 0xFF;
};

const writeFourCC = (d: Uint8Array, o: number, s: string): void => {
  for (let i = 0; i < 4; i++) d[o + i] = s.charCodeAt(i);
};

const readFourCC = (d: Uint8Array, o: number): string =>
  String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]);

// Build raw EXIF payload (starting with "Exif\0\0" + TIFF header) from metadata
const buildExifPayload = (
  title: string, tags: string, author: string, copyright: string
): Uint8Array | null => {
  if (!title && !tags && !author && !copyright) return null;

  const exifObj: any = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {} };
  if (title) exifObj["0th"][piexif.ImageIFD.XPTitle] = encodeXPString(title);
  if (tags) {
    const formatted = tags.split(',').map(t => t.trim()).join(';');
    exifObj["0th"][piexif.ImageIFD.XPKeywords] = encodeXPString(formatted);
  }
  if (author) {
    exifObj["0th"][piexif.ImageIFD.XPAuthor] = encodeXPString(author);
    exifObj["0th"][piexif.ImageIFD.Artist] = author;
  }
  if (copyright) exifObj["0th"][piexif.ImageIFD.Copyright] = copyright;

  // piexif.dump() returns: \xff\xe1 + 2-byte length + "Exif\0\0" + TIFF data
  // Strip the 4-byte JPEG APP1 prefix to get the raw EXIF payload for WebP
  const dump = piexif.dump(exifObj);
  const payload = dump.substring(4);

  const bytes = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) bytes[i] = payload.charCodeAt(i);
  return bytes;
};

// Inject an EXIF payload into a WebP RIFF container
const injectExifIntoWebp = (webp: Uint8Array, exif: Uint8Array): Uint8Array => {
  if (readFourCC(webp, 0) !== 'RIFF' || readFourCC(webp, 8) !== 'WEBP') {
    throw new Error('Invalid WebP file');
  }

  const chunkType = readFourCC(webp, 12);

  // Build the EXIF RIFF chunk: "EXIF" + size(4) + payload + optional pad byte
  const pad = exif.length % 2;
  const exifChunk = new Uint8Array(8 + exif.length + pad);
  writeFourCC(exifChunk, 0, 'EXIF');
  writeUint32LE(exifChunk, 4, exif.length);
  exifChunk.set(exif, 8);

  if (chunkType === 'VP8X') {
    // Already extended format – set EXIF flag and append chunk
    const result = new Uint8Array(webp.length + exifChunk.length);
    result.set(webp);
    result.set(exifChunk, webp.length);
    result[20] |= 0x08; // EXIF flag
    writeUint32LE(result, 4, result.length - 8);
    return result;
  }

  // Simple format (VP8 or VP8L) – wrap with a VP8X header first
  let width = 0, height = 0;

  if (chunkType === 'VP8 ') {
    const sz = readUint32LE(webp, 16);
    for (let i = 20; i < 20 + sz - 5; i++) {
      if (webp[i] === 0x9D && webp[i + 1] === 0x01 && webp[i + 2] === 0x2A) {
        width  = (webp[i + 3] | (webp[i + 4] << 8)) & 0x3FFF;
        height = (webp[i + 5] | (webp[i + 6] << 8)) & 0x3FFF;
        break;
      }
    }
  } else if (chunkType === 'VP8L') {
    if (webp[20] === 0x2F) {
      const bits = webp[21] | (webp[22] << 8) | (webp[23] << 16) | (webp[24] << 24);
      width  = (bits & 0x3FFF) + 1;
      height = ((bits >> 14) & 0x3FFF) + 1;
    }
  }
  if (!width || !height) throw new Error('Cannot read WebP image dimensions');

  // VP8X chunk: 4 FourCC + 4 size(=10) + 4 flags + 3 width + 3 height = 18 bytes
  const vp8x = new Uint8Array(18);
  writeFourCC(vp8x, 0, 'VP8X');
  writeUint32LE(vp8x, 4, 10);
  vp8x[8] = 0x08; // flags: EXIF present
  const w = width - 1;
  vp8x[12] = w & 0xFF; vp8x[13] = (w >> 8) & 0xFF; vp8x[14] = (w >> 16) & 0xFF;
  const h = height - 1;
  vp8x[15] = h & 0xFF; vp8x[16] = (h >> 8) & 0xFF; vp8x[17] = (h >> 16) & 0xFF;

  // Grab the original image chunk (header + data + possible pad byte)
  const imgSize = readUint32LE(webp, 16);
  const imgTotal = 8 + imgSize + (imgSize % 2);
  const imgChunk = webp.slice(12, 12 + imgTotal);

  // Assemble: RIFF header + "WEBP" + VP8X + image chunk + EXIF chunk
  const payloadSize = 4 + vp8x.length + imgChunk.length + exifChunk.length;
  const result = new Uint8Array(8 + payloadSize);
  writeFourCC(result, 0, 'RIFF');
  writeUint32LE(result, 4, payloadSize);
  writeFourCC(result, 8, 'WEBP');
  let off = 12;
  result.set(vp8x, off);      off += vp8x.length;
  result.set(imgChunk, off);   off += imgChunk.length;
  result.set(exifChunk, off);
  return result;
};

// Public API: write EXIF metadata into a WebP data URL
export const writeExifToWebp = (
  webpDataUrl: string,
  title: string,
  tags: string,
  author: string,
  copyright: string
): string => {
  const exifPayload = buildExifPayload(title, tags, author, copyright);
  if (!exifPayload) return webpDataUrl; // nothing to embed

  // Decode data URL → bytes
  const base64 = webpDataUrl.split(',')[1];
  const bin = atob(base64);
  const webpBytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) webpBytes[i] = bin.charCodeAt(i);

  const resultBytes = injectExifIntoWebp(webpBytes, exifPayload);

  // Encode bytes → data URL (chunked to avoid stack overflow on large images)
  let resultBin = '';
  const chunk = 8192;
  for (let i = 0; i < resultBytes.length; i += chunk) {
    resultBin += String.fromCharCode(...resultBytes.subarray(i, Math.min(i + chunk, resultBytes.length)));
  }
  return 'data:image/webp;base64,' + btoa(resultBin);
};
