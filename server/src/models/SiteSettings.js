import mongoose from "mongoose";

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    maintenanceMode: { type: Boolean, default: false },
    missingRequestEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("SiteSettings", siteSettingsSchema);
