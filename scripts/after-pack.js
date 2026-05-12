"use strict";

// afterPack hook: runs rcedit to properly embed icon into the Windows EXE.
// electron-builder's built-in rcedit integration fails when 7za cannot create
// macOS symlinks during winCodeSign extraction on Windows (exit code 2).

const path = require("path");
const { execFileSync } = require("child_process");
const fs = require("fs");

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  if (packager.platform.name !== "windows") return;

  // Find rcedit.exe bundled with electron-winstaller
  const candidates = [
    path.join(__dirname, "..", "node_modules", "electron-winstaller", "vendor", "rcedit.exe"),
    // Also check electron-builder's cached winCodeSign
    path.join(
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local"),
      "electron-builder", "Cache", "winCodeSign"
    ),
  ];

  let rceditPath = null;
  for (const c of candidates) {
    if (c.endsWith(".exe") && fs.existsSync(c)) {
      rceditPath = c;
      break;
    }
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
      // Search for rcedit-x64.exe in directory and subdirectories
      const find = (dir) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isFile() && /^rcedit.*\.exe$/i.test(entry.name)) return full;
            if (entry.isDirectory()) {
              const found = find(full);
              if (found) return found;
            }
          }
        } catch {}
        return null;
      };
      rceditPath = find(c);
      if (rceditPath) break;
    }
  }

  if (!rceditPath) {
    console.warn("Clawd afterPack: rcedit.exe not found, skipping icon fix");
    return;
  }

  const iconPath = packager.getIconPath
    ? await packager.getIconPath()
    : path.join(__dirname, "..", "assets", "icon.ico");

  if (!iconPath || !fs.existsSync(iconPath)) {
    console.warn("Clawd afterPack: icon.ico not found at", iconPath);
    return;
  }

  // Find the EXE in appOutDir
  const exeName = (context.configuration && context.configuration.productName || packager.appInfo.productName) + ".exe";
  const exePath = path.join(appOutDir, exeName);

  if (!fs.existsSync(exePath)) {
    console.warn("Clawd afterPack: EXE not found at", exePath);
    return;
  }

  console.log("Clawd afterPack: embedding icon with rcedit");
  console.log("  rcedit:", rceditPath);
  console.log("  icon:", iconPath);
  console.log("  exe:", exePath);

  try {
    execFileSync(rceditPath, ["--set-icon", iconPath, exePath], {
      stdio: "inherit",
      timeout: 30000,
    });
    console.log("Clawd afterPack: icon embedded successfully");
  } catch (err) {
    console.error("Clawd afterPack: rcedit failed:", err.message);
  }
};
