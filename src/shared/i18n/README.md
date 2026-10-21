# Interface languages

The interface is in English (the default), Portuguese (Brazil) and Spanish. The user picks the language in Settings → General. The language of a book is a separate setting: it controls the AI output, spell check and export, not the interface.

## Files

- `en/<namespace>.ts` holds the English texts. English is the source.
- `pt-BR/<namespace>.ts` and `es/<namespace>.ts` hold the translations. Their type is `typeof en`, so TypeScript reports a missing or extra key.
- Each namespace belongs to one part of the app: `common`, `app`, `library`, `editor`, `chat`, `plan`, `settings`, `exportDialog`, `write`, `history`, `onboarding`, `read` (the editor's read: comments in the margin), `main` (main process).

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
- Do not put AI prompts here. Prompts stay in English (`src/shared/prompts`). One exception: the instructions of the built-in actions (`common.builtinActionInstructions`). The user reads and edits them in the settings, so they are in the interface language. The English text comes from `DEFAULT_ACTIONS`; keep the same lines in each translation.
- Brand and program names do not change: Wordelia, Claude, Claude Code, Codex, Anthropic API, OpenAI API, ChatGPT, Obsidian, Google Docs, Word, `claude`, `codex`. Key names do not change: Ctrl, Alt, Shift, Enter, Esc. Effort names are translated (`common.efforts`): the settings keep the English id, the interface shows the name.
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
| Story world | Universo da história | Universo de la historia |
| Category | Categoria | Categoría |
| Note (a planning entry; `Entry` in code) | Nota | Nota |
| Alias | Outro nome | Otro nombre |
| Update notes / from the chapters (the sync button) | Atualizar notas / pelos capítulos | Actualizar notas / desde los capítulos |
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
| All books / This book (where an action is kept) | Todos os livros / Este livro | Todos los libros / Este libro |
| Reply (send to chat) | Responder | Responder |
| Mention | Menção | Mención |
| Version / Version history | Versão / Histórico de versões | Versión / Historial de versiones |
| Trash | Lixeira | Papelera |
| Model / Effort / Provider | Modelo / Esforço / Provedor | Modelo / Esfuerzo / Proveedor |
| Low / Medium / High (effort) | Baixo / Médio / Alto | Bajo / Medio / Alto |
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
| Delete | Excluir | Eliminar |
| Accept / Reject (a change) | Aceitar / Rejeitar | Aceptar / Rechazar |
