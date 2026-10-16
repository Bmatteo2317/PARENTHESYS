export const italianDate = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export const italianMonth = new Intl.DateTimeFormat("it-IT", {
  month: "long",
  year: "numeric",
});

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addCalendarDays(date: Date, amount: number) {
  const result = startOfLocalDay(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function mondayOffset(date: Date) {
  return (date.getDay() + 6) % 7;
}
