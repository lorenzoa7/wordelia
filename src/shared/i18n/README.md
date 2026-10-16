# Interface languages

The interface is in English (the default), Portuguese (Brazil) and Spanish. The user picks the language in Settings → General. The language of a book is a separate setting: it controls the AI output, spell check and export, not the interface.

## Files

- `en/<namespace>.ts` holds the English texts. English is the source.
- `pt-BR/<namespace>.ts` and `es/<namespace>.ts` hold the translations. Their type is `typeof en`, so TypeScript reports a missing or extra key.
- Each namespace belongs to one part of the app: `common`, `app`, `library`, `editor`, `chat`, `plan`, `settings`, `exportDialog`, `write`, `history`, `onboarding`, `main` (main process).

## Use

```tsx
import { useT } from '@/lib/i18n'

const t = useT()                 // in a React component
<Button>{t.common.cancel}</Button>
toast(t.library.imported(3))     // a function for text with values
```

Outside React (stores, plain functions): `getT()` from `@/lib/i18n`. In the main process: `await mainT()` from `src/main/i18n.ts`.

## Rules

- Keep the English text exactly as it was. Tests and screenshots look for it.
- Text with a value is a function: `deleted: (title: string) => \`Deleted “${title}”.\``. Plurals are functions of a number.
- Numbers and dates: `t.common.number(n)` and `t.common.locale`.
- Do not put AI prompts here. Prompts stay in English (`src/shared/prompts`).
- Brand and program names do not change: Wordelia, Claude, Claude Code, Codex, Anthropic API, OpenAI API, ChatGPT, Obsidian, Google Docs, Word, `claude`, `codex`. Key names do not change: Ctrl, Alt, Shift, Enter, Esc.
- Use the terms below. Write like the English: short labels, sentence case, the same tone. Portuguese uses "você". Spanish uses "tú", neutral Latin American Spanish.

## Terms

| English | Português (Brasil) | Español |
|---|---|---|
| Book | Livro | Libro |
| Library | Biblioteca | Biblioteca |
| Chapter | Capítulo | Capítulo |
| Manuscript | Manuscrito | Manuscrito |
| Scene break | Quebra de cena | Salto de escena |
| Planning | Planejamento | Planificación |
| Story bible | Bíblia da história | Biblia de la historia |
| Category | Categoria | Categoría |
| Entry (a planning note) | Nota | Nota |
| Alias | Outro nome | Otro nombre |
| Sync with manuscript | Sincronizar com o manuscrito | Sincronizar con el manuscrito |
| Writing rules | Regras de escrita | Reglas de escritura |
| Write / Plan (views) | Escrever / Planejar | Escribir / Planificar |
| Chat | Chat | Chat |
| Thread | Conversa | Conversación |
| Purpose (of a thread) | Propósito | Propósito |
| Digest | Resumo | Resumen |
| Proposal | Proposta | Propuesta |
| Change (in a diff) | Mudança | Cambio |
| Action | Ação | Acción |
| Main action | Ação principal | Acción principal |
| Reply (send to chat) | Responder | Responder |
| Mention | Menção | Mención |
| Version / Version history | Versão / Histórico de versões | Versión / Historial de versiones |
| Trash | Lixeira | Papelera |
| Model / Effort / Provider | Modelo / Esforço / Provedor | Modelo / Esfuerzo / Proveedor |
| Connected / Not connected | Conectado / Não conectado | Conectado / No conectado |
| Log in | Entrar | Iniciar sesión |
| Settings | Configurações | Ajustes |
| Appearance | Aparência | Apariencia |
| Typography | Tipografia | Tipografía |
| Focus mode | Modo foco | Modo concentración |
| Typewriter scrolling | Rolagem de máquina de escrever | Desplazamiento de máquina de escribir |
| Daily goal | Meta diária | Meta diaria |
| Export / Import | Exportar / Importar | Exportar / Importar |
| Page / Desk | Página / Mesa | Página / Escritorio |
