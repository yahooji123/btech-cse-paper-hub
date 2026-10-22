import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import papersRouter from "./routes/papers.js";
import adminRouter from "./routes/admin.js";
import SiteSettings from "./models/SiteSettings.js";
import { maintenanceGuard } from "./middleware/maintenance.js";
import requestsRouter from "./routes/requests.js";
import feedbackRouter from "./routes/feedback.js";


const app = express();
const port = process.env.PORT || 5000;
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map(s => s.trim());
app.use(cors({ origin(origin, callback) {
  const isLocalDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
  if (!origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin) return callback(null, true);
  return callback(new Error("Origin not allowed by CORS"));
}}));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "B.Tech CSE Paper Hub API" }));
app.get("/api/status", async (_req, res, next) => {
  try {
    const settings = await SiteSettings.findOne({ key: "site" }).select("maintenanceMode missingRequestEnabled announcementEnabled announcementText feedbackEnabled aiChatEnabled solutionEnabled").lean();
    res.json({ maintenanceMode: Boolean(settings?.maintenanceMode), missingRequestEnabled: Boolean(settings?.missingRequestEnabled), announcementEnabled: Boolean(settings?.announcementEnabled), announcementText: settings?.announcementText || "", feedbackEnabled: Boolean(settings?.feedbackEnabled), aiChatEnabled: settings?.aiChatEnabled !== false, solutionEnabled: Boolean(settings?.solutionEnabled) });
  } catch (err) { next(err); }
});
app.use("/api/papers", maintenanceGuard, papersRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/admin", adminRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.name === "MulterError") return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? `File is too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 20} MB.` : err.message });
  if (err.message?.includes("Only PDF and image")) return res.status(400).json({ message: err.message });
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
  if (err.message?.includes("GEMINI_API_KEY") || err.message?.includes("Gemini") || err.message?.includes("GROQ_API_KEY") || err.message?.includes("Groq")) return res.status(502).json({ message: err.message });
  if (err.code === 11000 && (err.keyPattern?.duplicateKey || err.keyPattern?.titleKey)) return res.status(409).json({ message: "This paper already exists. Duplicate paper was not saved." });
  res.status(500).json({ message: "Something went wrong. Check server configuration and logs." });
});


try {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing. Copy .env.example to .env and configure it.");
  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(port, () => console.log(`Paper Hub API running on http://localhost:${port}`));
} catch (err) {
  console.error("Startup failed:", err.message);
  process.exit(1);
}
