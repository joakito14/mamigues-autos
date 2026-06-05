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
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DURATIONS = [30, 45, 60, 90, 120];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateStr(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: TZ });
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function fmtDateLabel(d: Date): string {
  const dow = parseInt(d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" }).replace(/[^0-9]/g, "")) || ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" }));
  const localDow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" }));
  const dayNum = parseInt(d.toLocaleDateString("en-US", { timeZone: TZ, day: "numeric" }));
  const mon = parseInt(d.toLocaleDateString("en-US", { timeZone: TZ, month: "numeric" })) - 1;
  return `${DAY_FULL[localDow]} ${dayNum} ${MONTHS[mon]}`;
}

function getMondayDate(weekOffset: number): Date {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon + weekOffset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getWeekDays(weekOffset: number): Date[] {
  const mon = getMondayDate(weekOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function localDateStrOf(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

function computeSlots(d: Date, avail: AvailDay | undefined, appts: Appointment[]): string[] {
  if (!avail || !avail.enabled) return [];
  const dateStr = localDateStrOf(d);
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

function getDowOf(d: Date): number {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(
    d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" })
  );
}

// ─── AvailabilityPanel ────────────────────────────────────────────────────────

function AvailabilityPanel({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState<AvailDay[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/availability").then((r) => r.json()).then(setDays);
  }, []);

  function update(dow: number, field: keyof AvailDay, value: number) {
    setDays((prev) => prev.map((d) => d.day_of_week === dow ? { ...d, [field]: value } : d));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(days),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1000);
  }

  const hourOptions = Array.from({ length: 29 }, (_, i) => {
    const h = 7 + i * 0.5;
    const hh = Math.floor(h);
    const mm = (h % 1) * 60;
    return { value: h, label: `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}` };
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
        <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm">Horarios disponibles</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {days.map((d) => (
          <div key={d.day_of_week} className={`rounded-xl border p-3 transition-colors ${d.enabled ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 opacity-60"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm text-gray-800 dark:text-slate-200">{DAY_FULL[d.day_of_week]}</span>
              <button
                onClick={() => update(d.day_of_week, "enabled", d.enabled ? 0 : 1)}
                className={`relative w-9 h-5 rounded-full transition-colors ${d.enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-600"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${d.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            {d.enabled && (
              <div className="flex items-center gap-2 flex-wrap">
                <select value={d.start_hour} onChange={(e) => update(d.day_of_week, "start_hour", parseFloat(e.target.value))}
                  className="text-xs border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 rounded-lg px-2 py-1 focus:outline-none">
                  {hourOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className="text-xs text-gray-400">a</span>
                <select value={d.end_hour} onChange={(e) => update(d.day_of_week, "end_hour", parseFloat(e.target.value))}
                  className="text-xs border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 rounded-lg px-2 py-1 focus:outline-none">
                  {hourOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

      <div className="p-4 border-t border-gray-200 dark:border-slate-700">
        <button onClick={save} disabled={saving}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-sm transition-colors">
          {saved ? "¡Guardado!" : saving ? "Guardando..." : "Guardar horarios"}
        </button>
      </div>
    </div>
  );
}

// ─── NewAppointmentModal ──────────────────────────────────────────────────────

interface NewApptForm {
  client_name: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  notes: string;
}

function NewAppointmentModal({ avail, appointments, onClose, onSaved }: {
  avail: AvailDay[];
  appointments: Appointment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const [form, setForm] = useState<NewApptForm>({
    client_name: "",
    title: "Visita",
    date: todayStr,
    time: "",
    duration: 60,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const selectedDate = form.date ? new Date(form.date + "T12:00:00-03:00") : null;
  const dow = selectedDate ? getDowOf(selectedDate) : -1;
  const dayAvail = avail.find((a) => a.day_of_week === dow);
  const dayAppts = appointments.filter((a) => {
    if (!form.date) return false;
    return toLocalDateStr(a.start_time) === form.date;
  });
  const slots = selectedDate ? computeSlots(selectedDate, dayAvail, dayAppts) : [];

  async function save() {
    if (!form.client_name.trim() || !form.title.trim() || !form.date || !form.time) return;
    setSaving(true);
    const startTs = Math.floor(new Date(`${form.date}T${form.time}:00-03:00`).getTime() / 1000);
    const endTs = startTs + form.duration * 60;
    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: form.client_name, title: form.title, start_time: startTs, end_time: endTs, notes: form.notes || null }),
    });
    setSaving(false);
    onSaved();
    onClose();
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
              className="border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
              {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>

          {/* Horario */}
          {form.date && (
            slots.length > 0 ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Horarios disponibles:</p>
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((s) => (
                    <button key={s} onClick={() => setForm((f) => ({ ...f, time: s }))}
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                        form.time === s
                          ? "bg-emerald-500 border-emerald-600 text-white"
                          : "bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-emerald-400"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Hora (sin disponibilidad configurada para ese día, podés poner hora libre):</p>
                <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            )
          )}

          <textarea placeholder="Notas (opcional)" value={form.notes} rows={2}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 dark:text-slate-400 border border-gray-300 dark:border-slate-600 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving || !form.client_name.trim() || !form.time}
            className="text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl transition-colors">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AppointmentCard ──────────────────────────────────────────────────────────

function AppointmentCard({ appt, onUpdate }: { appt: Appointment; onUpdate: () => void }) {
  async function cancel() {
    await fetch(`/api/appointments/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    onUpdate();
  }
  async function toggleStatus() {
    const next = appt.status === "confirmed" ? "pending" : "confirmed";
    await fetch(`/api/appointments/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    onUpdate();
  }

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
      appt.status === "confirmed"
        ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30"
        : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
    }`}>
      <div className="shrink-0 text-center min-w-[44px]">
        <p className="text-sm font-bold text-gray-800 dark:text-slate-200">{fmtTime(appt.start_time)}</p>
        <p className="text-[10px] text-gray-400 dark:text-slate-500">{fmtTime(appt.end_time)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{appt.client_name}</p>
        <p className="text-xs text-gray-600 dark:text-slate-400 truncate">{appt.title}</p>
        {appt.notes && <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate mt-0.5">{appt.notes}</p>}
        {appt.phone && <p className="text-[10px] text-gray-400 dark:text-slate-500">+{appt.phone.replace(/@.*/,"")}</p>}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={toggleStatus}
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
            appt.status === "confirmed"
              ? "text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100"
              : "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-100"
          }`}>
          {appt.status === "confirmed" ? "confirm." : "pendiente"}
        </button>
        <button onClick={cancel} className="text-[10px] text-red-400 hover:text-red-600 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800 hover:bg-red-50 transition-colors">
          cancelar
        </button>
      </div>
    </div>
  );
}

// ─── CalendarPanel ────────────────────────────────────────────────────────────

export default function CalendarPanel() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [avail, setAvail] = useState<AvailDay[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showAvailPanel, setShowAvailPanel] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [apptRes, availRes] = await Promise.all([
      fetch("/api/appointments"),
      fetch("/api/availability"),
    ]);
    setAppointments(await apptRes.json());
    setAvail(await availRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const weekDays = getWeekDays(weekOffset);

  // Week label
  const first = weekDays[0];
  const last = weekDays[6];
  const firstStr = `${first.toLocaleDateString("en-US", { timeZone: TZ, day: "numeric" })} ${MONTHS[parseInt(first.toLocaleDateString("en-US", { timeZone: TZ, month: "numeric" })) - 1]}`;
  const lastStr = `${last.toLocaleDateString("en-US", { timeZone: TZ, day: "numeric" })} ${MONTHS[parseInt(last.toLocaleDateString("en-US", { timeZone: TZ, month: "numeric" })) - 1]}`;
  const weekLabel = `${firstStr} – ${lastStr}`;

  const todayLocalStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* Main calendar area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset((w) => w - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm transition-colors">
              ‹
            </button>
            <button onClick={() => setWeekOffset(0)}
              className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
              Hoy
            </button>
            <button onClick={() => setWeekOffset((w) => w + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm transition-colors">
              ›
            </button>
          </div>
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 flex-1">{weekLabel}</span>
          <button onClick={() => setShowAvailPanel((v) => !v)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${showAvailPanel ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" : "border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
            Horarios
          </button>
          <button onClick={() => setShowNewForm(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">
            + Nueva cita
          </button>
        </div>

        {/* Week days */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="h-20 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            weekDays.map((d) => {
              const dateStr = localDateStrOf(d);
              const isToday = dateStr === todayLocalStr;
              const dow = getDowOf(d);
              const dayAvail = avail.find((a) => a.day_of_week === dow);
              const dayAppts = appointments.filter((a) => toLocalDateStr(a.start_time) === dateStr);
              const slots = computeSlots(d, dayAvail, dayAppts);
              const dayName = fmtDateLabel(d);

              return (
                <div key={dateStr} className={`rounded-2xl border overflow-hidden ${isToday ? "border-emerald-400 dark:border-emerald-600" : "border-gray-200 dark:border-slate-700"}`}>
                  {/* Day header */}
                  <div className={`flex items-center justify-between px-4 py-2 ${isToday ? "bg-emerald-500 text-white" : "bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300"}`}>
                    <span className={`font-semibold text-sm ${isToday ? "text-white" : ""}`}>{dayName}</span>
                    <div className="flex items-center gap-2">
                      {!dayAvail?.enabled && (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isToday ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400"}`}>
                          Sin disponibilidad
                        </span>
                      )}
                      {slots.length > 0 && (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isToday ? "bg-white/20 text-white" : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"}`}>
                          {slots.length} slot{slots.length !== 1 ? "s" : ""} libre{slots.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Appointments */}
                  <div className="p-3 space-y-2 bg-white dark:bg-slate-900">
                    {dayAppts.length === 0 && slots.length === 0 && (
                      <p className="text-xs text-center text-gray-300 dark:text-slate-600 py-2">Sin citas ni disponibilidad</p>
                    )}
                    {dayAppts.length === 0 && slots.length > 0 && (
                      <p className="text-xs text-center text-gray-400 dark:text-slate-500 py-2">Sin citas agendadas — {slots.length} horario{slots.length !== 1 ? "s" : ""} libre{slots.length !== 1 ? "s" : ""}</p>
                    )}
                    {dayAppts.map((a) => (
                      <AppointmentCard key={a.id} appt={a} onUpdate={loadData} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Availability side panel */}
      {showAvailPanel && (
        <div className="w-72 shrink-0 border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
          <AvailabilityPanel onClose={() => setShowAvailPanel(false)} />
        </div>
      )}

      {/* New appointment modal */}
      {showNewForm && (
        <NewAppointmentModal
          avail={avail}
          appointments={appointments}
          onClose={() => setShowNewForm(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
