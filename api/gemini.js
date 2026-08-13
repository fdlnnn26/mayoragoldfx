import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  // Pastikan hanya menerima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Hanya menerima POST request' });
  }

  try {
    // Tangkap prompt, image (base64), dan mimeType yang dikirim dari frontend
    const { prompt, image, mimeType } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt wajib diisi' });
    }

    // API key dibaca dari Environment Variable Vercel (GEMINI_API_KEY)
    // JANGAN hardcode key di sini. Tambahkan di:
    // Vercel Dashboard -> Project -> Settings -> Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('[Gemini API Error]: GEMINI_API_KEY belum di-set di Environment Variables Vercel');
      return res.status(500).json({ error: 'Server belum dikonfigurasi (API key tidak ditemukan)' });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Siapkan array parts untuk menampung teks
    const parts = [{ text: prompt }];

    // Jika ada gambar yang dikirim, tambahkan ke dalam array parts
    if (image && mimeType) {
      parts.push({
        inlineData: {
          data: image,
          mimeType: mimeType
        }
      });
    }

    // Panggil model Gemini (model stabil terbaru per Agustus 2026)
const response = await ai.models.generateContent({
  model: 'gemini-3.6-flash',
  contents: [{
    role: 'user',
    parts: parts
  }],
  config: {
    maxOutputTokens: 1500
    // temperature dihapus — deprecated di Gemini 3.6 Flash
  }
});

    // Kembalikan hasil teks ke frontend
    return res.status(200).json({ text: response.text });

  } catch (error) {
    console.error('[Gemini API Error]:', error);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan pada server' });
  }
}
