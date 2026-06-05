# Agente WhatsApp Local

Bot de WhatsApp con dashboard local. Conecta un número real vía Baileys (QR), responde mensajes con un LLM de OpenRouter y permite gestionar conversaciones desde el navegador.

## Requisitos

- Node.js 20+ (recomendado: 22 via [nvm](https://github.com/nvm-sh/nvm) o [nvm-windows](https://github.com/coreybutler/nvm-windows))
- Cuenta en [OpenRouter](https://openrouter.ai) con créditos cargados

## Instalación

```bash
# 1. Instalar dependencias (tarda ~1 min por better-sqlite3 nativo)
npm install

# 2. Copiar variables de entorno y completarlas
cp .env.example .env.local
# Editar .env.local con tu OPENROUTER_API_KEY y OPENROUTER_MODEL
```

## Uso

### Opción A — Procesos separados (recomendado para desarrollo)

Terminal 1:
```bash
npm run start:bot
```

Terminal 2:
```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) → aparece el QR → escanearlo con WhatsApp.

### Opción B — Todo junto (producción local)

```bash
npm run build
npm run start:all
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `OPENROUTER_API_KEY` | Clave de API de OpenRouter |
| `OPENROUTER_MODEL` | Modelo a usar. Recomendado: `openai/gpt-4o-mini` |

> **Importante sobre modelos gratuitos:** Los modelos `:free` de OpenRouter tienen límite de 50 requests/día sin créditos cargados. En producción real van a fallar con error 429. Usar `openai/gpt-4o-mini` cuesta ~$0.15 por millón de tokens — centavos por mes para uso normal.

## Personalizar el system prompt

Editar `src/lib/system-prompt.ts`:

```typescript
export const SYSTEM_PROMPT = `
Eres el asistente virtual de [Tu Negocio].
Respondé en español, en mensajes breves.
...
`.trim();
```

## Estructura de carpetas

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Punto de entrada (renderiza ConnectionGate)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/                # API routes (servidor)
│       ├── connection/status/
│       ├── connection/disconnect/
│       ├── conversations/
│       ├── messages/[conversationId]/
│       └── mode/[conversationId]/
├── components/             # Componentes React
│   ├── ConnectionGate.tsx  # Orquestador principal
│   ├── QRScreen.tsx        # Pantalla de escaneo QR
│   ├── DashboardHeader.tsx
│   ├── ConversationList.tsx
│   ├── ConversationPanel.tsx
│   ├── MessageBubble.tsx
│   └── ModeToggle.tsx
└── lib/
    ├── db.ts               # SQLite (better-sqlite3)
    ├── openrouter.ts       # Cliente LLM
    ├── system-prompt.ts    # Prompt del bot
    └── baileys/
        ├── client.ts       # Conexión y state machine de Baileys
        └── handler.ts      # Procesamiento de mensajes entrantes
scripts/
├── env-loader.ts           # Carga .env.local (side-effect)
└── start-bot.ts            # Punto de entrada del proceso bot
data/                       # SQLite (gitignored)
auth/                       # Sesión Baileys (gitignored)
```

## Deploy en EasyPanel / Railway

1. Subir el código a un repositorio Git (sin `data/` ni `auth/`).
2. En EasyPanel crear una app con buildpack **Nixpacks** (usa `nixpacks.toml` automáticamente).
3. Configurar variables de entorno: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
4. **Agregar volúmenes persistentes** (crítico):
   - `/app/data` — base de datos SQLite
   - `/app/auth` — sesión Baileys
   - Sin ellos, cada redespliegue pierde conversaciones y requiere re-escanear el QR.
5. Puerto: `3000`.

## Seguridad — LEER ANTES DE DESPLEGAR

El dashboard **no tiene autenticación**. Cualquiera con la URL puede:
- Leer todas las conversaciones de WhatsApp
- Enviar mensajes haciéndose pasar por el dueño

**Antes de exponer a internet**, agregá una capa de autenticación:
- Basic auth a nivel proxy (Nginx / Caddy / EasyPanel)
- [Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/) (gratis hasta 50 usuarios)

## Solución de problemas

### El bot tira código 440 en loop
- Verificar que `Browsers.macOS('Desktop')` esté en `client.ts`.
- En el teléfono: Configuración → Dispositivos vinculados → borrar dispositivos viejos de pruebas.
- Si persiste: cambiar IP del servidor o esperar 24 h.

### Error 429 del LLM
- El modelo `:free` saturó la cuota (50 req/día).
- Cambiar a `openai/gpt-4o-mini` en `OPENROUTER_MODEL`.

### Procesos zombies en Windows después de Ctrl+C
```powershell
# Listar procesos node
tasklist | findstr node
# Matar por PID
taskkill /PID <pid> /F
```

### El QR no aparece en el dashboard
- Verificar que el proceso bot esté corriendo (`npm run start:bot`).
- Si lleva más de 10 segundos sin QR, la pantalla muestra un mensaje de error.
- Revisar la terminal del bot por errores de conexión.

## Mejoras pendientes (v2)

- [ ] Soporte de imágenes salientes (enviar PNG de productos)
- [ ] Function calling con `tools` de OpenRouter
- [ ] Auto-toggle a HUMAN cuando el bot detecta una frase específica (regex en `handler.ts`)
- [ ] WebSocket en lugar de polling para actualizaciones en tiempo real
- [ ] Autenticación básica integrada en Next.js (middleware)
- [ ] Búsqueda de mensajes
- [ ] Soporte de grupos (actualmente ignorados)
