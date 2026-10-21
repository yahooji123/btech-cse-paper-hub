import { Router } from "express";
import rateLimit from "express-rate-limit";
import Feedback from "../models/Feedback.js";
import SiteSettings from "../models/SiteSettings.js";

const router = Router();
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many feedback submissions. Please try again later." },
});

router.post("/", feedbackLimiter, async (req, res, next) => {
  try {
    const settings = await SiteSettings.findOne({ key: "site" }).select("feedbackEnabled").lean();
    if (!settings?.feedbackEnabled) return res.status(404).json({ message: "Feedback is currently unavailable." });
    const { paperId, paperTitle, rating, message } = req.body || {};
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: "Please select a rating between 1 and 5." });
    }
    if (typeof message !== "string" || message.trim().length > 500) {
      return res.status(400).json({ message: "Feedback message must be 500 characters or fewer." });
    }
    const feedback = await Feedback.create({
      paperId: paperId || undefined,
      paperTitle: typeof paperTitle === "string" ? paperTitle.trim() : "",
      rating: numericRating,
      message: message.trim(),
    });
    res.status(201).json({ feedback, message: "Thank you for your feedback." });
  } catch (err) { next(err); }
});

export default router;
