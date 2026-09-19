const noon = (d: string) => new Date(d + "T12:00:00Z");

export function weekday(d: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "UTC" }).format(noon(d));
  } catch {
    return "";
  }
}

export function shortDate(d: string): string {
  const [, m, dd] = d.split("-");
  return `${+dd}.${+m}`;
}
