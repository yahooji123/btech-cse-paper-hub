import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import multer from "multer";
import Paper from "../models/Paper.js";
import cloudinary from "../config/cloudinary.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { extractPaperDetails } from "../config/gemini.js";
import SiteSettings from "../models/SiteSettings.js";
import PaperRequest from "../models/PaperRequest.js";
import Feedback from "../models/Feedback.js";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password attempts. Please wait 15 minutes." },
});
const maxBytes = Math.max(1, Number(process.env.MAX_FILE_SIZE_MB || 20)) * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === "application/pdf" || file.mimetype.startsWith("image/");
    cb(ok ? null : new Error("Only PDF and image files are supported."), ok);
  },
});

function parseSemesters(value) {
  let values = value;
  if (typeof value === "string") {
    try { values = JSON.parse(value); } catch { values = value.split(","); }
  }
  if (!Array.isArray(values)) values = [values];
  const semesters = [...new Set(values.map(Number))];
  return semesters.length > 0 && semesters.every(number => Number.isInteger(number) && number >= 1 && number <= 8) ? semesters.sort((a, b) => a - b) : null;
}

function validateAcademicYear(value) {
  return typeof value === "string" && /^\d{4}$/.test(value.trim());
}

function normalizeForKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function makeTitleKey(value) {
  return normalizeForKey(value).replace(/[^a-z0-9]+/g, "");
}

function makeDuplicateKey({ subject, academicYear, examType, semesters }) {
  return [
    normalizeForKey(subject),
    normalizeForKey(academicYear),
    normalizeForKey(examType),
    [...semesters].sort((a, b) => a - b).join(","),
  ].join("|");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getStoredPaperFile(paper) {
  const response = await fetch(paper.fileUrl);
  if (!response.ok) throw new Error("The paper file could not be read from storage.");
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimetype: paper.mimeType || response.headers.get("content-type") || "application/pdf",
  };
}

async function findDuplicatePaper({ title, subject, academicYear, examType, semesters, excludeId }) {
  const duplicateKey = makeDuplicateKey({ subject, academicYear, examType, semesters });
  const query = {
    $or: [
      { duplicateKey },
      { title: { $regex: `^${escapeRegex(String(title).trim())}$`, $options: "i" } },
      {
        academicYear: academicYear.trim(),
        examType,
      },
    ],
  };
  if (excludeId) query._id = { $ne: excludeId };
  const candidates = await Paper.find(query).select("_id title titleKey subject academicYear examType semesters semester duplicateKey").limit(500).lean();
  const titleKey = makeTitleKey(title);
  return candidates.find(paper =>
    paper.titleKey === titleKey ||
    makeTitleKey(paper.title) === titleKey ||
    paper.duplicateKey === duplicateKey ||
    (
      normalizeForKey(paper.subject) === normalizeForKey(subject) &&
      paper.academicYear === academicYear.trim() &&
      paper.examType === examType &&
      JSON.stringify([...(paper.semesters || [paper.semester])].sort((a, b) => a - b)) === JSON.stringify([...semesters].sort((a, b) => a - b))
    )
  ) || null;
}

router.post("/unlock", loginLimiter, (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(500).json({ message: "Admin credentials are not configured on the server." });
  }
  if (typeof password !== "string" || password.length > 256 || password !== expected) {
    return res.status(401).json({ message: "Incorrect admin password." });
  }
  const token = jwt.sign({ role: "admin" }, process.env.ADMIN_SESSION_SECRET, { expiresIn: "4h" });
  res.json({ token, expiresIn: 14400 });
});

router.get("/maintenance", requireAdmin, async (_req, res, next) => {
  try {
    const settings = await SiteSettings.findOne({ key: "site" }).select("maintenanceMode").lean();
    res.json({ maintenanceMode: Boolean(settings?.maintenanceMode) });
  } catch (err) { next(err); }
});

router.patch("/maintenance", requireAdmin, async (req, res, next) => {
  try {
    if (typeof req.body?.maintenanceMode !== "boolean") {
      return res.status(400).json({ message: "maintenanceMode must be a boolean." });
    }
    const settings = await SiteSettings.findOneAndUpdate(
      { key: "site" },
      { $set: { maintenanceMode: req.body.maintenanceMode }, $setOnInsert: { key: "site" } },
      { new: true, upsert: true, runValidators: true }
    ).select("maintenanceMode").lean();
    res.json({ maintenanceMode: settings.maintenanceMode });
  } catch (err) { next(err); }
});

router.get("/request-settings", requireAdmin, async (_req, res, next) => {
  try {
    const settings = await SiteSettings.findOne({ key: "site" }).select("missingRequestEnabled").lean();
    res.json({ missingRequestEnabled: Boolean(settings?.missingRequestEnabled) });
  } catch (err) { next(err); }
});

router.patch("/request-settings", requireAdmin, async (req, res, next) => {
  try {
    if (typeof req.body?.missingRequestEnabled !== "boolean") {
      return res.status(400).json({ message: "missingRequestEnabled must be a boolean." });
    }
    const settings = await SiteSettings.findOneAndUpdate(
      { key: "site" },
      { $set: { missingRequestEnabled: req.body.missingRequestEnabled }, $setOnInsert: { key: "site" } },
      { new: true, upsert: true, runValidators: true }
    ).select("missingRequestEnabled").lean();
    res.json({ missingRequestEnabled: settings.missingRequestEnabled });
  } catch (err) { next(err); }
});

router.get("/announcement", requireAdmin, async (_req, res, next) => {
  try {
    const settings = await SiteSettings.findOne({ key: "site" }).select("announcementEnabled announcementText").lean();
    res.json({ announcementEnabled: Boolean(settings?.announcementEnabled), announcementText: settings?.announcementText || "" });
  } catch (err) { next(err); }
});

router.patch("/announcement", requireAdmin, async (req, res, next) => {
  try {
    const { announcementEnabled, announcementText } = req.body || {};
    if (typeof announcementEnabled !== "boolean" || typeof announcementText !== "string" || announcementText.trim().length > 500) {
      return res.status(400).json({ message: "Provide a valid announcement and visibility setting. Maximum length is 500 characters." });
    }
    const settings = await SiteSettings.findOneAndUpdate(
      { key: "site" },
      { $set: { announcementEnabled, announcementText: announcementText.trim() }, $setOnInsert: { key: "site" } },
      { new: true, upsert: true, runValidators: true }
    ).select("announcementEnabled announcementText").lean();
    res.json({ announcementEnabled: settings.announcementEnabled, announcementText: settings.announcementText });
  } catch (err) { next(err); }
});

router.get("/feedback-settings", requireAdmin, async (_req, res, next) => {
  try {
    const settings = await SiteSettings.findOne({ key: "site" }).select("feedbackEnabled").lean();
    res.json({ feedbackEnabled: Boolean(settings?.feedbackEnabled) });
  } catch (err) { next(err); }
});

router.patch("/feedback-settings", requireAdmin, async (req, res, next) => {
  try {
    if (typeof req.body?.feedbackEnabled !== "boolean") {
      return res.status(400).json({ message: "feedbackEnabled must be a boolean." });
    }
    const settings = await SiteSettings.findOneAndUpdate(
      { key: "site" },
      { $set: { feedbackEnabled: req.body.feedbackEnabled }, $setOnInsert: { key: "site" } },
      { new: true, upsert: true, runValidators: true }
    ).select("feedbackEnabled").lean();
    res.json({ feedbackEnabled: settings.feedbackEnabled });
  } catch (err) { next(err); }
});

router.get("/ai-chat-settings", requireAdmin, async (_req, res, next) => {
  try {
    const settings = await SiteSettings.findOne({ key: "site" }).select("aiChatEnabled").lean();
    res.json({ aiChatEnabled: settings?.aiChatEnabled !== false });
  } catch (err) { next(err); }
});

router.patch("/ai-chat-settings", requireAdmin, async (req, res, next) => {
  try {
    if (typeof req.body?.aiChatEnabled !== "boolean") {
      return res.status(400).json({ message: "aiChatEnabled must be a boolean." });
    }
    const settings = await SiteSettings.findOneAndUpdate(
      { key: "site" },
      { $set: { aiChatEnabled: req.body.aiChatEnabled }, $setOnInsert: { key: "site" } },
      { new: true, upsert: true, runValidators: true }
    ).select("aiChatEnabled").lean();
    res.json({ aiChatEnabled: settings.aiChatEnabled });
  } catch (err) { next(err); }
});

router.get("/feedback", requireAdmin, async (_req, res, next) => {
  try {
    const feedback = await Feedback.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json({ feedback });
  } catch (err) { next(err); }
});

router.delete("/feedback/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid feedback ID." });
    const deleted = await Feedback.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Feedback not found." });
    res.json({ message: "Feedback deleted." });
  } catch (err) { next(err); }
});

router.get("/paper-requests", requireAdmin, async (_req, res, next) => {
  try {
    const requests = await PaperRequest.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json({ requests });
  } catch (err) { next(err); }
});

router.delete("/paper-requests/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid request ID." });
    const deleted = await PaperRequest.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Paper request not found." });
    res.json({ message: "Paper request deleted." });
  } catch (err) { next(err); }
});

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

router.post("/papers", requireAdmin, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a PDF or image file." });
    const { title, subject, subjectCode, examType, academicYear } = req.body;
    if (!title?.trim() || !subject?.trim() || !academicYear?.trim()) {
      return res.status(400).json({ message: "Title, subject, and academic year are required." });
    }
    const semesters = parseSemesters(req.body.semesters ?? req.body.semester);
    if (!semesters) return res.status(400).json({ message: "Select at least one semester between 1 and 8." });
    if (!["MTE", "ETE"].includes(examType)) return res.status(400).json({ message: "Exam type must be MTE or ETE." });
    if (!validateAcademicYear(academicYear)) return res.status(400).json({ message: "Academic year must be a four-digit year, like 2025." });
    const duplicateKey = makeDuplicateKey({ subject, academicYear, examType, semesters });
    const titleKey = makeTitleKey(title);
    const existingPaper = await findDuplicatePaper({ title, subject, academicYear, examType, semesters });
    if (existingPaper) {
      return res.status(409).json({ message: "This subject paper for the same academic year, exam type, and semester already exists." });
    }

    const isPdf = req.file.mimetype === "application/pdf";
    const result = await uploadBuffer(req.file.buffer, {
      folder: "btech-cse-paper-hub",
      resource_type: isPdf ? "raw" : "image",
      public_id: `${Date.now()}-${req.file.originalname.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}${isPdf ? ".pdf" : ""}`,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    });

    const paper = await Paper.create({
      title: title.trim(),
      titleKey,
      duplicateKey,
      semester: semesters[0],
      semesters,
      subject: subject.trim(),
      subjectCode: (subjectCode || "").trim(),
      examType,
      academicYear: academicYear.trim(),
      fileType: isPdf ? "pdf" : "image",
      fileUrl: result.secure_url,
      publicId: result.public_id,
      cloudResourceType: result.resource_type,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      bytes: result.bytes || req.file.size,
    });
    res.status(201).json({ paper });
  } catch (err) { next(err); }
});

router.post("/papers/analyze", requireAdmin, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a PDF or image file." });
    const details = await extractPaperDetails(req.file);
    res.json({ details });
  } catch (err) { next(err); }
});

router.post("/papers/:id/analyze", requireAdmin, async (req, res, next) => {
  try {
    const paper = await Paper.findById(req.params.id).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found." });
    const file = await getStoredPaperFile(paper);
    const details = await extractPaperDetails(file);
    res.json({ details });
  } catch (err) { next(err); }
});

router.patch("/papers/:id", requireAdmin, async (req, res, next) => {
  try {
    const allowed = ["title", "semesters", "semester", "subject", "subjectCode", "examType", "academicYear"];
    const updates = {};
    for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
    if (updates.semesters !== undefined || updates.semester !== undefined) {
      const semesters = parseSemesters(updates.semesters ?? updates.semester);
      if (!semesters) return res.status(400).json({ message: "Select at least one semester between 1 and 8." });
      updates.semesters = semesters;
      updates.semester = semesters[0];
    }
    if (updates.examType !== undefined && !["MTE", "ETE"].includes(updates.examType)) return res.status(400).json({ message: "Exam type must be MTE or ETE." });
    if (updates.academicYear !== undefined) {
      if (!validateAcademicYear(updates.academicYear)) return res.status(400).json({ message: "Academic year must be a four-digit year, like 2025." });
      updates.academicYear = updates.academicYear.trim();
    }
    if (updates.subject !== undefined) updates.subject = String(updates.subject).trim();
    if (updates.title !== undefined) updates.title = String(updates.title).trim();
    const currentPaper = await Paper.findById(req.params.id).lean();
    if (!currentPaper) return res.status(404).json({ message: "Paper not found." });
    const duplicateFields = {
      title: updates.title ?? currentPaper.title,
      subject: updates.subject ?? currentPaper.subject,
      academicYear: updates.academicYear ?? currentPaper.academicYear,
      examType: updates.examType ?? currentPaper.examType,
      semesters: updates.semesters ?? currentPaper.semesters ?? [currentPaper.semester],
    };
    const duplicateKey = makeDuplicateKey(duplicateFields);
    const existingPaper = await findDuplicatePaper({ ...duplicateFields, excludeId: req.params.id });
    if (existingPaper) {
      return res.status(409).json({ message: "These details match an existing paper. Duplicate paper was not saved." });
    }
    updates.duplicateKey = duplicateKey;
    updates.titleKey = makeTitleKey(duplicateFields.title);
    const paper = await Paper.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!paper) return res.status(404).json({ message: "Paper not found." });
    res.json({ paper });
  } catch (err) { next(err); }
});

router.delete("/papers/:id", requireAdmin, async (req, res, next) => {
  try {
    const paper = await Paper.findById(req.params.id);
    if (!paper) return res.status(404).json({ message: "Paper not found." });
    await cloudinary.uploader.destroy(paper.publicId, { resource_type: paper.cloudResourceType, invalidate: true });
    await paper.deleteOne();
    res.json({ message: "Paper deleted." });
  } catch (err) { next(err); }
});

export default router;
