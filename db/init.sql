CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  github_id TEXT UNIQUE,
  github_avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS github_avatar_url TEXT;

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New MoodRoute Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS user_id INTEGER;

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_city TEXT NOT NULL DEFAULT '',
  default_vibe TEXT NOT NULL DEFAULT '',
  default_budget TEXT NOT NULL DEFAULT '',
  crowd_tolerance TEXT NOT NULL DEFAULT '',
  weather_preference TEXT NOT NULL DEFAULT '',
  default_duration TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  visited_places_json TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated_at ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users ((LOWER(email)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON users ((LOWER(username)));

CREATE OR REPLACE FUNCTION touch_conversation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations
  SET updated_at = NOW()
  WHERE id = COALESCE(NEW.conversation_id, OLD.conversation_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_insert_touch_conversation ON messages;
CREATE TRIGGER trg_messages_insert_touch_conversation
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION touch_conversation_updated_at();

DROP TRIGGER IF EXISTS trg_messages_delete_touch_conversation ON messages;
CREATE TRIGGER trg_messages_delete_touch_conversation
AFTER DELETE ON messages
FOR EACH ROW
EXECUTE FUNCTION touch_conversation_updated_at();
