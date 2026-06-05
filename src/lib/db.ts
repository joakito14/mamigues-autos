import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { PERSONALITY_PROMPT } from "./system-prompt";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "messages.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);

  _db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
      last_message_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS connection_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT CHECK(status IN ('disconnected','qr','connecting','connected'))
        NOT NULL DEFAULT 'disconnected',
      qr_string TEXT,
      phone TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT OR IGNORE INTO connection_state (id, status) VALUES (1, 'disconnected');

    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      content TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_pending
      ON outbox(sent, created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price TEXT NOT NULL,
      description TEXT NOT NULL,
      image_base64 TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  try { _db.exec("ALTER TABLE conversations ADD COLUMN last_model TEXT"); } catch {}
  try { _db.exec("ALTER TABLE conversations ADD COLUMN client_summary TEXT"); } catch {}
  try { _db.exec("ALTER TABLE conversations ADD COLUMN read_status TEXT NOT NULL DEFAULT 'new'"); } catch {}

  return _db;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  created_at: number;
  last_model: string | null;
  client_summary: string | null;
  read_status: "new" | "read";
}

export interface ConversationWithPreview extends Conversation {
  last_message_preview: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: number;
}

export interface ConnectionState {
  id: number;
  status: "disconnected" | "qr" | "connecting" | "connected";
  qr_string: string | null;
  phone: string | null;
  updated_at: number;
}

export interface OutboxItem {
  id: number;
  conversation_id: number;
  phone: string;
  content: string;
  sent: number;
  created_at: number;
}

// ─── Conversaciones ───────────────────────────────────────────────────────────

export function getOrCreateConversation(phone: string, name?: string): Conversation {
  const db = getDb();
  let conv = db.prepare<[string]>("SELECT * FROM conversations WHERE phone = ?").get(phone) as Conversation | undefined;
  if (!conv) {
    conv = db.prepare<[string, string | null]>(
      "INSERT INTO conversations (phone, name) VALUES (?, ?) RETURNING *"
    ).get(phone, name ?? null) as Conversation;
  } else if (name && conv.name !== name) {
    db.prepare<[string | null, number]>("UPDATE conversations SET name = ? WHERE id = ?").run(name, conv.id);
    conv = { ...conv, name };
  }
  return conv;
}

export function getConversationById(id: number): Conversation | null {
  return (getDb().prepare<[number]>("SELECT * FROM conversations WHERE id = ?").get(id) as Conversation | undefined) ?? null;
}

export function listConversations(): ConversationWithPreview[] {
  return getDb()
    .prepare(
      `SELECT c.*,
        (SELECT content FROM messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC LIMIT 1) AS last_message_preview
       FROM conversations c
       ORDER BY c.last_message_at DESC NULLS LAST`
    )
    .all() as ConversationWithPreview[];
}

export function setMode(conversationId: number, mode: "AI" | "HUMAN"): void {
  getDb().prepare<["AI" | "HUMAN", number]>("UPDATE conversations SET mode = ? WHERE id = ?").run(mode, conversationId);
}

export function setReadStatus(id: number, status: "new" | "read"): void {
  getDb().prepare("UPDATE conversations SET read_status = ? WHERE id = ?").run(status, id);
}

export function updateConversationMeta(id: number, last_model: string | null, client_summary: string | null): void {
  getDb().prepare(
    "UPDATE conversations SET last_model = ?, client_summary = ? WHERE id = ?"
  ).run(last_model, client_summary, id);
}

export function deleteConversation(id: number): void {
  const db = getDb();
  const tx = db.transaction((cid: number) => {
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(cid);
    db.prepare("DELETE FROM outbox WHERE conversation_id = ? AND sent = 0").run(cid);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(cid);
  });
  tx(id);
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────

export function insertMessage(conversationId: number, role: "user" | "assistant" | "human", content: string): Message {
  const db = getDb();
  const tx = db.transaction((cid: number, r: string, c: string): Message => {
    const msg = db.prepare<[number, string, string]>(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?) RETURNING *"
    ).get(cid, r, c) as Message;
    db.prepare<[number]>("UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?").run(cid);
    return msg;
  });
  return tx(conversationId, role, content);
}

export function getMessages(conversationId: number, limit = 50): Message[] {
  return getDb().prepare<[number, number]>(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?"
  ).all(conversationId, limit) as Message[];
}

export function getRecentHistory(conversationId: number, limit = 20): Message[] {
  const rows = getDb().prepare<[number, number]>(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(conversationId, limit) as Message[];
  return rows.reverse();
}

// ─── Estado de conexión ───────────────────────────────────────────────────────

export function getConnectionState(): ConnectionState {
  return getDb().prepare("SELECT * FROM connection_state WHERE id = 1").get() as ConnectionState;
}

export function setConnectionState(args: {
  status: "disconnected" | "qr" | "connecting" | "connected";
  qr_string?: string | null;
  phone?: string | null;
}): void {
  const db = getDb();
  const current = getConnectionState();
  const qr = args.qr_string !== undefined ? args.qr_string : current.qr_string;
  const phone = args.phone !== undefined ? args.phone : current.phone;
  db.prepare(
    `UPDATE connection_state SET status = ?, qr_string = ?, phone = ?, updated_at = unixepoch() WHERE id = 1`
  ).run(args.status, qr, phone);
}

// ─── Outbox ───────────────────────────────────────────────────────────────────

export function enqueueOutbox(conversationId: number, phone: string, content: string): void {
  getDb().prepare<[number, string, string]>(
    "INSERT INTO outbox (conversation_id, phone, content) VALUES (?, ?, ?)"
  ).run(conversationId, phone, content);
}

export function getPendingOutbox(limit = 20): OutboxItem[] {
  return getDb().prepare<[number]>(
    "SELECT * FROM outbox WHERE sent = 0 ORDER BY created_at ASC LIMIT ?"
  ).all(limit) as OutboxItem[];
}

export function markOutboxSent(id: number): void {
  getDb().prepare<[number]>("UPDATE outbox SET sent = 1 WHERE id = ?").run(id);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb().prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`
  ).run(key, value);
}

// ─── Productos ────────────────────────────────────────────────────────────────

export interface Product {
  id: number;
  name: string;
  price: string;
  description: string;
  image_base64: string | null;
  created_at: number;
}

export function listProducts(): Product[] {
  return getDb()
    .prepare("SELECT id, name, price, description, image_base64, created_at FROM products ORDER BY created_at ASC")
    .all() as Product[];
}

export function createProduct(name: string, price: string, description: string, image_base64?: string | null): Product {
  return getDb()
    .prepare("INSERT INTO products (name, price, description, image_base64) VALUES (?, ?, ?, ?) RETURNING *")
    .get(name, price, description, image_base64 ?? null) as Product;
}

export function updateProduct(id: number, data: { name?: string; price?: string; description?: string; image_base64?: string | null }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.price !== undefined) { fields.push("price = ?"); values.push(data.price); }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
  if (data.image_base64 !== undefined) { fields.push("image_base64 = ?"); values.push(data.image_base64); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteProduct(id: number): void {
  getDb().prepare("DELETE FROM products WHERE id = ?").run(id);
}

export function getProductById(id: number): Product | null {
  return (
    (getDb()
      .prepare("SELECT id, name, price, description, image_base64, created_at FROM products WHERE id = ?")
      .get(id) as Product | undefined) ?? null
  );
}

// ─── System prompt dinámico ───────────────────────────────────────────────────

export function buildSystemPrompt(): string {
  const personality = getSetting("personality") ?? PERSONALITY_PROMPT;
  const products = listProducts();

  if (products.length === 0) return personality;

  const catalog = products
    .map((p) => {
      const foto = p.image_base64 ? " (foto disponible)" : "";
      return `- [id:${p.id}] ${p.name}: ${p.price}. ${p.description}${foto}`;
    })
    .join("\n");

  const imageInstructions = `
FOTOS DE PRODUCTOS:
Si el cliente pide ver una foto de un producto, incluí AL FINAL de tu respuesta de texto el marcador exacto [IMAGEN:ID] reemplazando ID por el número id del producto. Solo usá este marcador si el producto tiene "(foto disponible)" en el inventario. No incluyas el marcador si no hay foto disponible.`;

  return `${personality}\n\nINVENTARIO DISPONIBLE:\n${catalog}\n${imageInstructions}`;
}

export default getDb;
