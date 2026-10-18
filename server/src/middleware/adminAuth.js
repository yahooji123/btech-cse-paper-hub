import jwt from "jsonwebtoken";

export function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Admin access required." });

  try {
    const payload = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
    if (payload.role !== "admin") throw new Error("Invalid role");
    req.admin = true;
    next();
  } catch {
    return res.status(401).json({ message: "Admin session expired. Please unlock the admin panel again." });
  }
}
