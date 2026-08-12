import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  // Pastikan hanya menerima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Hanya menerima POST request' });
  }

  try {
    // Tangkap prompt, image (base64), dan mimeType yang dikirim dari frontend
    const { prompt, image, mimeType } = req.body;
    
    // Key aman di sisi server Vercel
    // Catatan: Ke depannya sangat disarankan menggunakan process.env.GEMINI_API_KEY
    const ai = new GoogleGenAI({ apiKey: "AQ.Ab8RN6KlqG4ptvP2DF0iOdz4gQBYRXn04W3Dspszyq6g-LfNrA" });
    
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
    
    // Panggil model Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', 
      contents: [{
        role: 'user',
        parts: parts
      }],
      // Anda bisa menambahkan config seperti di frontend sebelumnya
      config: { 
        temperature: 0.4, 
        maxOutputTokens: 1500 
      }
    });

    // Kembalikan hasil teks ke frontend
    return res.status(200).json({ text: response.text });
    
  } catch (error) {
    console.error("[Gemini API Error]:", error);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan pada server' });
  }
}
