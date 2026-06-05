"use client";

import { useEffect, useRef, useState } from "react";

interface Product {
  id: number;
  name: string;
  price: string;
  description: string;
  image_base64: string | null;
}

interface SettingsPanelProps {
  onClose: () => void;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  result.push(field.trim());
  return result;
}

function downloadCSV(content: string, filename: string) {
  const bom = "﻿"; // UTF-8 BOM para que Excel lo abra bien
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<"personality" | "products">("personality");

  // ─── Personalidad ─────────────────────────────────────────────────────────
  const [personality, setPersonality] = useState("");
  const [personalitySaved, setPersonalitySaved] = useState(false);
  const [personalityLoading, setPersonalityLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/prompt")
      .then((r) => r.json())
      .then((d) => { setPersonality(d.value ?? ""); setPersonalityLoading(false); });
  }, []);

  async function savePersonality() {
    await fetch("/api/settings/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: personality }),
    });
    setPersonalitySaved(true);
    setTimeout(() => setPersonalitySaved(false), 2000);
  }

  // ─── Productos ────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [form, setForm] = useState({ name: "", price: "", description: "", image_base64: "" });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (tab === "products") loadProducts(); }, [tab]);

  async function loadProducts() {
    setProductsLoading(true);
    const r = await fetch("/api/settings/products");
    setProducts(await r.json());
    setProductsLoading(false);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image_base64: reader.result as string }));
    reader.readAsDataURL(file);
  }

  async function handleAddProduct() {
    if (!form.name.trim() || !form.price.trim() || !form.description.trim()) return;
    setAdding(true);
    await fetch("/api/settings/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", price: "", description: "", image_base64: "" });
    if (fileRef.current) fileRef.current.value = "";
    await loadProducts();
    setAdding(false);
  }

  async function handleDeleteProduct(id: number) {
    await fetch(`/api/settings/products/${id}`, { method: "DELETE" });
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  // ─── CSV ──────────────────────────────────────────────────────────────────

  function downloadTemplate() {
    const csv = [
      "nombre,precio,descripcion",
      "Mercedes-Benz Clase A,U$D 35.000,Compacto premium ideal para ciudad",
      "Mercedes-Benz GLC,U$D 75.000,SUV espacioso perfecto para familia o ruta",
    ].join("\n");
    downloadCSV(csv, "plantilla_productos.csv");
  }

  function exportInventory() {
    if (products.length === 0) return;
    const rows = products.map(
      (p) => `${escapeCSV(p.name)},${escapeCSV(p.price)},${escapeCSV(p.description)}`
    );
    const csv = ["nombre,precio,descripcion", ...rows].join("\n");
    downloadCSV(csv, "inventario_productos.csv");
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (csvRef.current) csvRef.current.value = "";

    setImporting(true);
    setImportResult(null);

    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setImportResult("El archivo está vacío o no tiene datos.");
      setImporting(false);
      return;
    }

    const headers = parseCSVLine(lines[0].toLowerCase());
    const nameIdx = headers.findIndex((h) => h.includes("nombre"));
    const priceIdx = headers.findIndex((h) => h.includes("precio"));
    const descIdx = headers.findIndex((h) => h.includes("descripcion") || h.includes("descripción"));

    if (nameIdx === -1 || priceIdx === -1 || descIdx === -1) {
      setImportResult("El CSV debe tener columnas: nombre, precio, descripcion");
      setImporting(false);
      return;
    }

    let imported = 0;
    let errors = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const name = cols[nameIdx]?.trim();
      const price = cols[priceIdx]?.trim();
      const description = cols[descIdx]?.trim();
      if (!name || !price || !description) { errors++; continue; }

      const res = await fetch("/api/settings/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, price, description }),
      });
      if (res.ok) imported++; else errors++;
    }

    await loadProducts();
    setImporting(false);
    setImportResult(
      errors === 0
        ? `Se importaron ${imported} producto${imported !== 1 ? "s" : ""} correctamente.`
        : `${imported} importado${imported !== 1 ? "s" : ""}, ${errors} con error (filas incompletas).`
    );
    setTimeout(() => setImportResult(null), 5000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="font-bold text-gray-900 dark:text-slate-100 text-lg">Configuración del Bot</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 px-6">
          {(["personality", "products"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                  : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
              }`}
            >
              {t === "personality" ? "Personalidad / Tono" : "Productos"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Personalidad ── */}
          {tab === "personality" && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Escribí cómo querés que se comporte el bot: tono, nombre, directrices, etc.
              </p>
              {personalityLoading ? (
                <div className="h-64 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
              ) : (
                <textarea
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  rows={14}
                  className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-y"
                />
              )}
              <div className="flex justify-end">
                <button
                  onClick={savePersonality}
                  disabled={personalityLoading}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {personalitySaved ? "¡Guardado!" : "Guardar"}
                </button>
              </div>
            </div>
          )}

          {/* ── Productos ── */}
          {tab === "products" && (
            <div className="flex flex-col gap-5">

              {/* Acciones CSV */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 bg-gray-50 dark:bg-slate-800">
                <h3 className="font-semibold text-gray-800 dark:text-slate-200 text-sm mb-3">Importar / Exportar CSV</h3>
                <div className="flex flex-wrap gap-2">
                  {/* Descargar plantilla */}
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    Descargar plantilla
                  </button>

                  {/* Importar CSV */}
                  <label className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    importing
                      ? "border-gray-300 text-gray-400 bg-gray-100 cursor-wait"
                      : "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                  }`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {importing ? "Importando..." : "Importar CSV"}
                    <input
                      ref={csvRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={handleImportCSV}
                      disabled={importing}
                    />
                  </label>

                  {/* Exportar inventario */}
                  <button
                    onClick={exportInventory}
                    disabled={products.length === 0}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Exportar inventario ({products.length})
                  </button>
                </div>

                {importResult && (
                  <p className={`mt-2 text-xs font-medium ${
                    importResult.includes("error") || importResult.includes("Error")
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {importResult}
                  </p>
                )}

                <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-500">
                  El CSV debe tener las columnas: <span className="font-mono">nombre, precio, descripcion</span>
                </p>
              </div>

              {/* Formulario agregar producto */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 bg-gray-50 dark:bg-slate-800">
                <h3 className="font-semibold text-gray-800 dark:text-slate-200 text-sm mb-3">Agregar producto manualmente</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Nombre *"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <input
                    type="text"
                    placeholder="Precio (ej: U$D 65.000) *"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <textarea
                  placeholder="Descripción breve *"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none mb-3"
                />
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer text-sm text-emerald-600 hover:text-emerald-700 font-medium">
                    {form.image_base64 ? "Imagen cargada ✓" : "Subir imagen (opcional)"}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                  {form.image_base64 && (
                    <img src={form.image_base64} alt="preview" className="h-12 w-12 object-cover rounded-lg border" />
                  )}
                  <button
                    onClick={handleAddProduct}
                    disabled={adding || !form.name.trim() || !form.price.trim() || !form.description.trim()}
                    className="ml-auto bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    {adding ? "Agregando..." : "Agregar"}
                  </button>
                </div>
              </div>

              {/* Lista de productos */}
              {productsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-4">
                  No hay productos. Agregá uno manualmente o importá un CSV.
                </p>
              ) : (
                <ul className="space-y-2">
                  {products.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800">
                      {p.image_base64 ? (
                        <img src={p.image_base64} alt={p.name} className="h-12 w-12 object-cover rounded-lg border border-gray-200 dark:border-slate-700 shrink-0" />
                      ) : (
                        <div className="h-12 w-12 bg-gray-100 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 shrink-0 flex items-center justify-center text-gray-300 text-xl">?</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-slate-100 truncate">{p.name}</p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{p.price}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{p.description}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="shrink-0 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      >
                        Eliminar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
