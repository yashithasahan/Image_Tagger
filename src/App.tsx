import { useState, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { convertToJpeg, convertToWebp, writeExifData, writeExifToWebp } from './utils/exifUtils';
import './index.css';

function App() {
  const [jpegDataUrl, setJpegDataUrl] = useState<string>('');
  const [webpDataUrl, setWebpDataUrl] = useState<string>('');
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [webpSize, setWebpSize] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [author, setAuthor] = useState('');
  const [copyright, setCopyright] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (selectedFile: File) => {
    try {
      setOriginalSize(selectedFile.size);

      // Convert to JPEG for tagging
      const dataUrl = await convertToJpeg(selectedFile);
      setJpegDataUrl(dataUrl);

      // Pre-compute WebP for size estimation and immediate download
      const webpUrl = await convertToWebp(selectedFile);
      setWebpDataUrl(webpUrl);
      
      const base64Length = webpUrl.length - 'data:image/webp;base64,'.length;
      const padding = (webpUrl.match(/=*$/) || [''])[0].length;
      setWebpSize((base64Length * (3 / 4)) - padding);
      
      // Pre-fill title with filename without extension
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
      setTags('');
      setAuthor('');
      setCopyright('');
    } catch (error) {
      console.error('Failed to load image:', error);
      alert('Failed to load image. Please try another one.');
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSaveJpg = () => {
    if (!jpegDataUrl) return;
    
    try {
      const taggedJpeg = writeExifData(jpegDataUrl, title, tags, author, copyright);
      
      const link = document.createElement('a');
      link.href = taggedJpeg;
      const safeTitle = title.trim() ? title : 'tagged_image';
      link.download = `${safeTitle}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to write metadata:', error);
      alert('Failed to write metadata to image.');
    }
  };

  const handleSaveWebp = () => {
    if (!webpDataUrl) return;
    
    try {
      // Experimental: try injecting EXIF into WebP
      let downloadUrl = webpDataUrl;
      try {
        downloadUrl = writeExifToWebp(webpDataUrl, title, tags, author, copyright);
      } catch (exifErr) {
        console.warn('WebP EXIF injection failed, downloading without tags:', exifErr);
      }
      
      const base64 = downloadUrl.split(',')[1];
      const byteStr = atob(base64);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      
      const blob = new Blob([bytes], { type: 'image/webp' });
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      const safeTitle = title.trim() ? title : 'converted_image';
      link.download = `${safeTitle}.webp`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Failed to convert to WebP:', error);
      alert('Failed to convert image to WebP.');
    }
  };

  const handleClear = () => {
    setJpegDataUrl('');
    setWebpDataUrl('');
    setOriginalSize(0);
    setWebpSize(0);
    setTitle('');
    setTags('');
    setAuthor('');
    setCopyright('');
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Image Tagger</h1>
        <p>Embed title and tags directly into your image metadata.</p>
      </div>

      {!jpegDataUrl ? (
        <div 
          className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">📸</div>
          <h3>Drag & Drop an image here</h3>
          <p>or click to browse</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={onFileSelect} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />
        </div>
      ) : (
        <div className="preview-container">
          <button className="btn-secondary" onClick={handleClear}>
            ← Choose another image
          </button>
          
          <img src={jpegDataUrl} alt="Preview" className="image-preview" />
          
          <div className="size-comparison" style={{
            display: 'flex', 
            justifyContent: 'space-around', 
            background: 'var(--bg-color)', 
            border: '1px solid var(--border-color)',
            padding: '15px', 
            borderRadius: '8px',
            margin: '20px 0',
            textAlign: 'center'
          }}>
            <div>
              <div style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>Original Size</div>
              <div style={{ fontWeight: 'bold', color: '#d9534f', fontSize: '1.2em' }}>{formatSize(originalSize)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>➔</div>
            <div>
              <div style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>WebP Size</div>
              <div style={{ fontWeight: 'bold', color: '#5cb85c', fontSize: '1.2em' }}>{formatSize(webpSize)}</div>
            </div>
          </div>
          
          <div className="input-group">
            <label htmlFor="title">Image Title (XPTitle)</label>
            <input 
              id="title"
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Summer Vacation"
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="tags">Tags / Keywords (comma separated)</label>
            <input 
              id="tags"
              type="text" 
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., nature, outdoor, fun"
            />
          </div>

          <div className="input-group">
            <label htmlFor="author">Author / Artist</label>
            <input 
              id="author"
              type="text" 
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g., John Doe"
            />
          </div>

          <div className="input-group">
            <label htmlFor="copyright">Copyright</label>
            <input 
              id="copyright"
              type="text" 
              value={copyright}
              onChange={(e) => setCopyright(e.target.value)}
              placeholder="e.g., © 2026 John Doe"
            />
          </div>
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button className="btn-primary" onClick={handleSaveJpg} style={{ flex: 1 }}>
              Save Tags (JPG)
            </button>
            <button className="btn-secondary" onClick={handleSaveWebp} style={{ flex: 1 }}>
              Convert to WebP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
