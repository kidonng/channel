import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

const assets = "public";
const files = [
  "css/telegram-web.css",
  "css/telegram.css",
  "css/widget-frame.css",
  "favicon.ico",
  "img/tgme/pattern.svg",
  "js/telegram-web.js",
  "js/telegram-widget.js",
  "js/tgsticker.js",
  "js/tgwallpaper.min.js",
  "js/widget-frame.js",
];
const dirs = new Set<string>();

for (const file of files) {
  const path = join(assets, file);
  mkdirSync(dirname(path), { recursive: true });

  const dir = dirname(file);
  if (dir !== ".") {
    dirs.add(dir);
  }

  const response = await fetch(`https://telegram.org/${file}`);
  const target = createWriteStream(path);
  pipeline(response.body!, target);
}

writeFileSync(
  join(assets, "_headers"),
  [...dirs].map((dir) => `/${dir}/*\n  cache-control: max-age=345600`).join(
    "\n",
  ),
);
