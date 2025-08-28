import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { fetch } from "undici";
import { spawn } from "child_process";
import { URL } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// Optional allow list via regex patterns (comma separated)
const ALLOW_HOSTS = (process.env.ALLOW_HOSTS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
  .map(p => new RegExp(p));

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(morgan("combined"));
app.use(express.static("public"));

function isHostAllowed(targetUrl) {
  if (ALLOW_HOSTS.length === 0) return true;
  try {
    const { host } = new URL(targetUrl);
    return ALLOW_HOSTS.some(rx => rx.test(host));
  } catch {
    return false;
  }
}

function bad(res, msg = "Bad Request", code = 400) {
  return res.status(code).json({ error: msg });
}

// Proxy stream with Range support
app.get("/play", async (req, res) => {
  const url = req.query.url;
  if (!url) return bad(res, "Missing ?url");
  if (!isHostAllowed(url)) return bad(res, "Host not allowed", 403);

  try {
    const range = req.headers.range;
    const headers = {};
    if (range) headers.range = range;
    headers["user-agent"] = req.headers["user-agent"] || "Mozilla/5.0 (compatible; URL-Video-Player/1.0)";

    const upstream = await fetch(url, { headers });

    // forward upstream status code (200,206, etc)
    res.status(upstream.status);

    const ct = upstream.headers.get("content-type");
    const cl = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");
    const ac = upstream.headers.get("accept-ranges");

    if (ct) res.setHeader("Content-Type", ct);
    if (cl) res.setHeader("Content-Length", cl);
    if (cr) res.setHeader("Content-Range", cr);
    if (ac) res.setHeader("Accept-Ranges", ac);

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");

    upstream.body.pipe(res);
  } catch (err) {
    console.error("play error:", err);
    return bad(res, "Failed to fetch upstream", 502);
  }
});

// Remux to fragmented MP4 using ffmpeg (copy video, encode audio to AAC)
app.get("/remux", async (req, res) => {
  const url = req.query.url;
  if (!url) return bad(res, "Missing ?url");
  if (!isHostAllowed(url)) return bad(res, "Host not allowed", 403);

  try {
    const upstream = await fetch(url, {
      headers: {
        "user-agent": req.headers["user-agent"] || "Mozilla/5.0 (compatible; URL-Video-Player/1.0)"
      }
    });

    if (!upstream.ok) return bad(res, `Upstream error ${upstream.status}`, upstream.status);

    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-i", "pipe:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-movflags", "frag_keyframe+empty_moov+faststart",
      "-f", "mp4",
      "pipe:1"
    ];

    const ff = spawn("ffmpeg", args);

    res.status(200);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");

    upstream.body.pipe(ff.stdin);
    ff.stdout.pipe(res);

    ff.stderr.on("data", d => {
      // Uncomment for debugging:
      // console.error("ffmpeg:", d.toString());
    });

    ff.on("close", code => {
      if (code !== 0) {
        console.error("ffmpeg exited code", code);
      }
    });

    req.on("close", () => {
      try { ff.kill("SIGKILL"); } catch {}
    });
  } catch (err) {
    console.error("remux error:", err);
    return bad(res, "Remux failed", 500);
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`URL Video Player running on http://localhost:${PORT}`);
});
