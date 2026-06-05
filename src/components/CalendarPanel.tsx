"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Appointment {
  id: number;
  conversation_id: number | null;
  phone: string | null;
  client_name: string;
  title: string;
  start_time: number;
  end_time: number;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled";
}

interface AvailDay {
  day_of_week: number;
  enabled: number;
  start_hour: number;
  end_hour: number;
  slot_minutes: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TZ = "America/Montevideo";
const DAY_FULL = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DAY_HEADER = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DURATIONS = [30, 45, 60, 90, 120];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function nowTZ(): { year: number; month: number; day: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const get = (t: string) => parseInt(p.find((x) => x.type === t)!.value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

function localDateKey(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: TZ });
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function getDow(year: number, month: number, day: number): number {
  // 0=Sun..6=Sat in JS → convert to Mon=0..Sun=6
  const dow = new Date(year, month, day).getDay();
  return (dow + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Returns array of { year, month, day } for each cell in the 6-row grid (42 cells)
function buildMonthGrid(year: number, month: number): Array<{ year: number; month: number; day: number; current: boolean }> {
  const firstDow = getDow(year, month, 1); // Mon=0
  const total = daysInMonth(year, month);
  const cells: Array<{ year: number; month: number; day: number; current: boolean }> = [];

  // Leading days from prev month
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevTotal = daysInMonth(prevYear, prevMonth);
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ year: prevYear, month: prevMonth, day: prevTotal - i, current: false });
  }

  // Current month days
  for (let d = 1; d <= total; d++) {
    cells.push({ year, month, day: d, current: true });
  }

  // Trailing days from next month
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  let nd = 1;
  while (cells.length < 42) {
    cells.push({ year: nextYear, month: nextMonth, day: nd++, current: false });
  }

  return cells;
}

function computeSlots(year: number, month: number, day: number, avail: AvailDay | undefined, appts: Appointment[]): string[] {
  if (!avail || !avail.enabled) return [];
  const dateStr = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const slots: string[] = [];
  const step = avail.slot_minutes / 60;
  for (let h = avail.start_hour; h + step <= avail.end_hour; h += step) {
    const hh = Math.floor(h);
    const mm = Math.round((h % 1) * 60);
    const slotStart = Math.floor(new Date(`${dateStr}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00-03:00`).getTime() / 1000);
    const slotEnd = slotStart + avail.slot_minutes * 60;
    const busy = appts.some((a) => a.start_time < slotEnd && a.end_time > slotStart);
    if (!busy) slots.push(`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`);
  }
  return slots;
}

// ─── AvailabilityPanel ────────────────────────────────────────────────────────

function AvailabilityPanel({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState<AvailDay[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetch("/api/availability").then((r) => r.json()).then(setDays); }, []);

  function update(dow: number, field: keyof AvailDay, value: number) {
    setDays((prev) => prev.map((d) => d.day_of_week === dow ? { ...d, [field]: value } : d));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(days) });
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  const hourOpts = Array.from({ length: 29 }, (_, i) => {
    const h = 7 + i * 0.5;
    const hh = Math.floor(h); const mm = (h % 1) * 60;
    return { value: h, label: `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}` };
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
        <h3 className="font-bold text-sm text-gray-900 dark:text-slate-100">Horarios disponibles</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {days.map((d) => (
          <div key={d.day_of_week} className={`rounded-xl border p-3 ${d.enabled ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20" : "border-gray-200 dark:border-slate-700 opacity-60"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{DAY_FULL[d.day_of_week]}</span>
              <button onClick={() => update(d.day_of_week, "enabled", d.enabled ? 0 : 1)}
                className={`relative w-9 h-5 rounded-full transition-colors ${d.enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-600"}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${d.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            {d.enabled && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <select value={d.start_hour} onChange={(e) => update(d.day_of_week, "start_hour", parseFloat(e.target.value))}
                  className="text-xs border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 rounded-lg px-2 py-1 focus:outline-none">
                  {hourOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className="text-xs text-gray-400">a</span>
                <select value={d.end_hour} onChange={(e) => update(d.day_of_week, "end_hour", parseFloat(e.target.value))}
                  className="text-xs border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 rounded-lg px-2 py-1 focus:outline-none">
                  {hourOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={d.slot_minutes} onChange={(e) => update(d.day_of_week, "slot_minutes", parseInt(e.target.value))}
                  className="text-xs border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 rounded-lg px-2 py-1 focus:outline-none">
                  {DURATIONS.map((v) => <option key={v} value={v}>{v} min</option>)}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-gray-200 dark:border-slate-700">
        <button onClick={save} disabled={saving}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-sm transition-colors">
          {saved ? "¡Guardado!" : saving ? "Guardando..." : "Guardar horarios"}
        </button>
      </div>
    </div>
  );
}

// ─── DayDetailPanel ───────────────────────────────────────────────────────────

function DayDetailPanel({
  year, month, day, appointments, avail, onClose, onRefresh, onViewConversation, onNewAppt,
}: {
  year: number; month: number; day: number;
  appointments: Appointment[];
  avail: AvailDay[];
  onClose: () => void;
  onRefresh: () => void;
  onViewConversation?: (id: number) => void;
  onNewAppt: (date: string) => void;
}) {
  const dow = getDow(year, month, day);
  const dateStr = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const dayAvail = avail.find((a) => a.day_of_week === (dow + 1) % 7); // convert Mon=0 back to Sun=0
  const dayAppts = appointments.filter((a) => localDateKey(a.start_time) === dateStr).sort((a, b) => a.start_time - b.start_time);
  const slots = computeSlots(year, month, day, dayAvail, dayAppts);
  const label = `${DAY_FULL[(dow + 1) % 7]} ${day} ${MONTHS_SHORT[month]}`;

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onRefresh();
  }

  async function remove(id: number) {
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="flex flex-col h-full border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-full sm:w-80 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
        <div>
          <p className="font-bold text-gray-900 dark:text-slate-100 text-sm">{label}</p>
          {slots.length > 0 && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{slots.length} slot{slots.length !== 1 ? "s" : ""} libre{slots.length !== 1 ? "s" : ""}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNewAppt(dateStr)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">
            + Cita
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
      </div>

      {/* Available slots */}
      {slots.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">Horarios disponibles</p>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Appointments */}
      <div className="flex-1 overflow-y-auto">
        {dayAppts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
            <p className="text-sm text-gray-400 dark:text-slate-500">Sin citas para este día.</p>
            <button onClick={() => onNewAppt(dateStr)}
              className="text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors">
              Agregar cita
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {dayAppts.map((a) => (
              <li key={a.id} className="px-4 py-3">
                {/* Time + status */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-gray-700 dark:text-slate-300">
                    {fmtTime(a.start_time)} – {fmtTime(a.end_time)}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    a.status === "confirmed" ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400" :
                    a.status === "pending" ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400" :
                    "bg-red-100 dark:bg-red-900/50 text-red-500"
                  }`}>
                    {a.status === "confirmed" ? "Confirmada" : a.status === "pending" ? "Pendiente" : "Cancelada"}
                  </span>
                </div>

                {/* Client + title */}
                <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">{a.client_name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">{a.title}</p>
                {a.notes && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 italic">{a.notes}</p>}
                {a.phone && <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">+{a.phone.replace(/@.*/,"")}</p>}

                {/* Link to conversation */}
                {a.conversation_id && onViewConversation && (
                  <button
                    onClick={() => onViewConversation(a.conversation_id!)}
                    className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Ver conversación de WhatsApp
                  </button>
                )}

                {/* Actions */}
                {a.status !== "cancelled" && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => updateStatus(a.id, a.status === "confirmed" ? "pending" : "confirmed")}
                      className="text-[10px] font-medium px-2 py-0.5 rounded border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Marcar {a.status === "confirmed" ? "pendiente" : "confirmada"}
                    </button>
                    <button
                      onClick={() => remove(a.id)}
                      className="text-[10px] font-medium px-2 py-0.5 rounded border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── NewAppointmentModal ──────────────────────────────────────────────────────

function NewAppointmentModal({ avail, appointments, initialDate, onClose, onSaved }: {
  avail: AvailDay[];
  appointments: Appointment[];
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const [form, setForm] = useState({ client_name: "", title: "Visita", date: initialDate ?? todayStr, time: "", duration: 60, notes: "" });
  const [saving, setSaving] = useState(false);

  const selDate = form.date ? new Date(form.date + "T12:00:00") : null;
  const selDow = selDate ? ((selDate.getDay() + 6) % 7) : -1;
  const jsDow = selDate ? selDate.getDay() : -1; // 0=Sun
  const dayAvail = avail.find((a) => a.day_of_week === jsDow);
  const dayAppts = appointments.filter((a) => localDateKey(a.start_time) === form.date);
  const slots = selDate ? computeSlots(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(), dayAvail, dayAppts) : [];
  void selDow;

  async function save() {
    if (!form.client_name.trim() || !form.time) return;
    setSaving(true);
    const startTs = Math.floor(new Date(`${form.date}T${form.time}:00-03:00`).getTime() / 1000);
    await fetch("/api/appointments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: form.client_name, title: form.title, start_time: startTs, end_time: startTs + form.duration * 60, notes: form.notes || null }),
    });
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-bold text-gray-900 dark:text-slate-100">Nueva cita</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <input type="text" placeholder="Nombre del cliente *" value={form.client_name}
            onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
            className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <input type="text" placeholder="Actividad (ej: Visita GLC) *" value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <div className="flex gap-2">
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, time: "" }))}
              className="flex-1 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <select value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: parseInt(e.target.value) }))}
              className="border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none">
              {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
          {form.date && (
            slots.length > 0 ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Horarios disponibles:</p>
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((s) => (
                    <button key={s} onClick={() => setForm((f) => ({ ...f, time: s }))}
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                        form.time === s ? "bg-emerald-500 border-emerald-600 text-white" : "bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-emerald-400"
                      }`}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Hora:</p>
                <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            )
          )}
          <textarea placeholder="Notas (opcional)" value={form.notes} rows={2}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none" />
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 border border-gray-300 dark:border-slate-600 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving || !form.client_name.trim() || !form.time}
            className="text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl transition-colors">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CalendarPanel ────────────────────────────────────────────────────────────

interface CalendarPanelProps {
  onBack?: () => void;
  onViewConversation?: (id: number) => void;
}

export default function CalendarPanel({ onBack, onViewConversation }: CalendarPanelProps) {
  const today = nowTZ();
  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [avail, setAvail] = useState<AvailDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<{ year: number; month: number; day: number } | null>(null);
  const [showAvail, setShowAvail] = useState(false);
  const [newApptDate, setNewApptDate] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [apptRes, availRes] = await Promise.all([fetch("/api/appointments"), fetch("/api/availability")]);
    setAppointments(await apptRes.json());
    setAvail(await availRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }
  function goToday() { setViewYear(today.year); setViewMonth(today.month); }

  const grid = buildMonthGrid(viewYear, viewMonth);
  const todayKey = `${today.year}-${String(today.month + 1).padStart(2,"0")}-${String(today.day).padStart(2,"0")}`;

  // Group appointments by date key
  const apptByDay: Record<string, Appointment[]> = {};
  for (const a of appointments) {
    const k = localDateKey(a.start_time);
    if (!apptByDay[k]) apptByDay[k] = [];
    apptByDay[k].push(a);
  }

  // Avail indexed by JS dow (0=Sun)
  const availByJsDow: Record<number, AvailDay> = {};
  for (const a of avail) availByJsDow[a.day_of_week] = a;

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Main grid area ── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
          {onBack && (
            <button onClick={onBack}
              className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 border border-gray-300 dark:border-slate-600 hover:border-emerald-400 px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
              ‹ Mensajes
            </button>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm transition-colors">‹</button>
            <button onClick={goToday} className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Hoy</button>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm transition-colors">›</button>
          </div>
          <span className="font-bold text-gray-900 dark:text-slate-100 text-sm flex-1">{MONTHS[viewMonth]} {viewYear}</span>
          <button onClick={() => { setShowAvail((v) => !v); setSelectedDay(null); }}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${showAvail ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" : "border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
            Horarios
          </button>
          <button onClick={() => { setNewApptDate(undefined); }}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
            onClickCapture={() => setNewApptDate(todayKey)}>
            + Nueva cita
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
          {DAY_HEADER.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-slate-700 flex-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 h-24 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-slate-700">
              {grid.map(({ year, month, day, current }) => {
                const dateKey = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const dayAppts = (apptByDay[dateKey] ?? []).filter((a) => a.status !== "cancelled");
                const isToday = dateKey === todayKey;

                // JS dow for this cell
                const jsDow = new Date(year, month, day).getDay();
                const dayAvail = availByJsDow[jsDow];
                const allAppts = apptByDay[dateKey] ?? [];
                const slots = computeSlots(year, month, day, dayAvail, allAppts.filter((a) => a.status !== "cancelled"));
                const isSelected = selectedDay?.year === year && selectedDay?.month === month && selectedDay?.day === day;

                return (
                  <button
                    key={dateKey}
                    onClick={() => { setSelectedDay({ year, month, day }); setShowAvail(false); }}
                    className={`min-h-[80px] md:min-h-[100px] p-1.5 text-left flex flex-col gap-0.5 transition-colors relative group ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/40"
                        : "bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/60"
                    } ${!current ? "opacity-40" : ""}`}
                  >
                    {/* Day number */}
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0 ${
                      isToday ? "bg-emerald-500 text-white" : isSelected ? "text-emerald-700 dark:text-emerald-400" : "text-gray-700 dark:text-slate-300"
                    }`}>
                      {day}
                    </span>

                    {/* Slots indicator */}
                    {slots.length > 0 && dayAppts.length === 0 && (
                      <span className="text-[9px] text-emerald-500 font-medium">
                        {slots.length} libre{slots.length !== 1 ? "s" : ""}
                      </span>
                    )}

                    {/* Appointment previews */}
                    {dayAppts.slice(0, 2).map((a) => (
                      <div key={a.id} className={`w-full rounded px-1 py-0.5 truncate text-[10px] font-medium leading-tight ${
                        a.status === "confirmed" ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300"
                      }`}>
                        {fmtTime(a.start_time)} {a.client_name}
                      </div>
                    ))}
                    {dayAppts.length > 2 && (
                      <span className="text-[9px] text-gray-400 dark:text-slate-500 font-medium">+{dayAppts.length - 2} más</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Day detail side panel ── */}
      {selectedDay && !showAvail && (
        <DayDetailPanel
          year={selectedDay.year}
          month={selectedDay.month}
          day={selectedDay.day}
          appointments={appointments}
          avail={avail}
          onClose={() => setSelectedDay(null)}
          onRefresh={loadData}
          onViewConversation={onViewConversation}
          onNewAppt={(date) => setNewApptDate(date)}
        />
      )}

      {/* ── Availability side panel ── */}
      {showAvail && (
        <div className="w-72 shrink-0 border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
          <AvailabilityPanel onClose={() => setShowAvail(false)} />
        </div>
      )}

      {/* ── New appointment modal ── */}
      {newApptDate !== undefined && (
        <NewAppointmentModal
          avail={avail}
          appointments={appointments}
          initialDate={newApptDate}
          onClose={() => setNewApptDate(undefined)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
