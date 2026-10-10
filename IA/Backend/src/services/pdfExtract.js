const pdf = require('pdf-parse');

async function extractText(filePath, mimeType) {
  try {
    if (!mimeType || mimeType.includes('pdf')) {
      const fs = require('fs');
      const buffer = fs.readFileSync(filePath);
      const data = await pdf(buffer);
      return data.text || '';
    }
  } catch (e) {
    console.error('[PDF] extraction echouee :', e.message);
  }
  return '';
}

module.exports = { extractText };
