"use client";

interface ModeToggleProps {
  conversationId: number;
  mode: "AI" | "HUMAN";
  onToggle: (newMode: "AI" | "HUMAN") => void;
}

export default function ModeToggle({ conversationId, mode, onToggle }: ModeToggleProps) {
  async function handleToggle() {
    const newMode: "AI" | "HUMAN" = mode === "AI" ? "HUMAN" : "AI";
    await fetch(`/api/mode/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    onToggle(newMode);
  }

  const isAI = mode === "AI";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Modo:</span>
      <button
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus:outline-none ${
          isAI ? "bg-emerald-500" : "bg-amber-400"
        }`}
        title={isAI ? "Cambiar a modo Humano" : "Cambiar a modo IA"}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isAI ? "translate-x-1" : "translate-x-7"
          }`}
        />
      </button>
      <span
        className={`text-xs font-semibold ${
          isAI ? "text-emerald-600" : "text-amber-600"
        }`}
      >
        {isAI ? "IA" : "HUMANO"}
      </span>
    </div>
  );
}
