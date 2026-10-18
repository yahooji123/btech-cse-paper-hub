import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import multer from "multer";
import Paper from "../models/Paper.js";
import cloudinary from "../config/cloudinary.js";
import { requireAdmin } from "../middleware/adminAuth.js";

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
    const { title, semester, subject, subjectCode, examType, academicYear } = req.body;
    if (!title?.trim() || !subject?.trim() || !academicYear?.trim()) {
      return res.status(400).json({ message: "Title, subject, and academic year are required." });
    }
    const sem = Number(semester);
    if (!Number.isInteger(sem) || sem < 1 || sem > 8) return res.status(400).json({ message: "Semester must be between 1 and 8." });
    if (!["MTE", "ETE"].includes(examType)) return res.status(400).json({ message: "Exam type must be MTE or ETE." });

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
      semester: sem,
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

router.patch("/papers/:id", requireAdmin, async (req, res, next) => {
  try {
    const allowed = ["title", "semester", "subject", "subjectCode", "examType", "academicYear"];
    const updates = {};
    for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
    if (updates.semester !== undefined) {
      updates.semester = Number(updates.semester);
      if (!Number.isInteger(updates.semester) || updates.semester < 1 || updates.semester > 8) return res.status(400).json({ message: "Semester must be between 1 and 8." });
    }
    if (updates.examType !== undefined && !["MTE", "ETE"].includes(updates.examType)) return res.status(400).json({ message: "Exam type must be MTE or ETE." });
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
