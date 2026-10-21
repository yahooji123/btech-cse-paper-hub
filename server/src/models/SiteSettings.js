import mongoose from "mongoose";

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    maintenanceMode: { type: Boolean, default: false },
    missingRequestEnabled: { type: Boolean, default: false },
    announcementEnabled: { type: Boolean, default: false },
    announcementText: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("SiteSettings", siteSettingsSchema);
