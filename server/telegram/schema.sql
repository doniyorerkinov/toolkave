-- Applied with: npx wrangler d1 execute toolkave-bot --file server/telegram/schema.sql --remote
CREATE TABLE IF NOT EXISTS pending (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id  INTEGER NOT NULL,
  file_id  TEXT    NOT NULL,
  kind     TEXT    NOT NULL,
  bytes    INTEGER NOT NULL,
  name     TEXT    NOT NULL,
  added_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pending_chat ON pending (chat_id, id);

CREATE TABLE IF NOT EXISTS chats (
  chat_id            INTEGER PRIMARY KEY,
  counter_message_id INTEGER,
  updated_at         INTEGER NOT NULL
);

-- The language someone picked, which is not the language their phone is in:
-- plenty of Uzbek teachers run Telegram in Russian and read Uzbek. Kept apart
-- from `chats` on purpose - that table is batch state and gets cleared the
-- moment a PDF is sent, while a preference has to outlive every batch.
CREATE TABLE IF NOT EXISTS prefs (
  chat_id INTEGER PRIMARY KEY,
  locale  TEXT    NOT NULL,
  set_at  INTEGER NOT NULL
);
