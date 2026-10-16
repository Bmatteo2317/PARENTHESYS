export const Permission = {
  ADMIN: "ADMIN",
  HELPER: "HELPER",
  MEMBER: "MEMBER",
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const Category = {
  WORK: "WORK",
  SCHOOL: "SCHOOL",
  SPORT: "SPORT",
  HEALTH: "HEALTH",
  HOUSEHOLD: "HOUSEHOLD",
  LEISURE: "LEISURE",
} as const;
export type Category = (typeof Category)[keyof typeof Category];

export const EventStatus = {
  CONFIRMED: "CONFIRMED",
  UNASSIGNED: "UNASSIGNED",
  CONFLICT: "CONFLICT",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const TaskStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CONFLICT_WARNING: "CONFLICT_WARNING",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export type WorkSchedule = { unavailable?: { day: number; start: string; end: string }[] } | null;
