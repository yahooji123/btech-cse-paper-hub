import mongoose from "mongoose";

const paperSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    titleKey: { type: String, unique: true, sparse: true, select: false },
    duplicateKey: { type: String, unique: true, sparse: true, select: false },
    // `semester` is retained for older records and sorting; new records use `semesters`.
    semester: { type: Number, min: 1, max: 8 },
    semesters: { type: [Number], required: true, validate: { validator: value => value.length > 0 && value.every(number => Number.isInteger(number) && number >= 1 && number <= 8), message: "At least one valid semester is required." } },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    subjectCode: { type: String, trim: true, maxlength: 40, default: "" },
    examType: { type: String, required: true, enum: ["MTE", "ETE"] },
    academicYear: { type: String, required: true, trim: true, match: /^\d{4}$/, maxlength: 4 },
    fileType: { type: String, required: true, enum: ["pdf", "image"] },
    fileUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    cloudResourceType: { type: String, required: true, enum: ["image", "raw"] },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    bytes: { type: Number, default: 0 },
    solutionFileType: { type: String, enum: ["pdf", "image"] },
    solutionFileUrl: { type: String },
    solutionPublicId: { type: String },
    solutionCloudResourceType: { type: String, enum: ["image", "raw"] },
    solutionOriginalName: { type: String },
    solutionMimeType: { type: String },
    solutionBytes: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0, min: 0 },
    aiQuestionCount: { type: Number, default: 0, min: 0, max: 15 },
  },
  { timestamps: true }
);

paperSchema.index({ semesters: 1, examType: 1, academicYear: 1 });
paperSchema.index({ subject: "text", title: "text", subjectCode: "text" });

export default mongoose.model("Paper", paperSchema);
