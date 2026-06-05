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

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER REFERENCES conversations(id),
      phone TEXT,
      client_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Visita',
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      notes TEXT,
      status TEXT CHECK(status IN ('pending','confirmed','cancelled')) NOT NULL DEFAULT 'confirmed',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_time
      ON appointments(start_time);

    CREATE TABLE IF NOT EXISTS availability (
      day_of_week INTEGER PRIMARY KEY CHECK(day_of_week BETWEEN 0 AND 6),
      enabled INTEGER NOT NULL DEFAULT 0,
      start_hour REAL NOT NULL DEFAULT 9.0,
      end_hour REAL NOT NULL DEFAULT 18.0,
      slot_minutes INTEGER NOT NULL DEFAULT 60
    );
  `);

  try { _db.exec("ALTER TABLE conversations ADD COLUMN last_model TEXT"); } catch {}
  try { _db.exec("ALTER TABLE conversations ADD COLUMN client_summary TEXT"); } catch {}
  try { _db.exec("ALTER TABLE conversations ADD COLUMN read_status TEXT NOT NULL DEFAULT 'new'"); } catch {}
  try { _db.exec("ALTER TABLE conversations ADD COLUMN pending_reply INTEGER NOT NULL DEFAULT 0"); } catch {}

  // Seed disponibilidad por defecto si está vacía
  const availCount = (_db.prepare("SELECT COUNT(*) as c FROM availability").get() as { c: number }).c;
  if (availCount === 0) {
    const seedStmt = _db.prepare(
      "INSERT OR IGNORE INTO availability (day_of_week, enabled, start_hour, end_hour, slot_minutes) VALUES (?, ?, ?, ?, ?)"
    );
    // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
    [[0,0,9,18,60],[1,1,9,18,60],[2,1,9,18,60],[3,1,9,18,60],[4,1,9,18,60],[5,1,9,18,60],[6,1,9,13,60]]
      .forEach(r => seedStmt.run(...r));
  }

  // Migración v2: limpiar prompt viejo para que el nuevo del archivo sea el default
  const promptVersion = _db.prepare("SELECT value FROM settings WHERE key = 'prompt_version'").get() as { value: string } | undefined;
  if (!promptVersion || promptVersion.value !== '2') {
    _db.prepare("DELETE FROM settings WHERE key = 'personality'").run();
    _db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('prompt_version', '2', unixepoch())").run();
  }

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
  pending_reply: number;
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

export function setPendingReply(id: number, pending: boolean): void {
  getDb().prepare("UPDATE conversations SET pending_reply = ? WHERE id = ?").run(pending ? 1 : 0, id);
}

export function getConversationsPendingReply(): Conversation[] {
  return getDb()
    .prepare("SELECT * FROM conversations WHERE pending_reply = 1 AND mode = 'AI'")
    .all() as Conversation[];
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

// ─── Estado del bot ──────────────────────────────────────────────────────────

export type BotState = "idle" | "processing" | "ratelimit" | "error";

export interface BotStatus {
  state: BotState;
  detail: string;
  updated_at: number;
}

export function getBotStatus(): BotStatus {
  const raw = getSetting("bot_status");
  if (!raw) return { state: "idle", detail: "", updated_at: 0 };
  try { return JSON.parse(raw) as BotStatus; }
  catch { return { state: "idle", detail: "", updated_at: 0 }; }
}

export function setBotStatus(state: BotState, detail = ""): void {
  setSetting("bot_status", JSON.stringify({ state, detail, updated_at: Math.floor(Date.now() / 1000) }));
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

// ─── Citas / Agenda ───────────────────────────────────────────────────────────

export interface Appointment {
  id: number;
  conversation_id: number | null;
  phone: string | null;
  client_name: string;
  title: string;
  start_time: number;
  end_time: number;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled";
  created_at: number;
}

export interface AvailabilityDay {
  day_of_week: number;
  enabled: number;
  start_hour: number;
  end_hour: number;
  slot_minutes: number;
}

export function listAppointments(from?: number, to?: number): Appointment[] {
  if (from !== undefined && to !== undefined) {
    return getDb().prepare(
      "SELECT * FROM appointments WHERE start_time >= ? AND start_time < ? AND status != 'cancelled' ORDER BY start_time"
    ).all(from, to) as Appointment[];
  }
  return getDb().prepare(
    "SELECT * FROM appointments WHERE status != 'cancelled' ORDER BY start_time"
  ).all() as Appointment[];
}

export function listAllAppointments(): Appointment[] {
  return getDb().prepare("SELECT * FROM appointments ORDER BY start_time DESC").all() as Appointment[];
}

export function createAppointment(data: {
  conversation_id?: number | null;
  phone?: string | null;
  client_name: string;
  title: string;
  start_time: number;
  end_time: number;
  notes?: string | null;
  status?: "pending" | "confirmed" | "cancelled";
}): Appointment {
  return getDb().prepare(
    "INSERT INTO appointments (conversation_id, phone, client_name, title, start_time, end_time, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
  ).get(
    data.conversation_id ?? null,
    data.phone ?? null,
    data.client_name,
    data.title,
    data.start_time,
    data.end_time,
    data.notes ?? null,
    data.status ?? "confirmed"
  ) as Appointment;
}

export function updateAppointment(id: number, data: Partial<Pick<Appointment, "client_name" | "title" | "notes" | "status" | "start_time" | "end_time">>): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.client_name !== undefined) { fields.push("client_name = ?"); values.push(data.client_name); }
  if (data.title !== undefined) { fields.push("title = ?"); values.push(data.title); }
  if (data.notes !== undefined) { fields.push("notes = ?"); values.push(data.notes); }
  if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status); }
  if (data.start_time !== undefined) { fields.push("start_time = ?"); values.push(data.start_time); }
  if (data.end_time !== undefined) { fields.push("end_time = ?"); values.push(data.end_time); }
  if (fields.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE appointments SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteAppointment(id: number): void {
  getDb().prepare("DELETE FROM appointments WHERE id = ?").run(id);
}

export function getAvailability(): AvailabilityDay[] {
  return getDb().prepare("SELECT * FROM availability ORDER BY day_of_week").all() as AvailabilityDay[];
}

export function setDayAvailability(day: AvailabilityDay): void {
  getDb().prepare(
    `INSERT INTO availability (day_of_week, enabled, start_hour, end_hour, slot_minutes) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(day_of_week) DO UPDATE SET enabled=excluded.enabled, start_hour=excluded.start_hour,
     end_hour=excluded.end_hour, slot_minutes=excluded.slot_minutes`
  ).run(day.day_of_week, day.enabled, day.start_hour, day.end_hour, day.slot_minutes);
}

// ─── System prompt dinámico ───────────────────────────────────────────────────

const TZ = "America/Montevideo";
const DAY_NAMES_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function buildAvailabilityContext(): string {
  const avail = getAvailability();
  if (!avail.some((d) => d.enabled)) return "";

  const now = new Date();
  const lines: string[] = [];

  for (let i = 1; i <= 14 && lines.length < 5; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);

    // Day of week in Montevideo timezone
    const localStr = date.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(localStr);
    if (dow === -1) continue;

    const dayAvail = avail.find((a) => a.day_of_week === dow);
    if (!dayAvail || !dayAvail.enabled) continue;

    // Day boundaries in Montevideo time
    const localDate = date.toLocaleDateString("es-UY", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
    const [d, m, y] = localDate.split("/");
    const dayStartTs = Math.floor(new Date(`${y}-${m}-${d}T00:00:00-03:00`).getTime() / 1000);
    const dayEndTs = dayStartTs + 86400;

    const existing = listAppointments(dayStartTs, dayEndTs);

    const slots: string[] = [];
    const step = dayAvail.slot_minutes / 60;
    for (let h = dayAvail.start_hour; h + step <= dayAvail.end_hour; h += step) {
      const hh = Math.floor(h);
      const mm = Math.round((h % 1) * 60);
      const slotStart = Math.floor(new Date(`${y}-${m}-${d}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00-03:00`).getTime() / 1000);
      const slotEnd = slotStart + dayAvail.slot_minutes * 60;
      const busy = existing.some((a) => a.start_time < slotEnd && a.end_time > slotStart);
      if (!busy) slots.push(`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`);
    }

    if (slots.length > 0) {
      lines.push(`- ${DAY_NAMES_ES[dow]} ${d}/${m}: ${slots.join(", ")}`);
    }
  }

  if (lines.length === 0) return "";

  return `\n\nAGENDA — DISPONIBILIDAD PARA VISITAS (próximos días):\n${lines.join("\n")}\n
Si el cliente quiere coordinar una visita o reunión al concesionario:
1. Ofrecé 2-3 horarios del listado de arriba.
2. Cuando confirme un horario específico, respondé de forma natural y al FINAL, en una línea nueva, escribí exactamente:
[CITA:FECHA_ISO:NOMBRE:TITULO]
   FECHA_ISO = 2026-06-10T10:00 (año-mes-díaTHH:MM hora Uruguay)
   NOMBRE = nombre del cliente o "Cliente"
   TITULO = breve descripción (ej: "Visita GLC", "Consulta financiamiento")

Ejemplo: [CITA:2026-06-10T10:00:Joaquín:Visita Clase C]
El cliente no ve este marcador. No lo mencionés.`;
}

export function buildSystemPrompt(): string {
  const personality = getSetting("personality") ?? PERSONALITY_PROMPT;
  const products = listProducts();
  const agendaCtx = buildAvailabilityContext();

  if (products.length === 0) return personality + agendaCtx;

  const catalog = products
    .map((p) => {
      const foto = p.image_base64 ? " (foto disponible)" : "";
      return `- [id:${p.id}] ${p.name}: ${p.price}. ${p.description}${foto}`;
    })
    .join("\n");

  const imageInstructions = `
FOTOS DE PRODUCTOS:
Si el cliente pide ver una foto de un producto, incluí AL FINAL de tu respuesta de texto el marcador exacto [IMAGEN:ID] reemplazando ID por el número id del producto. Solo usá este marcador si el producto tiene "(foto disponible)" en el inventario. No incluyas el marcador si no hay foto disponible.`;

  return `${personality}\n\nINVENTARIO DISPONIBLE:\n${catalog}\n${imageInstructions}${agendaCtx}`;
}

export default getDb;
