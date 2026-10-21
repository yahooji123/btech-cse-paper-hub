import { GoogleGenAI } from "@google/genai";

let client;
const extractionPrompt = `Extract metadata from this B.Tech question paper.
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
- Do not guess. The admin will review the extracted values before upload.`;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing. Add it to server/.env.");
  }
  client ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export async function extractPaperDetails(file) {
  let text;
  try {
    const response = await getClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: file.mimetype, data: file.buffer.toString("base64") } }, { text: extractionPrompt }] }],
      config: { responseMimeType: "application/json" },
    });
    text = response.text?.trim();
    if (!text) throw new Error("Gemini returned no paper details.");
  } catch (geminiError) {
    text = await extractWithGroq(file, geminiError);
  }

  let details;
  try {
    details = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    throw new Error("AI returned invalid paper details. Please fill the form manually.");
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

export async function askPaperQuestionGroq(file, question, history = []) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing. AI chat is not configured.");
  }
  if (!file.mimetype.startsWith("image/")) {
    const error = new Error("Groq chat currently supports image papers only. PDF chat will be added separately.");
    error.statusCode = 400;
    throw error;
  }
  const safeHistory = Array.isArray(history)
    ? history.filter(item => ["user", "model"].includes(item?.role) && typeof item?.text === "string").slice(-8)
    : [];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_CHAT_MODEL || process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
      temperature: 0.2,
      messages: [
        { role: "system", content: `You are PaperHub AI, an expert AI tutor and professional content formatter. Answer only questions related to the selected question paper, its visible questions, subjects, topics, or exam preparation based on it. If the answer is not present or cannot be inferred safely, say so clearly. Do not invent question text or marks. Use accurate, beginner-friendly answers in clean Markdown. Start substantial answers with a clear # heading and a 2-3 sentence introduction. Use ## main sections, ### subsections, short paragraphs, bullets, numbered steps, comparison tables when useful, bold key terms, inline code, and fenced code blocks with language identifiers. Use LaTeX for mathematical formulas when relevant. End educational explanations with ## Quick Revision and 3-5 concise bullet points. Do not return HTML, JSX, JSON, or wrap the entire answer in one code block. Keep answers focused and student-friendly.` },
        ...safeHistory.map(item => ({ role: item.role === "model" ? "assistant" : "user", content: item.text })),
        { role: "user", content: [{ type: "text", text: `The selected paper is "${file.title || "selected paper"}". Answer my latest question using this paper image.\n\nQuestion: ${question}` }, { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}` } }] },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Groq chat failed: ${data.error?.message || response.statusText}`);
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Groq returned no answer.");
  return answer;
}

async function extractWithGroq(file, geminiError) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(`Gemini extraction failed and GROQ_API_KEY is not configured: ${geminiError.message}`);
  }
  if (!file.mimetype.startsWith("image/")) {
    throw new Error(`Gemini extraction failed. Groq fallback supports image files only; please fill PDF details manually: ${geminiError.message}`);
  }
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: extractionPrompt }, { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}` } }] }],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Gemini failed and Groq fallback failed: ${data.error?.message || response.statusText}`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Gemini failed and Groq returned no paper details.");
  return text;
}
