const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const express = require("express");
const dotenv = require("dotenv");
const { getDb } = require("./db/database");
const { findNorwayCityKnowledge } = require("./config/norwayCityKnowledge");
const {
  BOT_PERSONALITY,
  SYSTEM_PROMPT,
  DEVELOPER_PROMPT
} = require("./config/botConfig");

dotenv.config();

const app = express();
const publicDir = path.join(__dirname, "public");

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH || 1200);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 45);
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_CONTEXT_MESSAGES = 12;
const SESSION_COOKIE_NAME = "moodroute_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const GITHUB_CLIENT_ID = (process.env.GITHUB_CLIENT_ID || "").trim();
const GITHUB_CLIENT_SECRET = (process.env.GITHUB_CLIENT_SECRET || "").trim();
const GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL || `http://localhost:${PORT}/api/auth/github/callback`;
const MAX_IMAGE_UPLOAD_BYTES = Number(
  process.env.MAX_IMAGE_UPLOAD_BYTES || 4 * 1024 * 1024
);
const uploadsDir = path.join(publicDir, "uploads");
const SAFE_UPLOAD_PATH_REGEX = /^\/uploads\/[A-Za-z0-9._-]+$/;
const IMAGE_EXTENSION_TO_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const ipCounters = new Map();
const oauthStateStore = new Map();

const ROUTE_LIBRARY = {
  quiet: [
    {
      title: "Riverside Slow Loop",
      duration: "75-100 min",
      tags: ["quiet", "green", "reset"],
      summary:
        "Start from a calm street in {city}, walk toward the nearest river/canal embankment, then return through tree-lined backstreets.",
      bonus: "Bring a warm drink and do a 5-minute bench pause halfway."
    },
    {
      title: "Library Courtyard Circuit",
      duration: "60-85 min",
      tags: ["quiet", "bookish", "low-crowd"],
      summary:
        "Walk from a central library or old reading hall in {city} toward inner courtyards and side lanes with minimal traffic.",
      bonus: "Pick one place to read a single page and continue."
    },
    {
      title: "Morning Market Edges",
      duration: "55-75 min",
      tags: ["soft", "local", "observational"],
      summary:
        "Skirt the quieter outer edges of a neighborhood market in {city} instead of its center, then move into residential alleys.",
      bonus: "Grab one seasonal fruit as your route marker."
    },
    {
      title: "Park-to-Park Breather",
      duration: "80-110 min",
      tags: ["nature", "gentle", "decompress"],
      summary:
        "Connect two small parks in {city} using the least busy streets, with one viewpoint stop between them.",
      bonus: "Take 3 photos of textures (stone, leaves, windows)."
    },
    {
      title: "Canal Bench Sequence",
      duration: "65-90 min",
      tags: ["minimal", "still", "mindful"],
      summary:
        "Build a route in {city} around a canal or long boulevard with three planned bench stops and low social friction.",
      bonus: "Use a 4-7-8 breathing cycle during the second stop."
    }
  ],
  gothic: [
    {
      title: "Old Stone Shadows",
      duration: "80-110 min",
      tags: ["gothic", "historic", "dramatic"],
      summary:
        "Start at an old church or civic building in {city}, then trace narrow streets with arches, ironwork, and weathered facades.",
      bonus: "Time it for late afternoon to catch long shadows."
    },
    {
      title: "Lantern Alley Trail",
      duration: "70-95 min",
      tags: ["moody", "noir", "atmospheric"],
      summary:
        "Move through older alley networks in {city}, prioritizing routes with stone walls, lantern lighting, and hidden courtyards.",
      bonus: "Listen to one instrumental track per segment."
    },
    {
      title: "Cathedral to Clocktower",
      duration: "90-120 min",
      tags: ["architecture", "cinematic", "brooding"],
      summary:
        "Connect two iconic historic landmarks in {city}, walking the oldest streets between them rather than the fastest roads.",
      bonus: "Pause at a high point for a skyline contrast shot."
    },
    {
      title: "Rainy Brick Loop",
      duration: "65-90 min",
      tags: ["gothic", "cozy-dark", "reflective"],
      summary:
        "Take a short loop through brick-heavy districts in {city} and stop at an old-fashioned cafe with dim interior light.",
      bonus: "Bring a dark umbrella for weather-proof mood continuity."
    },
    {
      title: "Museum Quarter Twilight",
      duration: "85-105 min",
      tags: ["cultural", "shadowy", "slow"],
      summary:
        "Walk around a museum quarter in {city} at twilight, using side streets with statues, stone stairways, and quiet squares.",
      bonus: "End near a bookstore that stays open late."
    }
  ],
  energetic: [
    {
      title: "Street Beats Sprint-Walk",
      duration: "50-70 min",
      tags: ["energetic", "urban", "fast"],
      summary:
        "Create a brisk zig-zag route across lively blocks in {city}, mixing plazas, murals, and short uphill bursts.",
      bonus: "Use 3 x 5-minute power-walk intervals."
    },
    {
      title: "Bridge and Viewpoint Push",
      duration: "75-100 min",
      tags: ["active", "views", "challenge"],
      summary:
        "Cross at least one bridge in {city}, then climb to a viewpoint using stairs instead of flat roads.",
      bonus: "Finish with a cold sparkling drink and stretch."
    },
    {
      title: "Park Circuit Intervals",
      duration: "60-85 min",
      tags: ["fitness", "open-air", "momentum"],
      summary:
        "Link two busy parks in {city}, alternating relaxed walking and high-tempo segments every 10 minutes.",
      bonus: "Track step count and beat your weekly average."
    },
    {
      title: "Cafe-Hopper Dash",
      duration: "65-90 min",
      tags: ["social", "trendy", "moving"],
      summary:
        "Route through 3 compact cafe zones in {city}, spending no more than 8 minutes per stop to keep the flow high.",
      bonus: "Try one new drink style you never order."
    },
    {
      title: "Market Pulse Route",
      duration: "70-95 min",
      tags: ["busy", "colorful", "high-energy"],
      summary:
        "Pass through a high-activity market area in {city}, then cut through adjacent art streets and transit hubs.",
      bonus: "Shoot a 30-second route recap video at the end."
    }
  ],
  cozy: [
    {
      title: "Warm Lights Meander",
      duration: "65-90 min",
      tags: ["cozy", "warm", "slow"],
      summary:
        "Start from a neighborhood bakery in {city}, walk low-traffic streets with soft evening lighting, and end at a tea spot.",
      bonus: "Choose one window-lit street for a slower final 10 minutes."
    },
    {
      title: "Bookstore and Bakery Loop",
      duration: "55-80 min",
      tags: ["soft", "comfort", "casual"],
      summary:
        "Connect an indie bookstore and a bakery in {city}, prioritizing side streets and small plazas over avenues.",
      bonus: "Bring a tote bag and pick one snack for the walk."
    },
    {
      title: "Rain-Friendly Cozy Circuit",
      duration: "60-85 min",
      tags: ["cozy", "rain-safe", "indoors-breaks"],
      summary:
        "Alternate short outside segments in {city} with indoor pauses in arcades, cafes, or covered passages.",
      bonus: "Use waterproof shoes and keep route segments under 12 minutes."
    },
    {
      title: "Lantern Courtyard Drift",
      duration: "70-95 min",
      tags: ["intimate", "evening", "gentle"],
      summary:
        "Wander between older courtyard blocks in {city}, taking the most human-scale streets with less car noise.",
      bonus: "End at a cafe with visible kitchen or pastry counter."
    },
    {
      title: "Canal Cafe Pairing",
      duration: "75-105 min",
      tags: ["cozy", "waterfront", "calm"],
      summary:
        "Walk a canal-side route in {city} with one midpoint cocoa/coffee stop and a seated sunset finish.",
      bonus: "Pack a light scarf to stay comfortable after dusk."
    }
  ],
  weird: [
    {
      title: "Oddities and Alley Art",
      duration: "70-95 min",
      tags: ["weird", "creative", "unexpected"],
      summary:
        "Build a route in {city} that hits eccentric storefronts, murals, tiny museums, and unusual side alleys.",
      bonus: "Collect 3 'strangest thing I saw' notes on your phone."
    },
    {
      title: "Curio Hunt Walk",
      duration: "65-90 min",
      tags: ["quirky", "playful", "discovery"],
      summary:
        "Start near a flea/antique zone in {city}, then detour to unusual architecture details and novelty shops.",
      bonus: "Set a tiny budget challenge: find one item under $10."
    },
    {
      title: "Neon Backstreet Drift",
      duration: "75-100 min",
      tags: ["night", "experimental", "visual"],
      summary:
        "In {city}, move through mixed-use blocks with neon signage, retro bars, and hidden passageways.",
      bonus: "Photograph one reflection and one strange shadow."
    },
    {
      title: "Micro-Museum Chain",
      duration: "80-110 min",
      tags: ["offbeat", "curious", "cultural"],
      summary:
        "Connect 2-3 niche galleries or micro-museums in {city}, using routes that avoid mainstream boulevards.",
      bonus: "Ask one staff member for a local odd-spot recommendation."
    },
    {
      title: "Urban Myth Route",
      duration: "85-120 min",
      tags: ["story-driven", "mysterious", "quirky"],
      summary:
        "Trace places in {city} tied to local legends, unusual statues, or odd historical anecdotes.",
      bonus: "End with a themed drink and write your own mini-urban myth."
    }
  ]
};

app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const now = Date.now();
  const current = ipCounters.get(ip);

  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipCounters.set(ip, { windowStart: now, count: 1 });
    return next();
  }

  if (current.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: "Too many requests. Please wait a minute and try again."
    });
  }

  current.count += 1;
  ipCounters.set(ip, current);
  return next();
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, info] of ipCounters.entries()) {
    if (now - info.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      ipCounters.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

setInterval(() => {
  const now = Date.now();
  for (const [state, info] of oauthStateStore.entries()) {
    if (now - info.createdAt > 10 * 60 * 1000) {
      oauthStateStore.delete(state);
    }
  }
}, 60_000).unref();

setInterval(async () => {
  try {
    const db = await getDb();
    await db.run("DELETE FROM sessions WHERE expires_at <= ?", [nowIso()]);
  } catch (error) {
    console.error("[sessions:cleanup]", error.message);
  }
}, 6 * 60 * 60 * 1000).unref();

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function parseConversationId(raw) {
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function makeConversationTitle(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "New MoodRoute Chat";
  }
  return compact.length > 56 ? `${compact.slice(0, 56)}...` : compact;
}

function shortPreview(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 92) {
    return compact;
  }
  return `${compact.slice(0, 92)}...`;
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeUploadFileName(name) {
  const cleaned = normalizeText(name)
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .slice(0, 80);
  return cleaned || "uploaded-image";
}

function decodeDataUrlImage(dataUrl) {
  const raw = normalizeText(dataUrl || "");
  const match = raw.match(
    /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/
  );
  if (!match) {
    return null;
  }

  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const base64 = match[2];
  const extensionMap = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  const extension = extensionMap[mime];
  if (!extension) {
    return null;
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer || !buffer.length) {
    return null;
  }

  return { mime, extension, buffer };
}

function isSafeUploadUrl(uploadUrl) {
  return SAFE_UPLOAD_PATH_REGEX.test(normalizeText(uploadUrl || ""));
}

function normalizeChatAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments)) {
    return [];
  }

  return rawAttachments
    .slice(0, 2)
    .map((item) => {
      const safeUrl = normalizeText(item?.url || "");
      if (!isSafeUploadUrl(safeUrl)) {
        return null;
      }
      return {
        url: safeUrl,
        fileName: sanitizeUploadFileName(item?.fileName)
      };
    })
    .filter(Boolean);
}

async function convertUploadToDataUrl(uploadUrl) {
  if (!isSafeUploadUrl(uploadUrl)) {
    return null;
  }

  const fileName = path.basename(uploadUrl);
  const extension = path.extname(fileName).toLowerCase();
  const mime = IMAGE_EXTENSION_TO_MIME[extension];
  if (!mime) {
    return null;
  }

  const filePath = path.join(uploadsDir, fileName);
  const fileBuffer = await fs.readFile(filePath);
  if (!fileBuffer || !fileBuffer.length || fileBuffer.length > MAX_IMAGE_UPLOAD_BYTES) {
    return null;
  }

  return `data:${mime};base64,${fileBuffer.toString("base64")}`;
}

function normalizeEmail(email) {
  return normalizeText(email).toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeUsernameBase(value) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");

  if (!normalized) {
    return "moodroute_user";
  }
  if (normalized.length >= 3) {
    return normalized.slice(0, 32);
  }
  return `${normalized}_user`;
}

async function makeUniqueUsername(db, preferred) {
  const base = normalizeUsernameBase(preferred);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? "" : `_${attempt}`;
    const candidate = `${base}${suffix}`.slice(0, 32);
    const exists = await db.get(
      "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
      [candidate]
    );
    if (!exists) {
      return candidate;
    }
  }
  return `user_${crypto.randomBytes(4).toString("hex")}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = parts[1];
  const expectedHex = parts[2];
  const computed = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== computed.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, computed);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseCookies(req) {
  const source = req.headers.cookie;
  const result = {};
  if (!source) {
    return result;
  }
  const pairs = source.split(";");
  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    try {
      result[key] = decodeURIComponent(value);
    } catch (error) {
      result[key] = value;
    }
  }
  return result;
}

function setSessionCookie(res, token, expiresAt) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`
  ];
  if (secure) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ];
  if (secure) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    provider: user.github_id ? "github" : "local",
    github_avatar_url: user.github_avatar_url || "",
    created_at: user.created_at
  };
}

async function createSession(db, userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await db.run(
    `
    INSERT INTO sessions (user_id, session_token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?)
    `,
    [userId, tokenHash, createdAt, expiresAt]
  );

  return {
    token: rawToken,
    expiresAt
  };
}

async function deleteSessionByToken(db, rawToken) {
  if (!rawToken) {
    return;
  }
  const tokenHash = sha256(rawToken);
  await db.run("DELETE FROM sessions WHERE session_token_hash = ?", [tokenHash]);
}

async function getUserFromSessionToken(db, rawToken) {
  if (!rawToken) {
    return null;
  }
  const tokenHash = sha256(rawToken);
  const row = await db.get(
    `
    SELECT
      s.id AS session_id,
      s.expires_at,
      u.id,
      u.email,
      u.username,
      u.password_hash,
      u.github_id,
      u.github_avatar_url,
      u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token_hash = ?
    `,
    [tokenHash]
  );

  if (!row) {
    return null;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.run("DELETE FROM sessions WHERE id = ?", [row.session_id]);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    password_hash: row.password_hash,
    github_id: row.github_id,
    github_avatar_url: row.github_avatar_url,
    created_at: row.created_at
  };
}

function normalizeNextPath(rawNextPath) {
  const value = normalizeText(rawNextPath || "");
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/chat";
  }
  if (value.startsWith("/api/")) {
    return "/chat";
  }
  return value;
}

function consumeOauthState(state) {
  const stored = oauthStateStore.get(state);
  if (!stored) {
    return null;
  }
  oauthStateStore.delete(state);
  if (Date.now() - stored.createdAt > 10 * 60 * 1000) {
    return null;
  }
  return stored;
}

function normalizeVisitedPlaces(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];
  const cleaned = source
    .map((item) => normalizeText(String(item || "")))
    .filter((item) => item.length > 0)
    .map((item) => (item.length > 120 ? `${item.slice(0, 120)}...` : item));
  return Array.from(new Set(cleaned)).slice(0, 120);
}

function normalizeProfilePayload(rawProfile) {
  const source = rawProfile || {};
  const visitedPlaces = normalizeVisitedPlaces(source.visited_places || source.visitedPlaces);

  return {
    default_city: normalizeText(source.default_city || source.defaultCity).slice(0, 80),
    default_vibe: normalizeText(source.default_vibe || source.defaultVibe).slice(0, 50),
    default_budget: normalizeText(source.default_budget || source.defaultBudget).slice(0, 50),
    crowd_tolerance: normalizeText(source.crowd_tolerance || source.crowdTolerance).slice(0, 50),
    weather_preference: normalizeText(source.weather_preference || source.weatherPreference).slice(0, 60),
    default_duration: normalizeText(source.default_duration || source.defaultDuration).slice(0, 60),
    notes: normalizeText(source.notes).slice(0, 800),
    visited_places_json: JSON.stringify(visitedPlaces)
  };
}

function parseVisitedPlacesJson(rawJson) {
  if (!rawJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawJson);
    return normalizeVisitedPlaces(parsed);
  } catch (error) {
    return [];
  }
}

function sanitizeProfile(profileRow) {
  if (!profileRow) {
    return {
      default_city: "",
      default_vibe: "",
      default_budget: "",
      crowd_tolerance: "",
      weather_preference: "",
      default_duration: "",
      notes: "",
      visited_places: [],
      created_at: nowIso(),
      updated_at: nowIso()
    };
  }

  return {
    default_city: profileRow.default_city || "",
    default_vibe: profileRow.default_vibe || "",
    default_budget: profileRow.default_budget || "",
    crowd_tolerance: profileRow.crowd_tolerance || "",
    weather_preference: profileRow.weather_preference || "",
    default_duration: profileRow.default_duration || "",
    notes: profileRow.notes || "",
    visited_places: parseVisitedPlacesJson(profileRow.visited_places_json),
    created_at: profileRow.created_at,
    updated_at: profileRow.updated_at
  };
}

async function ensureUserProfile(db, userId) {
  const existing = await db.get(
    `
    SELECT
      user_id,
      default_city,
      default_vibe,
      default_budget,
      crowd_tolerance,
      weather_preference,
      default_duration,
      notes,
      visited_places_json,
      created_at,
      updated_at
    FROM user_profiles
    WHERE user_id = ?
    `,
    [userId]
  );

  if (existing) {
    return existing;
  }

  const createdAt = nowIso();
  await db.run(
    `
    INSERT INTO user_profiles (
      user_id,
      default_city,
      default_vibe,
      default_budget,
      crowd_tolerance,
      weather_preference,
      default_duration,
      notes,
      visited_places_json,
      created_at,
      updated_at
    )
    VALUES (?, '', '', '', '', '', '', '', '[]', ?, ?)
    `,
    [userId, createdAt, createdAt]
  );

  return db.get(
    `
    SELECT
      user_id,
      default_city,
      default_vibe,
      default_budget,
      crowd_tolerance,
      weather_preference,
      default_duration,
      notes,
      visited_places_json,
      created_at,
      updated_at
    FROM user_profiles
    WHERE user_id = ?
    `,
    [userId]
  );
}

function formatUserProfileContextForPrompt(profile) {
  if (!profile) {
    return "";
  }

  const lines = [];
  if (profile.default_city) {
    lines.push(`- Default city: ${profile.default_city}`);
  }
  if (profile.default_vibe) {
    lines.push(`- Preferred vibe: ${profile.default_vibe}`);
  }
  if (profile.default_budget) {
    lines.push(`- Typical budget: ${profile.default_budget}`);
  }
  if (profile.crowd_tolerance) {
    lines.push(`- Crowd tolerance: ${profile.crowd_tolerance}`);
  }
  if (profile.weather_preference) {
    lines.push(`- Weather preference: ${profile.weather_preference}`);
  }
  if (profile.default_duration) {
    lines.push(`- Typical duration: ${profile.default_duration}`);
  }
  if (profile.notes) {
    lines.push(`- User notes: ${profile.notes}`);
  }

  const visited = Array.isArray(profile.visited_places)
    ? profile.visited_places.slice(0, 20)
    : [];
  if (visited.length > 0) {
    lines.push(`- Places already visited: ${visited.join(", ")}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return [
    "User profile context (apply when useful):",
    ...lines,
    "Instruction: avoid repeating already visited places unless user explicitly asks."
  ].join("\n");
}

function extractCityFromHistory(historyMessages) {
  if (!Array.isArray(historyMessages)) {
    return null;
  }

  for (let index = historyMessages.length - 1; index >= 0; index -= 1) {
    const item = historyMessages[index];
    if (!item || item.role !== "user") {
      continue;
    }
    const extracted = extractCity(normalizeText(item.content));
    if (extracted) {
      return extracted;
    }
  }
  return null;
}

function resolveCityKnowledge(message, historyMessages) {
  const fromMessage = extractCity(message);
  const fromHistory = extractCityFromHistory(historyMessages);
  const candidateCity = fromMessage || fromHistory;
  if (!candidateCity) {
    return null;
  }
  return findNorwayCityKnowledge(candidateCity);
}

function formatCityKnowledgeForPrompt(cityKnowledge) {
  if (!cityKnowledge) {
    return "";
  }
  const placeLines = cityKnowledge.places
    .slice(0, 8)
    .map((place) => `- ${place.name} (${place.kind})`)
    .join("\n");

  return [
    "City grounding context (use this as factual POI anchor):",
    `City: ${cityKnowledge.city}, Norway (${cityKnowledge.county})`,
    "Known places:",
    placeLines,
    "Instruction: when giving 3 options, include concrete references to these places where relevant."
  ].join("\n");
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function detectMood(message) {
  const text = message.toLowerCase();
  if (
    containsAny(text, [
      "quiet",
      "calm",
      "peaceful",
      "silent",
      "тихий",
      "спокойн",
      "медленн"
    ])
  ) {
    return "quiet";
  }
  if (containsAny(text, ["gothic", "dark", "moody", "мрачн", "готик"])) {
    return "gothic";
  }
  if (containsAny(text, ["energetic", "active", "hype", "fast", "бодр", "энерг"])) {
    return "energetic";
  }
  if (containsAny(text, ["weird", "quirky", "odd", "strange", "странн", "необыч"])) {
    return "weird";
  }
  return "cozy";
}

function extractCity(message) {
  const normalize = (value) =>
    value
      .trim()
      .replace(/^[,\s]+|[,\s]+$/g, "")
      .replace(/\s{2,}/g, " ");

  const leadingCity = message.match(/^([\p{L}][\p{L}\s'.-]{1,40})\s*,/u);
  if (leadingCity && leadingCity[1]) {
    return normalize(leadingCity[1]);
  }

  const labeledCity = message.match(
    /\b(?:city|город)\s*[:=-]\s*([\p{L}][\p{L}\s'.-]{1,40})/iu
  );
  if (labeledCity && labeledCity[1]) {
    return normalize(labeledCity[1]);
  }

  const latin = message.match(/\b(?:in|around|near)\s+([\p{L}][\p{L}\s'.-]{1,40})/iu);
  if (latin && latin[1]) {
    return normalize(latin[1]);
  }

  const cyrillic = message.match(
    /(?:^|[\s,])(?:в|по|около|рядом с)\s+([\p{L}][\p{L}\s'.-]{1,40})/iu
  );
  if (cyrillic && cyrillic[1]) {
    return normalize(cyrillic[1]);
  }

  return null;
}

function extractDuration(message) {
  const match = message.match(
    /\b(\d{1,2})\s*(min|mins|minute|minutes|hour|hours|hr|hrs|ч|час|часа|часов|мин|минута|минуты|минут)\b/iu
  );
  if (!match) {
    return null;
  }
  return `${match[1]} ${match[2]}`;
}

function needsClarification(message) {
  const text = message.toLowerCase();
  const missing = [];
  const hasWeatherPreference = containsAny(text, [
    "sunny",
    "rain",
    "rainy",
    "cloud",
    "cloudy",
    "snow",
    "wind",
    "weather",
    "дожд",
    "снег",
    "ветер",
    "погод",
    "солнеч",
    "пасмур"
  ]);
  const hasCrowdPreference = containsAny(text, [
    "crowd",
    "crowds",
    "busy",
    "quiet street",
    "low crowd",
    "толп",
    "людно",
    "безлюд",
    "мало людей",
    "тихо"
  ]);
  const hasBudgetPreference =
    containsAny(text, [
      "budget",
      "usd",
      "cheap",
      "free",
      "expensive",
      "дорог",
      "бюджет",
      "дешев",
      "бесплат",
      "недорог"
    ]) ||
    /\$\s*\d+|\d+\s*\$/.test(text) ||
    /\b(?:under|up to|до)\s*\$?\s*\d+\b/i.test(text);

  if (!extractCity(message)) {
    missing.push("city");
  }
  if (!extractDuration(message)) {
    missing.push("time available");
  }
  if (!hasWeatherPreference) {
    missing.push("weather preference");
  }
  if (!hasCrowdPreference) {
    missing.push("crowd tolerance");
  }
  if (!hasBudgetPreference) {
    missing.push("budget");
  }

  return missing;
}
function hashCode(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickThreeRoutes(routes, seed) {
  const chosen = [];
  let cursor = seed % routes.length;

  while (chosen.length < 3) {
    const route = routes[cursor % routes.length];
    if (!chosen.includes(route)) {
      chosen.push(route);
    }
    cursor += 2;
  }
  return chosen;
}

function pickCityAnchors(cityKnowledge, seed) {
  if (!cityKnowledge || !Array.isArray(cityKnowledge.places) || cityKnowledge.places.length === 0) {
    return [];
  }
  const anchors = [];
  let cursor = seed % cityKnowledge.places.length;
  while (anchors.length < Math.min(3, cityKnowledge.places.length)) {
    const current = cityKnowledge.places[cursor % cityKnowledge.places.length];
    if (!anchors.includes(current)) {
      anchors.push(current);
    }
    cursor += 2;
  }
  return anchors;
}

function buildGoogleMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    normalizeText(query)
  )}`;
}

function buildGoogleMapsWalkingUrl(origin, destination, waypoints = []) {
  const params = new URLSearchParams({
    api: "1",
    origin: normalizeText(origin),
    destination: normalizeText(destination),
    travelmode: "walking"
  });

  const cleanWaypoints = Array.isArray(waypoints)
    ? waypoints.map((item) => normalizeText(item)).filter(Boolean).slice(0, 3)
    : [];
  if (cleanWaypoints.length > 0) {
    params.set("waypoints", cleanWaypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function pickAnchorsMentionedInReply(reply, cityKnowledge) {
  if (!cityKnowledge || !Array.isArray(cityKnowledge.places) || cityKnowledge.places.length === 0) {
    return [];
  }
  const normalizedReply = String(reply || "").toLowerCase();
  if (!normalizedReply) {
    return [];
  }

  return cityKnowledge.places
    .filter((place) => normalizedReply.includes(String(place.name || "").toLowerCase()))
    .slice(0, 3);
}

function extractOptionTitlesFromReply(reply) {
  const raw = String(reply || "");
  const matches = Array.from(raw.matchAll(/Option\s+\d+\s*:\s*(.+)/gi));
  if (!matches.length) {
    return [];
  }
  return matches
    .map((item) => normalizeText(item[1] || ""))
    .filter(Boolean)
    .slice(0, 3);
}

function buildGoogleMapsSuggestions({
  message,
  reply,
  cityKnowledge,
  userProfile
}) {
  const routeIntent = isLikelyRouteIntent(message) || /\bOption 1\b/i.test(String(reply || ""));
  if (!routeIntent) {
    return [];
  }

  const city = normalizeText(
    cityKnowledge?.city || extractCity(message) || userProfile?.default_city || ""
  );
  if (!city) {
    return [];
  }

  let anchors = pickAnchorsMentionedInReply(reply, cityKnowledge);
  if (anchors.length === 0 && cityKnowledge) {
    const seed = hashCode(`${city}|${String(message || "").toLowerCase()}`);
    anchors = pickCityAnchors(cityKnowledge, seed);
  }
  if (anchors.length > 0) {
    return anchors.slice(0, 3).map((place, index) => {
      const placeQuery = `${place.name}, ${city}, Norway`;
      const previousAnchor = anchors[index - 1];
      const routeOrigin = previousAnchor
        ? `${previousAnchor.name}, ${city}, Norway`
        : `${city} city center`;

      return {
        title: `${place.name} (${place.kind})`,
        placeUrl: buildGoogleMapsSearchUrl(placeQuery),
        routeUrl: buildGoogleMapsWalkingUrl(routeOrigin, placeQuery)
      };
    });
  }

  const optionTitles = extractOptionTitlesFromReply(reply);
  if (optionTitles.length === 0) {
    return [];
  }

  return optionTitles.map((title) => {
    const placeQuery = `${title}, ${city}`;
    return {
      title,
      placeUrl: buildGoogleMapsSearchUrl(placeQuery),
      routeUrl: buildGoogleMapsWalkingUrl(`${city} city center`, placeQuery)
    };
  });
}

function appendGoogleMapsLinksToReply(reply, suggestions) {
  const baseReply = normalizeText(reply);
  if (!baseReply) {
    return "";
  }
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return baseReply;
  }

  const lines = ["", "Google Maps links:"];
  suggestions.forEach((item, index) => {
    lines.push(`${index + 1}) ${item.title}`);
    lines.push(`- [Open place](${item.placeUrl})`);
    lines.push(`- [Open walking route](${item.routeUrl})`);
  });

  const enriched = `${baseReply}\n${lines.join("\n")}`;
  const safeLimit = MAX_MESSAGE_LENGTH * 3;
  if (enriched.length <= safeLimit) {
    return enriched;
  }

  const fallback = `${baseReply}\n\nGoogle Maps:\n- [Open walking route](${suggestions[0].routeUrl})`;
  if (fallback.length <= safeLimit) {
    return fallback;
  }

  return baseReply.slice(0, safeLimit);
}

function stripRawUrlsFromReply(reply) {
  const text = String(reply || "");
  if (!text) {
    return "";
  }

  const markdownSanitized = text.replace(
    /\[([^\]\n]{1,160})\]\((https?:\/\/[^\s)]+)\)/gi,
    "$1"
  );

  const lines = markdownSanitized
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/https?:\/\/[^\s<>"')]+/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(Boolean);

  return lines.join("\n");
}

function appendCoreTaskInvite(text) {
  return `${text}\n\nMoodRoute follow-up: share city + time + vibe, and I will build 3 city options for you.`;
}

function isLikelyRouteIntent(message) {
  const text = message.toLowerCase();
  return (
    Boolean(extractCity(message)) ||
    Boolean(extractDuration(message)) ||
    containsAny(text, [
      "route",
      "walk",
      "city",
      "place",
      "trip",
      "mood",
      "маршрут",
      "прогул",
      "город",
      "места",
      "вайб"
    ])
  );
}

function buildMockGeneralAnswer(message) {
  const text = message.toLowerCase();

  if (containsAny(text, ["hello", "hi", "привет", "здравств"])) {
    return "Hi. I can chat on general topics and keep it short and useful.";
  }
  if (containsAny(text, ["how are you", "как дела"])) {
    return "I am ready to help and currently focused on practical, fast answers.";
  }
  if (containsAny(text, ["thanks", "thank you", "спасибо"])) {
    return "You are welcome.";
  }
  if (containsAny(text, ["weather", "погод"])) {
    return "For precise weather I recommend checking a live weather service for your city and time window.";
  }
  if (containsAny(text, ["movie", "film", "book", "music", "фильм", "книга", "музык"])) {
    return "I can suggest options based on your mood if you tell me genre and energy level.";
  }

  return "I can answer non-city questions briefly, and then switch back to route planning whenever you want.";
}

function buildMockReply(
  message,
  cityKnowledge = null,
  userProfile = null,
  attachments = []
) {
  const city =
    cityKnowledge?.city ||
    extractCity(message) ||
    normalizeText(userProfile?.default_city || "") ||
    "your city";
  const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
  const routeIntent = isLikelyRouteIntent(message) || hasAttachment;
  const mood = detectMood(message);
  const missing = needsClarification(message).filter(
    (item) => !(item === "city" && normalizeText(userProfile?.default_city || ""))
  );

  if (!routeIntent) {
    return appendCoreTaskInvite(buildMockGeneralAnswer(message));
  }

  if (missing.length >= 2) {
    const clarification = [
      "Before I lock the route, I need a few details:",
      `1) City (currently: ${extractCity(message) || userProfile?.default_city || "not provided"})`,
      `2) Time available (currently: ${extractDuration(message) || "not provided"})`,
      "3) Weather preference (sun/rain/indoor-friendly)",
      "4) Crowd tolerance (quiet / medium / lively)",
      "5) Budget (free / low / flexible)",
      "",
      'Reply in one line, for example: "Seattle, 2 hours, light rain okay, low crowds, under $20, cozy vibe."'
    ];
    if (hasAttachment) {
      clarification.push(
        "",
        "I see an attached photo. In mock mode I cannot inspect pixels deeply, but I can still use your description."
      );
    }
    return appendCoreTaskInvite(clarification.join("\n"));
  }

  const durationHint = extractDuration(message);
  const seed = hashCode(`${message.toLowerCase()}|${city}|${mood}`);
  const routes = ROUTE_LIBRARY[mood] || ROUTE_LIBRARY.cozy;
  const options = pickThreeRoutes(routes, seed);
  const anchors = pickCityAnchors(cityKnowledge, seed);

  const result = [
    `MoodRoute draft for ${city} (${mood} vibe):`,
    ""
  ];

  options.forEach((option, index) => {
    const duration =
      durationHint && index === 0 ? `${durationHint} target` : option.duration;
    result.push(`Option ${index + 1}: ${option.title}`);
    result.push(`- Duration: ${duration}`);
    result.push(`- Vibe tags: ${option.tags.join(", ")}`);
    result.push(`- Route summary: ${option.summary.replaceAll("{city}", city)}`);
    if (anchors[index]) {
      result.push(`- Suggested local anchor: ${anchors[index].name} (${anchors[index].kind})`);
    }
    result.push(`- Bonus tip: ${option.bonus}`);
    result.push("");
  });

  if (missing.length === 1) {
    result.push(
      `Assumption used: missing "${missing[0]}". Tell me that detail and I will refine all 3 options.`
    );
  } else {
    result.push("Tell me weather + budget, and I will optimize one option into a precise step-by-step route.");
  }

  if (hasAttachment) {
    result.push(
      "Photo note: in mock mode image analysis is limited. With live OpenAI mode I can analyze the photo directly."
    );
  }

  return appendCoreTaskInvite(result.join("\n"));
}

function sanitizeHistory(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: normalizeText(item.content).slice(0, MAX_MESSAGE_LENGTH)
    }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_CONTEXT_MESSAGES);
}

async function buildOpenAIImageParts(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const parts = [];
  for (const item of attachments.slice(0, 2)) {
    try {
      const dataUrl = await convertUploadToDataUrl(item.url);
      if (!dataUrl) {
        continue;
      }
      parts.push({
        type: "image_url",
        image_url: {
          url: dataUrl,
          detail: "auto"
        }
      });
    } catch (error) {
      console.error("[chat:image:openai]", error.message);
    }
  }
  return parts;
}

async function fetchOpenAIReply(
  userMessage,
  historyMessages,
  cityKnowledge = null,
  userProfile = null,
  attachments = []
) {
  const cityPrompt = formatCityKnowledgeForPrompt(cityKnowledge);
  const profilePrompt = formatUserProfileContextForPrompt(userProfile);
  const imageParts = await buildOpenAIImageParts(attachments);
  const userContent = imageParts.length
    ? [
        { type: "text", text: userMessage },
        ...imageParts
      ]
    : userMessage;

  const payload = {
    model: OPENAI_MODEL,
    temperature: 0.7,
    max_tokens: 650,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "developer", content: DEVELOPER_PROMPT },
      ...(cityPrompt ? [{ role: "developer", content: cityPrompt }] : []),
      ...(profilePrompt ? [{ role: "developer", content: profilePrompt }] : []),
      ...historyMessages.map((item) => ({
        role: item.role,
        content: item.content
      })),
      { role: "user", content: userContent }
    ]
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const rawError = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${rawError.slice(0, 400)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("OpenAI response did not include text content.");
  }

  return text.trim();
}

async function createAssistantReply({
  message,
  history,
  cityKnowledge,
  userProfile,
  attachments = []
}) {
  if (!OPENAI_API_KEY) {
    return {
      mode: "mock",
      reply: buildMockReply(message, cityKnowledge, userProfile, attachments)
    };
  }

  try {
    const reply = await fetchOpenAIReply(
      message,
      history,
      cityKnowledge,
      userProfile,
      attachments
    );
    return { mode: "openai", reply };
  } catch (error) {
    console.error("[chat] OpenAI failed, fallback to mock mode:", error.message);
    return {
      mode: "mock-fallback",
      reply: buildMockReply(message, cityKnowledge, userProfile, attachments)
    };
  }
}

async function getConversationOr404(db, id, userId, res) {
  const conversation = await db.get(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE id = ? AND user_id = ?
    `,
    [id, userId]
  );
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return null;
  }
  return conversation;
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }
  return next();
}

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  getDb()
    .then((db) => {
      const cookies = parseCookies(req);
      const rawToken = cookies[SESSION_COOKIE_NAME];
      if (!rawToken) {
        req.user = null;
        req.sessionToken = null;
        return null;
      }

      req.sessionToken = rawToken;
      return getUserFromSessionToken(db, rawToken);
    })
    .then((user) => {
      req.user = user || null;
      return next();
    })
    .catch((error) => {
      console.error("[auth:attach-user]", error);
      req.user = null;
      req.sessionToken = null;
      return next();
    });
});

app.get("/api/meta", (req, res) => {
  res.json({
    appName: "MoodRoute AI",
    personality: BOT_PERSONALITY,
    model: OPENAI_MODEL,
    liveApiConfigured: Boolean(OPENAI_API_KEY),
    githubConfigured: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
    authenticated: Boolean(req.user),
    user: sanitizeUser(req.user)
  });
});

app.get("/api/auth/me", (req, res) => {
  res.json({
    authenticated: Boolean(req.user),
    user: sanitizeUser(req.user)
  });
});

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const profileRow = await ensureUserProfile(db, req.user.id);
    return res.json({
      profile: sanitizeProfile(profileRow)
    });
  } catch (error) {
    console.error("[profile:get]", error);
    return res.status(500).json({ error: "Failed to load profile." });
  }
});

app.put("/api/profile", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await ensureUserProfile(db, req.user.id);
    const normalized = normalizeProfilePayload(req.body || {});
    const updatedAt = nowIso();

    await db.run(
      `
      UPDATE user_profiles
      SET
        default_city = ?,
        default_vibe = ?,
        default_budget = ?,
        crowd_tolerance = ?,
        weather_preference = ?,
        default_duration = ?,
        notes = ?,
        visited_places_json = ?,
        updated_at = ?
      WHERE user_id = ?
      `,
      [
        normalized.default_city,
        normalized.default_vibe,
        normalized.default_budget,
        normalized.crowd_tolerance,
        normalized.weather_preference,
        normalized.default_duration,
        normalized.notes,
        normalized.visited_places_json,
        updatedAt,
        req.user.id
      ]
    );

    const profileRow = await ensureUserProfile(db, req.user.id);
    return res.json({
      profile: sanitizeProfile(profileRow)
    });
  } catch (error) {
    console.error("[profile:update]", error);
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizeText(req.body?.password);
  const preferredUsername = normalizeText(req.body?.username);

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  try {
    const db = await getDb();
    const existingEmail = await db.get(
      "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
      [email]
    );
    if (existingEmail) {
      return res.status(409).json({ error: "Email is already registered." });
    }

    const usernameSource = preferredUsername || email.split("@")[0] || "moodroute";
    const username = await makeUniqueUsername(db, usernameSource);
    const passwordHash = hashPassword(password);
    const createdAt = nowIso();

    const insert = await db.run(
      `
      INSERT INTO users (email, username, password_hash, github_id, github_avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, NULL, '', ?, ?)
      `,
      [email, username, passwordHash, createdAt, createdAt]
    );

    const session = await createSession(db, insert.lastID);
    setSessionCookie(res, session.token, session.expiresAt);

    const user = await db.get(
      "SELECT id, email, username, github_id, github_avatar_url, created_at FROM users WHERE id = ?",
      [insert.lastID]
    );

    return res.status(201).json({
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error("[auth:register]", error);
    return res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizeText(req.body?.password);

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required." });
  }

  try {
    const db = await getDb();
    const user = await db.get(
      `
      SELECT id, email, username, password_hash, github_id, github_avatar_url, created_at
      FROM users
      WHERE email = ? COLLATE NOCASE
      `,
      [email]
    );

    if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const session = await createSession(db, user.id);
    setSessionCookie(res, session.token, session.expiresAt);

    return res.json({
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error("[auth:login]", error);
    return res.status(500).json({ error: "Login failed." });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const db = await getDb();
    await deleteSessionByToken(db, req.sessionToken);
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    console.error("[auth:logout]", error);
    clearSessionCookie(res);
    return res.status(500).json({ error: "Logout failed." });
  }
});

app.get("/api/auth/github/start", (req, res) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res
      .status(500)
      .json({ error: "GitHub OAuth is not configured on server." });
  }

  const state = crypto.randomBytes(20).toString("hex");
  const nextPath = normalizeNextPath(req.query?.next || "/chat");
  oauthStateStore.set(state, {
    createdAt: Date.now(),
    nextPath
  });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: "read:user user:email",
    state
  });

  return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

app.get("/api/auth/github/callback", async (req, res) => {
  const code = normalizeText(req.query?.code);
  const state = normalizeText(req.query?.state);
  const storedState = consumeOauthState(state);

  if (!code || !storedState) {
    return res.status(400).send("Invalid OAuth callback state.");
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL
      })
    });

    if (!tokenResponse.ok) {
      const raw = await tokenResponse.text();
      throw new Error(`GitHub token exchange failed: ${tokenResponse.status} ${raw.slice(0, 180)}`);
    }

    const tokenPayload = await tokenResponse.json();
    const accessToken = normalizeText(tokenPayload.access_token);
    if (!accessToken) {
      throw new Error("GitHub token response did not include access_token.");
    }

    const githubUserResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MoodRoute-AI"
      }
    });
    if (!githubUserResponse.ok) {
      const raw = await githubUserResponse.text();
      throw new Error(`GitHub user fetch failed: ${githubUserResponse.status} ${raw.slice(0, 180)}`);
    }
    const githubUser = await githubUserResponse.json();
    const githubId = String(githubUser.id || "");
    const githubLogin = normalizeText(githubUser.login || "");
    const githubAvatarUrl = normalizeText(githubUser.avatar_url || "");

    if (!githubId || !githubLogin) {
      throw new Error("GitHub user data is incomplete.");
    }

    let githubEmail = normalizeEmail(githubUser.email || "");
    if (!githubEmail) {
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "MoodRoute-AI"
        }
      });
      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        if (Array.isArray(emails)) {
          const primary = emails.find((item) => item.primary && item.verified);
          const verified = emails.find((item) => item.verified);
          const fallback = emails[0];
          githubEmail = normalizeEmail(primary?.email || verified?.email || fallback?.email || "");
        }
      }
    }

    const db = await getDb();
    let user = await db.get(
      "SELECT id, email, username, github_id, github_avatar_url, created_at FROM users WHERE github_id = ?",
      [githubId]
    );

    if (!user && githubEmail) {
      const existingByEmail = await db.get(
        "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
        [githubEmail]
      );
      if (existingByEmail) {
        await db.run(
          "UPDATE users SET github_id = ?, github_avatar_url = ?, updated_at = ? WHERE id = ?",
          [githubId, githubAvatarUrl, nowIso(), existingByEmail.id]
        );
        user = await db.get(
          "SELECT id, email, username, github_id, github_avatar_url, created_at FROM users WHERE id = ?",
          [existingByEmail.id]
        );
      }
    }

    if (!user) {
      const username = await makeUniqueUsername(db, githubLogin);
      const emailForStorage = githubEmail || `${githubLogin}+${githubId}@users.local`;
      const createdAt = nowIso();
      const insert = await db.run(
        `
        INSERT INTO users (email, username, password_hash, github_id, github_avatar_url, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?)
        `,
        [emailForStorage, username, githubId, githubAvatarUrl, createdAt, createdAt]
      );
      user = await db.get(
        "SELECT id, email, username, github_id, github_avatar_url, created_at FROM users WHERE id = ?",
        [insert.lastID]
      );
    } else if (githubAvatarUrl && user.github_avatar_url !== githubAvatarUrl) {
      await db.run(
        "UPDATE users SET github_avatar_url = ?, updated_at = ? WHERE id = ?",
        [githubAvatarUrl, nowIso(), user.id]
      );
      user = await db.get(
        "SELECT id, email, username, github_id, github_avatar_url, created_at FROM users WHERE id = ?",
        [user.id]
      );
    }

    const session = await createSession(db, user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    return res.redirect(normalizeNextPath(storedState.nextPath));
  } catch (error) {
    console.error("[auth:github]", error);
    return res.status(500).send("GitHub authentication failed.");
  }
});

app.post("/api/uploads/image", requireAuth, async (req, res) => {
  const filename = sanitizeUploadFileName(req.body?.filename);
  const parsed = decodeDataUrlImage(req.body?.dataUrl);

  if (!parsed) {
    return res.status(400).json({ error: "Invalid image data." });
  }
  if (parsed.buffer.length > MAX_IMAGE_UPLOAD_BYTES) {
    return res.status(400).json({
      error: `Image is too large. Max ${Math.floor(
        MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)
      )} MB.`
    });
  }

  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    const uniqueName = `${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")}.${parsed.extension}`;
    const targetPath = path.join(uploadsDir, uniqueName);
    await fs.writeFile(targetPath, parsed.buffer);

    return res.status(201).json({
      url: `/uploads/${uniqueName}`,
      fileName: filename
    });
  } catch (error) {
    console.error("[uploads:image]", error);
    return res.status(500).json({ error: "Failed to upload image." });
  }
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const conversations = await db.all(
      `
      SELECT
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        COALESCE((
          SELECT substr(m.content, 1, 160)
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.id DESC
          LIMIT 1
        ), '') AS last_message
      FROM conversations c
      WHERE c.user_id = ?
      ORDER BY datetime(c.updated_at) DESC, c.id DESC
      `,
      [req.user.id]
    );
    return res.json({ conversations });
  } catch (error) {
    console.error("[conversations:list]", error);
    return res.status(500).json({ error: "Failed to fetch conversations." });
  }
});

app.post("/api/conversations", requireAuth, async (req, res) => {
  const rawTitle = normalizeText(req.body?.title);
  const title = rawTitle ? rawTitle.slice(0, 80) : "New MoodRoute Chat";

  try {
    const db = await getDb();
    const result = await db.run(
      "INSERT INTO conversations (user_id, title) VALUES (?, ?)",
      [req.user.id, title]
    );
    const conversation = await db.get(
      "SELECT id, user_id, title, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?",
      [result.lastID, req.user.id]
    );
    return res.status(201).json({ conversation });
  } catch (error) {
    console.error("[conversations:create]", error);
    return res.status(500).json({ error: "Failed to create conversation." });
  }
});

app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  const conversationId = parseConversationId(req.params.id);
  if (!conversationId) {
    return res.status(400).json({ error: "Invalid conversation id." });
  }

  try {
    const db = await getDb();
    const conversation = await getConversationOr404(db, conversationId, req.user.id, res);
    if (!conversation) {
      return undefined;
    }

    const messages = await db.all(
      `
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY id ASC
      `,
      [conversationId]
    );

    return res.json({ conversation, messages });
  } catch (error) {
    console.error("[messages:list]", error);
    return res.status(500).json({ error: "Failed to fetch messages." });
  }
});

app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  const conversationId = parseConversationId(req.params.id);
  if (!conversationId) {
    return res.status(400).json({ error: "Invalid conversation id." });
  }

  const userMessage = normalizeText(req.body?.userMessage);
  const assistantMessage = normalizeText(req.body?.assistantMessage);

  if (!userMessage || !assistantMessage) {
    return res.status(400).json({
      error: "Both userMessage and assistantMessage are required."
    });
  }

  if (
    userMessage.length > MAX_MESSAGE_LENGTH ||
    assistantMessage.length > MAX_MESSAGE_LENGTH * 3
  ) {
    return res.status(400).json({
      error: "Message too long."
    });
  }

  try {
    const db = await getDb();
    const conversation = await getConversationOr404(db, conversationId, req.user.id, res);
    if (!conversation) {
      return undefined;
    }

    const existingCountRow = await db.get(
      "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?",
      [conversationId]
    );

    const userInsert = await db.run(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)",
      [conversationId, userMessage]
    );
    const assistantInsert = await db.run(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)",
      [conversationId, assistantMessage]
    );

    if (existingCountRow?.count === 0) {
      await db.run("UPDATE conversations SET title = ? WHERE id = ?", [
        makeConversationTitle(userMessage),
        conversationId
      ]);
    }

    await db.run(
      "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      [conversationId]
    );

    const saved = await db.all(
      `
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE id IN (?, ?)
      ORDER BY id ASC
      `,
      [userInsert.lastID, assistantInsert.lastID]
    );

    return res.status(201).json({ saved });
  } catch (error) {
    console.error("[messages:save]", error);
    return res.status(500).json({ error: "Failed to save messages." });
  }
});

app.post("/api/conversations/:id/clear", requireAuth, async (req, res) => {
  const conversationId = parseConversationId(req.params.id);
  if (!conversationId) {
    return res.status(400).json({ error: "Invalid conversation id." });
  }

  try {
    const db = await getDb();
    const conversation = await getConversationOr404(db, conversationId, req.user.id, res);
    if (!conversation) {
      return undefined;
    }

    await db.run("DELETE FROM messages WHERE conversation_id = ?", [conversationId]);
    await db.run(
      "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      [conversationId]
    );
    return res.json({ cleared: true });
  } catch (error) {
    console.error("[messages:clear]", error);
    return res.status(500).json({ error: "Failed to clear conversation." });
  }
});

app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
  const conversationId = parseConversationId(req.params.id);
  if (!conversationId) {
    return res.status(400).json({ error: "Invalid conversation id." });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      "DELETE FROM conversations WHERE id = ? AND user_id = ?",
      [conversationId, req.user.id]
    );
    if (!result.changes) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    return res.json({ deleted: true });
  } catch (error) {
    console.error("[conversations:delete]", error);
    return res.status(500).json({ error: "Failed to delete conversation." });
  }
});

app.post("/api/chat", requireAuth, async (req, res) => {
  const message = normalizeText(req.body?.message);
  const rawConversationId = req.body?.conversationId;
  const historyFromClient = req.body?.history;
  const attachments = normalizeChatAttachments(req.body?.attachments);

  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Message is too long (max ${MAX_MESSAGE_LENGTH} chars).`
    });
  }

  try {
    const db = await getDb();
    let history = [];

    if (rawConversationId !== undefined && rawConversationId !== null && rawConversationId !== "") {
      const conversationId = parseConversationId(rawConversationId);
      if (!conversationId) {
        return res.status(400).json({ error: "Invalid conversation id." });
      }

      const conversation = await getConversationOr404(
        db,
        conversationId,
        req.user.id,
        res
      );
      if (!conversation) {
        return undefined;
      }

      const dbHistory = await db.all(
        `
        SELECT role, content
        FROM messages
        WHERE conversation_id = ?
          AND role IN ('user', 'assistant')
        ORDER BY id DESC
        LIMIT ?
        `,
        [conversationId, MAX_CONTEXT_MESSAGES]
      );
      history = dbHistory.reverse();
    } else {
      history = sanitizeHistory(historyFromClient);
    }

    const cleanHistory = sanitizeHistory(history);
    const profileRow = await ensureUserProfile(db, req.user.id);
    const userProfile = sanitizeProfile(profileRow);
    const cityKnowledge =
      resolveCityKnowledge(message, cleanHistory) ||
      findNorwayCityKnowledge(userProfile.default_city);
    const assistant = await createAssistantReply({
      message,
      history: cleanHistory,
      cityKnowledge,
      userProfile,
      attachments
    });
    const normalizedAssistantReply = stripRawUrlsFromReply(assistant.reply);
    const mapsSuggestions = buildGoogleMapsSuggestions({
      message,
      reply: normalizedAssistantReply,
      cityKnowledge,
      userProfile
    });
    const replyWithMaps = appendGoogleMapsLinksToReply(
      normalizedAssistantReply,
      mapsSuggestions
    );

    return res.json({
      reply: replyWithMaps,
      mode: assistant.mode,
      personality: BOT_PERSONALITY.name
    });
  } catch (error) {
    console.error("[chat]", error);
    return res.status(500).json({ error: "Chat generation failed." });
  }
});

app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/explore", (req, res) => {
  res.sendFile(path.join(publicDir, "explore.html"));
});

app.get("/about", (req, res) => {
  res.sendFile(path.join(publicDir, "about.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(publicDir, "chat.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/profile", (req, res) => {
  res.sendFile(path.join(publicDir, "profile.html"));
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found." });
});

async function start() {
  try {
    await getDb();
    app.listen(PORT, () => {
      console.log(`MoodRoute AI running on http://localhost:${PORT}`);
      console.log(`Model: ${OPENAI_MODEL}`);
      console.log(`Live OpenAI mode configured: ${Boolean(OPENAI_API_KEY)}`);
      console.log(`GitHub OAuth configured: ${Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET)}`);
    });
  } catch (error) {
    console.error("Server failed to start:", error);
    process.exit(1);
  }
}

start();

module.exports = app;




