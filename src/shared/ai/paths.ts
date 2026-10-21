// The program path that the writer types in Settings → AI.

/**
 * The path without spaces and quotes around it. "Copy as path" in Windows puts the path in quotes:
 * "C:\Program Files\claude\claude.exe". Empty: undefined (the app finds the program itself).
 */
export function cleanProgramPath(path: string | undefined): string | undefined {
  const p = (path ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim()
  return p || undefined
}
