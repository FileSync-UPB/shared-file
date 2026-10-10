export function identityMiddleware(req, res, next) {
  // Solo para pruebas locales. No autentica realmente al usuario.
  if (process.env.NODE_ENV === "production") {
    return res.status(503).json({
      error: "Authentication integration is not configured"
    });
  }

  req.user = {
    id: req.get("x-user-id")?.trim() || "demo-user"
  };

  next();
}