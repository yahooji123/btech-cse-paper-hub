import { GoogleGenAI } from "@google/genai";

let client;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing. Add it to server/.env.");
  }
  client ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export async function extractPaperDetails(file) {
  const response = await getClient().models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: file.mimetype,
            data: file.buffer.toString("base64"),
          },
        },
        {
          text: `Extract metadata from this B.Tech question paper.
Return only valid JSON with exactly these keys:
{
  "title": "Subject Name (Month Year) MTE or ETE",
  "subject": "subject name",
  "subjectCode": "subject code or empty string",
  "examType": "MTE or ETE",
  "academicYear": "four digit year",
  "semesters": [1]
}

Rules:
- title must use the exact format "Subject Name (Month Year) MTE" or "Subject Name (Month Year) ETE".
- Use the month printed on the paper; if no month is visible, use the academic year only inside parentheses.
- semesters must be an array of valid numbers from 1 to 8.
- If a value is not visible or cannot be determined, use an empty string for text values and [] for semesters.
- Do not guess. The admin will review the extracted values before upload.`,
        },
      ],
    }],
    config: { responseMimeType: "application/json" },
  });

  const text = response.text?.trim();
  if (!text) throw new Error("Gemini returned no paper details.");

  let details;
  try {
    details = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid paper details. Please fill the form manually.");
  }

  return {
    title: typeof details.title === "string" ? details.title.trim().slice(0, 180) : "",
    subject: typeof details.subject === "string" ? details.subject.trim().slice(0, 120) : "",
    subjectCode: typeof details.subjectCode === "string" ? details.subjectCode.trim().slice(0, 40) : "",
    examType: ["MTE", "ETE"].includes(details.examType) ? details.examType : "",
    academicYear: /^\d{4}$/.test(String(details.academicYear || "")) ? String(details.academicYear) : "",
    semesters: Array.isArray(details.semesters)
      ? [...new Set(details.semesters.map(Number).filter(number => Number.isInteger(number) && number >= 1 && number <= 8))].sort((a, b) => a - b)
      : [],
  };
}
