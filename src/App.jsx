import { useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function App() {
  const [jsonData, setJsonData] = useState(null);
  const [images, setImages] = useState(null);
  const [fonts, setFonts] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setOriginalFile(file);
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('psd', file);

    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${BACKEND_URL}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const { json, images, fonts } = await response.json();
      setJsonData(json);
      setImages(images);
      setFonts(fonts);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to process PSD file');
      setJsonData(null);
      setImages(null);
      setFonts(null);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadAsZip = async () => {
    if (!jsonData || !originalFile || !images || !fonts) return;

    setIsLoading(true);
    setError(null);

    try {
      const zip = new JSZip();
      const fontsFolder = zip.folder('fonts');
      const jsonFolder = zip.folder('json');
      const logsFolder = zip.folder('logs');
      const skinsFolder = zip.folder('skins').folder(jsonData.name);

      // Add fonts.txt with detected font names
      fontsFolder.file('fonts.txt',
        `Detected fonts:\n${fonts.length > 0 ? fonts.join('\n') : 'No fonts detected'}`);

      // Add JSON data
      jsonFolder.file(`${jsonData.name}.json`, JSON.stringify(jsonData, null, 2));

      // Add logs
      logsFolder.file(`${jsonData.name}.log`,
        `PSD processed on ${new Date().toISOString()}\n` +
        `Original file: ${originalFile.name}\n` +
        `Document layers: ${jsonData.layers.length}\n` +
        `Images processed: ${images.length}\n` +
        `Fonts detected: ${fonts.length}`
      );

      // Add images to skins/[psdName]
      for (const img of images) {
        try {
          const base64Data = img.base64.split(',')[1];
          skinsFolder.file(img.name, base64Data, { base64: true });
        } catch (err) {
          console.error(`Error adding image ${img.name} to ZIP:`, err);
          logsFolder.file(`${jsonData.name}_errors.log`, `Error adding image ${img.name}: ${err.message}\n`, { append: true });
        }
      }

      // Fetch font files
      try {
        const fontResponse = await fetch(`${BACKEND_URL}/fonts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fonts })
        });
        if (fontResponse.ok) {
          const fontFiles = await fontResponse.json();
          for (const font of fontFiles) {
            fontsFolder.file(font.name, font.data, { base64: true });
          }
        }
      } catch (err) {
        console.error('Failed to fetch font files:', err);
        logsFolder.file(`${jsonData.name}_errors.log`, `Failed to fetch font files: ${err.message}\n`, { append: true });
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const zipName = `${jsonData.name}.zip`;
      saveAs(content, zipName);
    } catch (err) {
      console.error('Download error:', err);
      setError(err.message || 'Failed to create ZIP');
    } finally {
      setIsLoading(false);
    }
  };

  const sanitizeFilename = (name) => {
    return name ? name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() : 'unnamed';
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-6 rounded-lg shadow-lg">
        <h1 className="text-2xl font-semibold mb-4 text-center">PSD to JSON Converter</h1>

        <input
          type="file"
          accept=".psd"
          onChange={handleUpload}
          disabled={isLoading}
          className="mb-4 block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0 file:bg-blue-500 file:text-white
            file:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {error && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
            Error: {error}
          </div>
        )}

        {isLoading && (
          <div className="mb-4 p-2 bg-blue-100 text-blue-700 rounded text-sm">
            Processing...
          </div>
        )}

        {jsonData && (
          <button
            onClick={downloadAsZip}
            disabled={isLoading}
            className="mb-4 py-2 px-4 bg-green-500 text-white rounded-md
              hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed w-full"
          >
            {isLoading ? 'Preparing ZIP...' : 'Download ZIP'}
          </button>
        )}

        <div className="bg-gray-50 p-4 rounded max-h-96 overflow-auto text-sm">
          <pre className="text-left whitespace-pre-wrap">
            {jsonData
              ? JSON.stringify(jsonData, null, 2)
              : error
                ? 'Error occurred during processing'
                : 'Upload a PSD file to see the JSON output'}
          </pre>
        </div>
      </div>
    </div>
  );
}