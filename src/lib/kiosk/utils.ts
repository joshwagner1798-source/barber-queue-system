export function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "")
}

export function buildDisplayName(firstName: string, lastInitial: string): string {
  const name =
    firstName.trim().charAt(0).toUpperCase() +
    firstName.trim().slice(1).toLowerCase()

  const initial = lastInitial.trim().charAt(0).toUpperCase()
  return `${name} ${initial}.`
}
