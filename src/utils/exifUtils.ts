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
