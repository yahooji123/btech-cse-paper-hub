import { Router } from "express";
import mongoose from "mongoose";
import Paper from "../models/Paper.js";
import rateLimit from "express-rate-limit";
import { askPaperQuestionGroq, searchEducationalImages } from "../config/gemini.js";
import SiteSettings from "../models/SiteSettings.js";

const router = Router();
const aiChatLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: "Too many AI questions. Please try again later." } });
const MAX_AI_QUESTIONS_PER_PAPER = 15;

function normalizePaper(paper) {
  const semesters = paper.semesters?.length ? paper.semesters : [paper.semester];
  return {
    ...paper,
    semesters,
    semester: semesters[0],
    remainingQuestions: Math.max(0, MAX_AI_QUESTIONS_PER_PAPER - (paper.aiQuestionCount || 0)),
  };
}

router.get("/", async (req, res, next) => {
  try {
    const { semester, examType, academicYear, fileType, q } = req.query;
    const filter = {};
    if (semester && Number.isInteger(Number(semester)) && Number(semester) >= 1 && Number(semester) <= 8) {
      const selectedSemester = Number(semester);
      filter.$and = [{ $or: [{ semesters: selectedSemester }, { semester: selectedSemester }] }];
    }
    if (["MTE", "ETE"].includes(examType)) filter.examType = examType;
    if (academicYear) filter.academicYear = String(academicYear).slice(0, 20);
    if (["pdf", "image"].includes(fileType)) filter.fileType = fileType;
    if (q && String(q).trim()) {
      const term = String(q).trim().slice(0, 80);
      const searchFilter = { $or: [
        { title: { $regex: term, $options: "i" } },
        { subject: { $regex: term, $options: "i" } },
        { subjectCode: { $regex: term, $options: "i" } },
      ] };
      filter.$and = [...(filter.$and || []), searchFilter];
    }
    const papers = await Paper.find(filter).sort({ semester: 1, academicYear: -1, createdAt: -1 }).limit(300).lean();
    res.json({ papers: papers.map(normalizePaper) });
  } catch (err) { next(err); }
});

router.get("/meta", async (_req, res, next) => {
  try {
    const [semesters, legacySemesters, years, subjects, total, downloads] = await Promise.all([
      Paper.distinct("semester"),
      Paper.distinct("semesters"),
      Paper.distinct("academicYear"),
      Paper.distinct("subject"),
      Paper.countDocuments(),
      Paper.aggregate([{ $group: { _id: null, total: { $sum: "$downloadCount" } } }]),
    ]);
    const allSemesters = [...new Set([...semesters, ...legacySemesters].filter(Number.isInteger))];
    res.json({ semesters: allSemesters.sort((a,b)=>a-b), years: years.sort().reverse(), subjects: subjects.sort(), total, totalDownloads: downloads[0]?.total || 0 });
  } catch (err) { next(err); }
});

router.post("/:id/ai-chat", aiChatLimiter, async (req, res, next) => {
  let reserved = false;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid paper ID." });
    const question = typeof req.body?.question === "string" ? req.body.question.trim().slice(0, 1000) : "";
    if (!question) return res.status(400).json({ message: "Ask a question about this paper." });
    const settings = await SiteSettings.findOne({ key: "site" }).select("aiChatEnabled").lean();
    if (settings?.aiChatEnabled === false) return res.status(404).json({ message: "Paper AI chat is currently unavailable." });
    const paper = await Paper.findOneAndUpdate(
      { _id: req.params.id, $or: [{ aiQuestionCount: { $lt: MAX_AI_QUESTIONS_PER_PAPER } }, { aiQuestionCount: { $exists: false } }] },
      { $inc: { aiQuestionCount: 1 } },
      { new: true }
    ).lean();
    if (!paper) {
      const exists = await Paper.exists({ _id: req.params.id });
      return res.status(exists ? 429 : 404).json({ message: exists ? "This paper has reached its 15-question AI limit." : "Paper not found." });
    }
    reserved = true;
    const fileResponse = await fetch(paper.fileUrl);
    if (!fileResponse.ok) {
      const error = new Error("The paper file could not be read for AI chat.");
      error.statusCode = 502;
      throw error;
    }
    const answer = await askPaperQuestionGroq({
      buffer: Buffer.from(await fileResponse.arrayBuffer()),
      mimetype: paper.mimeType || fileResponse.headers.get("content-type") || "application/pdf",
      title: paper.title,
    }, question, req.body?.history);
    const imageGroups = await searchEducationalImages(question);
    const images = imageGroups.flatMap(group => group.images || [])
      .filter((image, index, all) => all.findIndex(item => item.url === image.url) === index)
      .slice(0, 8);
    res.json({ answer, images, remainingQuestions: MAX_AI_QUESTIONS_PER_PAPER - paper.aiQuestionCount });
  } catch (err) {
    if (reserved) {
      try {
        await Paper.updateOne({ _id: req.params.id, aiQuestionCount: { $gt: 0 } }, { $inc: { aiQuestionCount: -1 } });
      } catch (rollbackError) {
        console.error("Failed to release reserved AI question slot:", rollbackError);
      }
    }
    next(err);
  }
});

router.get("/:id/download", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid paper ID." });
    const paper = await Paper.findById(req.params.id).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found." });

    const fileResponse = await fetch(paper.fileUrl);
    if (!fileResponse.ok || !fileResponse.body) {
      return res.status(502).json({ message: "The paper file could not be downloaded from storage." });
    }
    await Paper.updateOne({ _id: paper._id }, { $inc: { downloadCount: 1 } });

    const fallbackName = `${paper.title}.${paper.fileType === "pdf" ? "pdf" : "jpg"}`;
    const filename = (paper.originalName || fallbackName).replace(/[\r\n"]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", fileResponse.headers.get("content-type") || paper.mimeType);
    if (fileResponse.headers.get("content-length")) {
      res.setHeader("Content-Length", fileResponse.headers.get("content-length"));
    }
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

    for await (const chunk of fileResponse.body) res.write(chunk);
    res.end();
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid paper ID." });
    const paper = await Paper.findById(req.params.id).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found." });
    res.json({ paper });
  } catch (err) { next(err); }
});

export default router;
