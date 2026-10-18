import mongoose from "mongoose";

const paperSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    semester: { type: Number, required: true, min: 1, max: 8 },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    subjectCode: { type: String, trim: true, maxlength: 40, default: "" },
    examType: { type: String, required: true, enum: ["MTE", "ETE"] },
    academicYear: { type: String, required: true, trim: true, maxlength: 20 },
    fileType: { type: String, required: true, enum: ["pdf", "image"] },
    fileUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    cloudResourceType: { type: String, required: true, enum: ["image", "raw"] },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    bytes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

paperSchema.index({ semester: 1, examType: 1, academicYear: 1 });
paperSchema.index({ subject: "text", title: "text", subjectCode: "text" });

export default mongoose.model("Paper", paperSchema);
