import { Router } from "express";
import rateLimit from "express-rate-limit";
import PaperRequest from "../models/PaperRequest.js";
import SiteSettings from "../models/SiteSettings.js";
import { requireAdmin } from "../middleware/adminAuth.js";

const router = Router();
const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

async function isEnabled() {
  const settings = await SiteSettings.findOne({ key: "site" }).select("missingRequestEnabled").lean();
  return Boolean(settings?.missingRequestEnabled);
}

router.post("/", requestLimiter, async (req, res, next) => {
  try {
    if (!await isEnabled()) return res.status(404).json({ message: "Paper requests are currently unavailable." });
    const { subject, semester, examType, academicYear, note } = req.body || {};
    const semesterNumber = Number(semester);
    if (!subject?.trim() || !Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 8) {
      return res.status(400).json({ message: "Subject and a semester between 1 and 8 are required." });
    }
    if (!["MTE", "ETE"].includes(examType) || !/^\d{4}$/.test(String(academicYear || "").trim())) {
      return res.status(400).json({ message: "Choose a valid exam type and four-digit academic year." });
    }
    const paperRequest = await PaperRequest.create({
      subject: subject.trim(),
      semester: semesterNumber,
      examType,
      academicYear: String(academicYear).trim(),
      note: typeof note === "string" ? note.trim() : "",
    });
    res.status(201).json({ request: paperRequest, message: "Your paper request has been sent to the admin." });
  } catch (err) { next(err); }
});

router.get("/", requireAdmin, async (_req, res, next) => {
  try {
    const requests = await PaperRequest.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json({ requests });
  } catch (err) { next(err); }
});

export default router;
