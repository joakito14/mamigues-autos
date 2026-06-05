interface MessageBubbleProps {
  role: "user" | "assistant" | "human";
  content: string;
  createdAt: number;
}

function formatTime(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({ role, content, createdAt }: MessageBubbleProps) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isHuman = role === "human";

  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-800 dark:text-slate-100 rounded-tl-sm"
            : isAssistant
            ? "bg-emerald-500 text-white rounded-tr-sm"
            : "bg-amber-400 text-amber-900 rounded-tr-sm"
        }`}
      >
        {isHuman && (
          <p className="text-[10px] font-semibold uppercase mb-1 opacity-70">
            Asesor
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{content}</p>
        <p
          className={`text-[10px] mt-1 text-right ${
            isUser ? "text-gray-400 dark:text-slate-400" : "opacity-60"
          }`}
        >
          {formatTime(createdAt)}
        </p>
      </div>
    </div>
  );
}
