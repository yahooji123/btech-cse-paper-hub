import mongoose from "mongoose";

const paperRequestSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    semester: { type: Number, required: true, min: 1, max: 8 },
    examType: { type: String, required: true, enum: ["MTE", "ETE"] },
    academicYear: { type: String, required: true, trim: true, match: /^\d{4}$/ },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    status: { type: String, enum: ["pending", "fulfilled"], default: "pending" },
  },
  { timestamps: true }
);

export default mongoose.model("PaperRequest", paperRequestSchema);
