import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";

const router = Router();
const HOME_DIR = "/var/fylesync/home";

router.post("/register", async (req, res) => {
  try {
    const { username, password, name, surname, email, role, quotaMb } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "username y password son requeridos"
      });
    }

    // 1. Aprovisionar físicamente el directorio en Almacenamiento Central (/var/fylesync/home/<username>)
    const userHome = path.join(HOME_DIR, username);
    let fsCreated = false;
    try {
      await fs.mkdir(userHome, { recursive: true });
      const welcomeFile = path.join(userHome, "BIENVENIDO.txt");
      try {
        await fs.access(welcomeFile);
      } catch {
        const welcomeContent = `==============================================\n` +
          `  FyleSync Enterprise - Repositorio de Usuario\n` +
          `==============================================\n` +
          `Usuario: ${username}\n` +
          `Rol: ${role || "Investigador"}\n` +
          `Fecha de Aprovisionamiento: ${new Date().toISOString()}\n` +
          `Directorio: ${userHome}\n`;
        await fs.writeFile(welcomeFile, welcomeContent, "utf8");
      }
      fsCreated = true;
    } catch (fsErr) {
      console.warn("No se pudo crear directorio físico en streaming-server:", fsErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `Usuario ${username} registrado y directorio de almacenamiento inicializado.`,
      data: {
        username,
        role: role || "INVESTIGADOR",
        homeDirectory: userHome,
        storageCreated: fsCreated
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
