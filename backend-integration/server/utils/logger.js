const fs = require("fs");

const LOG_FILE = "/logs/app.log";

const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function getTimestamp() {
  const now = new Date();
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return "";
  return " | " + Object.entries(meta)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

function writeToFile(line) {
  fs.appendFile(LOG_FILE, line + "\n", (err) => {
    if (err) console.error("Failed to write log file:", err);
  });
}

function log(level, context, message, meta = {}) {
  const timestamp = getTimestamp();
  const metaString = formatMeta(meta);

  const baseLine = `[${timestamp}] [${level}] [${context}] ${message}${metaString}`;

  const colorMap = {
    INFO: colors.green,
    WARN: colors.yellow,
    ERROR: colors.red,
    DEBUG: colors.gray,
  };

  const color = colorMap[level] || colors.reset;

  const coloredLine =
    `${colors.gray}[${timestamp}]${colors.reset} ` +
    `${color}[${level}]${colors.reset} ` +
    `[${context}] ${message}${metaString}`;

  // Terminal
  console.log(coloredLine);

  // File (no colors)
  writeToFile(baseLine);
}

module.exports = {
  log,
};
