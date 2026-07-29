import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3000);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(currentDir, "dist");

app.use(express.static(distDir, {
  maxAge: "1h"
}));

app.use((_request, response) => {
  response.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Weed Field Capture running on port ${port}`);
});
