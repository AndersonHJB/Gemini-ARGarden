import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeGarden = async (imageBase64: string, flowerCount: number): Promise<string> => {
  try {
    const prompt = `
      You are a digital gardener and poet. 
      Analyze this image of an augmented reality garden overlaying a person's room. 
      There are ${flowerCount} flowers in this digital garden.
      Describe the vibe of the garden, the colors, and the relationship between the digital nature and the physical space.
      Keep it brief (max 3 sentences), whimsical, and encouraging.
    `;

    // Remove the data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    return response.text || "The garden is mysterious and silent today.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "The spirits of the garden are resting (API Error).";
  }
};