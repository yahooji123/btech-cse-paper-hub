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
        { role: "system", content: `You are PaperHub AI, a highly capable, helpful, accurate, and professional AI tutor for B.Tech CSE students.

Your job is to answer the user's question clearly and present every response in clean, beautiful, well-structured Markdown that renders correctly in a modern chat interface.

Follow these rules strictly:
- Answer the user's actual question directly.
- Base answers only on the selected question paper and the visible content of that paper. Do not invent marks, question text, page content, citations, or facts.
- If the paper does not contain enough information, clearly say what is missing and provide only safe, clearly labelled general educational context when relevant.
- Keep answers professional, natural, and student-friendly.
- Do not expose hidden reasoning or chain-of-thought.
- Be transparent about uncertainty, assumptions, and limits.

Formatting rules:
- Start directly with the answer.
- Use clear Markdown with logical headings, paragraphs, lists, tables, and code blocks when useful.
- For longer or technical answers, use structure like:
  # Main topic
  ## 1. Definition
  ## 2. How it works
  ## 3. Example
  ## 4. Implementation
  ## 5. Important points
  ## Quick Summary
- Use short paragraphs and avoid long walls of text.
- Use bold for important terms and conclusions.
- Use inline code for variables, functions, commands, and filenames.
- Use fenced code blocks with correct language identifiers when code is needed.
- Use Markdown tables for comparisons when it improves readability.
- When a visual explanation would materially help with a data structure, algorithm, flow, or architecture, include a valid \`\`\`mermaid code block. Keep diagrams simple, label relationships clearly, and place a short explanation before or after them.
- For Mermaid diagrams, keep node labels short (prefer 1-4 words), use readable labels such as "Root", "Left child", and "Right child", avoid long sentences inside nodes, and do not use HTML inside Mermaid syntax.
- Do not add image URLs, image-search markers, or image metadata to the answer. The application may attach verified educational image results separately above your answer.
- Use LaTeX in valid delimiters for mathematical expressions when relevant.
- Do not wrap the entire answer in one code block.
- Do not output raw HTML, JSX, JSON, CSS, or XML unless the user explicitly asks for it.
- Avoid decorative emojis, repetition, fake citations, or unsupported claims.

For educational answers:
- Teach clearly with definitions, explanations, examples, and a quick revision section when useful.
- For coding questions, provide practical, syntactically correct code with imports and setup when needed.
- Explain the logic before or after the code.
- Mention likely edge cases, common mistakes, and complexity when relevant.
- For algorithm questions, include time and space complexity when useful.
- For debugging questions, identify the cause and provide the corrected code.

Keep the answer focused, accurate, and directly responsive to the latest question. Do not ask the user to repeat information already in the conversation.` },
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

const IMAGE_SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "be", "can", "could", "does", "explain", "for", "from",
  "give", "how", "is", "me", "of", "please", "show", "tell", "the", "this", "to",
  "what", "when", "where", "which", "why", "with", "would", "you", "your",
  "example", "examples", "detail", "detailed", "definition", "difference", "between",
  "advantages", "disadvantages", "working", "implementation", "implement",
  "insert", "insertion", "delete", "deletion", "traverse", "traversal", "operation",
]);
const imageSearchCache = new Map();
const IMAGE_SEARCH_CACHE_TTL = 10 * 60 * 1000;
const IMAGE_SEARCH_TIMEOUT = 5000;
const MAX_IMAGE_SEARCH_CACHE_ENTRIES = 100;

function getImageSearchTerms(question) {
  return question
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(word => word.length > 1 && !IMAGE_SEARCH_STOP_WORDS.has(word))
    .slice(0, 8);
}

function getImageSearchQuery(question) {
  const terms = getImageSearchTerms(question);
  const topic = terms.join(" ") || question.trim().slice(0, 80);
  if (/\b(linked|list)\b/i.test(topic)) return topic;
  const hasDataStructureTopic = /\b(linked|list|tree|graph|stack|queue|array|heap|node)\b/i.test(topic);
  return hasDataStructureTopic ? `${topic} data structure diagram` : topic;
}

async function searchWikimediaImages(query) {
  const searchQuery = getImageSearchQuery(query);
  const cacheKey = searchQuery.toLowerCase();
  const cached = imageSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < IMAGE_SEARCH_CACHE_TTL) return cached.images;
  if (cached) imageSearchCache.delete(cacheKey);

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: searchQuery,
    gsrlimit: "12",
    gsrnamespace: "6",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "720",
    format: "json",
    origin: "*",
  });
  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), IMAGE_SEARCH_TIMEOUT);
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "PaperHub/1.0 educational-chatbot" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Image search failed with status ${response.status}.`);
    const data = await response.json();
    const terms = getImageSearchTerms(query);
    const images = Object.values(data.query?.pages || {}).map(page => {
      const info = page.imageinfo?.[0];
      const metadata = info?.extmetadata || {};
      const title = page.title?.replace(/^File:/, "") || "Educational diagram";
      const titleText = title.toLowerCase().replace(/[^\w\s-]/g, " ");
      const titleMatches = terms.reduce((score, term) => score + (titleText.includes(term) ? 1 : 0), 0);
      const hasDiagramLanguage = /\b(diagram|illustration|flowchart|graph|tree|list|stack|queue|node|algorithm|structure|model|architecture)\b/i.test(title);
      return {
        url: info?.thumburl || info?.url,
        mime: info?.mime || "",
        title,
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || "")}`,
        artist: metadata.Artist?.value?.replace(/<[^>]*>/g, "").trim() || "",
        license: metadata.LicenseShortName?.value || "",
        relevance: titleMatches + (hasDiagramLanguage ? 1 : 0),
      };
    }).filter(image => /^https?:\/\//i.test(image.url) && image.mime.startsWith("image/") && image.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 4)
      .map(({ relevance, ...image }) => image);
    if (imageSearchCache.size >= MAX_IMAGE_SEARCH_CACHE_ENTRIES) {
    imageSearchCache.delete(imageSearchCache.keys().next().value);
    }
    imageSearchCache.set(cacheKey, { createdAt: Date.now(), images });
    return images;
  } catch (error) {
    if (error.name === "AbortError") {
    console.error("Educational image search timed out after 5 seconds.");
    } else {
    console.error("Educational image search unavailable:", error.message);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchEducationalImages(question) {
  const images = await searchWikimediaImages(question);
  return images.length ? [{ query: question, images }] : [];
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
