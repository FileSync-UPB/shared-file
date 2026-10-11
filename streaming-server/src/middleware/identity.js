import mysql from "mysql2/promise";
import crypto from "node:crypto";
import { config } from "../config.js";

const pool = mysql.createPool(config.db);

export async function identityMiddleware(req, res, next) {
  const authHeader = req.get("authorization");
  let token = req.query.token;

  if (!token) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Allow guest access for public shared links (content and metadata)
      if (req.method === "GET" && req.path.match(/\/files\/[^/]+(\/content)?$/)) {
        req.user = { id: null, role: 'guest', permissions: '[]' };
        return next();
      }
      return res.status(401).json({ error: "Missing or invalid authorization header/token" });
    }
    token = authHeader.split(" ")[1];
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const [rows] = await pool.query(
      "SELECT username, role_code, permissions_json FROM auth_tokens WHERE token_hash = ? AND active = 1 AND expires_at > NOW()",
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = {
      id: rows[0].username,
      role: rows[0].role_code,
      permissions: rows[0].permissions_json
    };
    next();
  } catch (error) {
    console.error("DB Auth error:", error);
    res.status(500).json({ error: "Authentication failed due to server error" });
  }
}