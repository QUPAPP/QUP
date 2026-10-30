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

export interface CountForms {
  one: string;
  two: string;
  few: string;
  many: string;
  other: string;
}

const pluralRules = new Intl.PluralRules("ar");

export function countText(count: number, forms: CountForms): string {
  switch (pluralRules.select(count)) {
    case "one":
      return forms.one;
    case "two":
      return forms.two;
    case "many":
      return `${count} ${forms.many}`;
    case "other":
      return `${count} ${forms.other}`;
    default:
      return `${count} ${forms.few}`;
  }
}

export const ROWS: CountForms = {
  one: "صف واحد",
  two: "صفّان",
  few: "صفوف",
  many: "صفًا",
  other: "صف",
};

export const COLUMNS: CountForms = {
  one: "عمود واحد",
  two: "عمودان",
  few: "أعمدة",
  many: "عمودًا",
  other: "عمود",
};

export const QUESTIONS: CountForms = {
  one: "سؤال واحد",
  two: "سؤالان",
  few: "أسئلة",
  many: "سؤالًا",
  other: "سؤال",
};

export const MINUTES: CountForms = {
  one: "دقيقة واحدة",
  two: "دقيقتان",
  few: "دقائق",
  many: "دقيقة",
  other: "دقيقة",
};
