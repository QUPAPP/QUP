const LOCALE = "ar-SA-u-nu-latn";
const TIME_ZONE = "Asia/Riyadh";

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  calendar: "gregory",
  dateStyle: "medium",
  timeZone: TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  calendar: "gregory",
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(new Date(value));
}
