const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "../app.log");

const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function getTimestamp() {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
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
