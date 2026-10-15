// Compare version numbers such as "2.1.198" and "2.1.280".

function parts(v: string): number[] {
  const m = v.match(/\d+(\.\d+)*/)
  return m ? m[0].split('.').map(Number) : []
}

/** True when version `a` is older than version `b`. Unknown versions are never older. */
export function isOlderVersion(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const x = parts(a)
  const y = parts(b)
  if (!x.length || !y.length) return false
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0
  }
  return false
}
