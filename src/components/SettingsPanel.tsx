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

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<"personality" | "products">("personality");

  // ─── Personalidad ─────────────────────────────────────────────────────────
  const [personality, setPersonality] = useState("");
  const [personalitySaved, setPersonalitySaved] = useState(false);
  const [personalityLoading, setPersonalityLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/prompt")
      .then((r) => r.json())
      .then((d) => {
        setPersonality(d.value ?? "");
        setPersonalityLoading(false);
      });
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === "products") loadProducts();
  }, [tab]);

  async function loadProducts() {
    setProductsLoading(true);
    const r = await fetch("/api/settings/products");
    const data = await r.json();
    setProducts(data);
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
          <button
            onClick={() => setTab("personality")}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              tab === "personality"
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
            }`}
          >
            Personalidad / Tono
          </button>
          <button
            onClick={() => setTab("products")}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              tab === "products"
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
            }`}
          >
            Productos
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "personality" && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Escribí cómo querés que se comporte el bot: tono, nombre, directrices, etc.
                Esta descripción reemplaza al system prompt base.
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
              <div className="flex justify-end gap-2">
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

          {tab === "products" && (
            <div className="flex flex-col gap-6">
              {/* Formulario de nuevo producto */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 bg-gray-50 dark:bg-slate-800">
                <h3 className="font-semibold text-gray-800 dark:text-slate-200 text-sm mb-3">Agregar producto</h3>
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
                    placeholder="Precio (ej: $65,000) *"
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
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                    />
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
                <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-6">
                  No hay productos. Agregá uno para incluirlo en el inventario del bot.
                </p>
              ) : (
                <ul className="space-y-2">
                  {products.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800"
                    >
                      {p.image_base64 ? (
                        <img
                          src={p.image_base64}
                          alt={p.name}
                          className="h-12 w-12 object-cover rounded-lg border border-gray-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 bg-gray-100 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 shrink-0 flex items-center justify-center text-gray-300 text-xl">
                          ?
                        </div>
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
