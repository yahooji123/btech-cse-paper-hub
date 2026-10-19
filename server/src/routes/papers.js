import { Router } from "express";
import mongoose from "mongoose";
import Paper from "../models/Paper.js";

const router = Router();

function normalizePaper(paper) {
  const semesters = paper.semesters?.length ? paper.semesters : [paper.semester];
  return { ...paper, semesters, semester: semesters[0] };
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
    const [semesters, legacySemesters, years, subjects, total] = await Promise.all([
      Paper.distinct("semester"),
      Paper.distinct("semesters"),
      Paper.distinct("academicYear"),
      Paper.distinct("subject"),
      Paper.countDocuments(),
    ]);
    const allSemesters = [...new Set([...semesters, ...legacySemesters].filter(Number.isInteger))];
    res.json({ semesters: allSemesters.sort((a,b)=>a-b), years: years.sort().reverse(), subjects: subjects.sort(), total });
  } catch (err) { next(err); }
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
