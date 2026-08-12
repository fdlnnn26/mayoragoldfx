import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Hanya menerima POST request' });
  }

  try {
    const { prompt } = req.body;
    
    // Key aman di sisi server Vercel
    const ai = new GoogleGenAI({ apiKey: "AQ.Ab8RN6KlqG4ptvP2DF0iOdz4gQBYRXn04W3Dspszyq6g-LfNrA" });
    
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });

    return res.status(200).json({ text: response.text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
