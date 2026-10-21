import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: "Paper", required: false },
    paperTitle: { type: String, trim: true, maxlength: 180, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    message: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Feedback", feedbackSchema);
