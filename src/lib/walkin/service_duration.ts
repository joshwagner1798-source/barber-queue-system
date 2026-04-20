export interface ShopDurationSettings {
  default_walkin_minutes: number
  transition_buffer_minutes?: number  // defaults to 5 if absent
  service_durations?: Record<string, number>  // populated when service selection ships
}

export function getWalkinDuration(
  walkin: { service_type?: string | null },
  shopSettings: ShopDurationSettings,
): number {
  const specific = walkin.service_type ? shopSettings.service_durations?.[walkin.service_type] : undefined
  if (specific && specific > 0) return specific
  return shopSettings.default_walkin_minutes
}
