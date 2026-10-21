import jwt from "jsonwebtoken";
import SiteSettings from "../models/SiteSettings.js";

function isAdminRequest(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  try {
    return jwt.verify(token, process.env.ADMIN_SESSION_SECRET).role === "admin";
  } catch {
    return false;
  }
}

export async function maintenanceGuard(req, res, next) {
  if (isAdminRequest(req)) return next();
  try {
    const settings = await SiteSettings.findOne({ key: "site" }).select("maintenanceMode").lean();
    if (settings?.maintenanceMode) {
      return res.status(503).json({ maintenance: true, message: "Website is under maintenance. Please try again later." });
    }
    next();
  } catch (err) {
    next(err);
  }
}
