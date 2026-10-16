"use client";

import { Category, EventStatus, Permission } from "@/lib/domain";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, TriangleAlert, UsersRound, X } from "lucide-react";
import { DragEvent, useEffect, useMemo, useState, useTransition } from "react";
import { createEvent, deleteEvent, moveEvent, updateEvent } from "@/app/actions/calendar";
import { CATEGORY_OPTIONS, CATEGORY_META } from "@/lib/categories";
import { addCalendarDays, dateKey, italianDate, mondayOffset, startOfLocalDay } from "@/lib/format";

export type BoardPerson = {
  id: string;
  userId: string;
  name: string;
  role: string;
  color: string;
  initials: string;
  type: "user" | "kid";
  permission: Permission;
};

export type BoardEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  category: Category;
  status: EventStatus;
  assignedUserId: string | null;
  assignedUser: { id: string; name: string; avatarColor: string } | null;
  chaperoneUser: { id: string; name: string } | null;
  pickupUser: { id: string; name: string } | null;
  kidProfile: { id: string; name: string; avatarColor: string } | null;
};

type View = "month" | "week" | "day" | "agenda" | "family";

const shortDays = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];
const monthNames = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const hourHeight = 56;

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  return addCalendarDays(date, amount);
}

function formatMonth(date: Date) {
  return `${monthNames[date.getMonth()][0].toUpperCase()}${monthNames[date.getMonth()].slice(1)} ${date.getFullYear()}`;
}

function localTime(iso: string) {
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function eventDay(event: BoardEvent) {
  return dateKey(new Date(event.startTime));
}

function eventMinutes(iso: string) {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

function asLocalInput(iso: string) {
  const date = new Date(iso);
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function personForEvent(event: BoardEvent, people: BoardPerson[]) {
  if (event.kidProfile) return people.find((person) => person.id === `kid:${event.kidProfile?.id}`);
  if (event.assignedUserId) return people.find((person) => person.userId === event.assignedUserId);
  return undefined;
}

function hasConflict(event: BoardEvent, events: BoardEvent[]) {
  const personKey = event.kidProfile ? `kid:${event.kidProfile.id}` : event.assignedUserId;
  if (event.status === "CONFLICT") return true;
  if (!personKey) return false;
  return events.some((other) =>
    other.id !== event.id &&
    eventDay(other) === eventDay(event) &&
    (event.kidProfile
      ? other.kidProfile?.id === event.kidProfile.id
      : other.assignedUserId === event.assignedUserId) &&
    new Date(event.startTime) < new Date(other.endTime) &&
    new Date(event.endTime) > new Date(other.startTime),
  );
}

function rangeFor(date: Date, view: View) {
  if (view === "month") {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const from = addDays(first, -mondayOffset(first));
    return { from: dateKey(from), to: dateKey(addDays(from, 42)) };
  }
  if (view === "week") {
    const from = addDays(date, -mondayOffset(date));
    return { from: dateKey(from), to: dateKey(addDays(from, 7)) };
  }
  if (view === "agenda") {
    const from = addDays(date, -mondayOffset(date));
    return { from: dateKey(from), to: dateKey(addDays(from, 14)) };
  }
  return { from: dateKey(date), to: dateKey(addDays(date, 1)) };
}

export function CalendarBoard({
  initialDate,
  initialEvents,
  initialRange,
  people,
  canManage,
}: {
  initialDate: string;
  initialEvents: BoardEvent[];
  initialRange: { from: string; to: string };
  people: BoardPerson[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => parseDate(initialDate));
  const [view, setView] = useState<View>("month");
  const [events, setEvents] = useState(initialEvents);
  const [range, setRange] = useState(initialRange);
  const [membersFilter, setMembersFilter] = useState(() => new Set(people.map((person) => person.id)));
  const [categoryFilter, setCategoryFilter] = useState(() => new Set<Category>(CATEGORY_OPTIONS.map((item) => item.value)));
  const [modalEvent, setModalEvent] = useState<BoardEvent | null | undefined>(undefined);
  const [modalDate, setModalDate] = useState(initialDate);
  const [modalTime, setModalTime] = useState("09:00");
  const [detailEvent, setDetailEvent] = useState<BoardEvent | null>(null);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const today = startOfLocalDay(new Date());
  const filteredEvents = useMemo(
    () => events.filter((event) => {
      const person = personForEvent(event, people);
      const matchesMember = !person || membersFilter.has(person.id);
      return matchesMember && categoryFilter.has(event.category);
    }),
    [events, people, membersFilter, categoryFilter],
  );

  const activeRange = useMemo(() => rangeFor(selected, view), [selected, view]);

  async function refreshEvents(target = activeRange) {
    const response = await fetch(`/api/events?from=${target.from}&to=${target.to}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Non è stato possibile aggiornare il calendario.");
    const data = await response.json() as BoardEvent[];
    setEvents(data);
    setRange(target);
  }

  useEffect(() => {
    if (range.from === activeRange.from && range.to === activeRange.to) return;
    let active = true;
    fetch(`/api/events?from=${activeRange.from}&to=${activeRange.to}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Non è stato possibile caricare questo periodo.");
        return response.json() as Promise<BoardEvent[]>;
      })
      .then((data) => {
        if (active) {
          setEvents(data);
          setRange(activeRange);
        }
      })
      .catch((error: unknown) => {
        if (active) setToast(error instanceof Error ? error.message : "Errore nel caricamento del calendario.");
      });
    return () => { active = false; };
  }, [activeRange, range, range.from, range.to]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalEvent(undefined);
        setDetailEvent(null);
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const familyPeople = people.filter((person) => membersFilter.has(person.id));
  const dates = useMemo(() => {
    if (view === "day" || view === "family") return [selected];
    if (view === "week") {
      const monday = addDays(selected, -mondayOffset(selected));
      return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    }
    if (view === "agenda") {
      const monday = addDays(selected, -mondayOffset(selected));
      return Array.from({ length: 14 }, (_, index) => addDays(monday, index));
    }
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const start = addDays(first, -mondayOffset(first));
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [selected, view]);

  const heading = view === "month"
    ? formatMonth(selected)
    : view === "day" || view === "family"
      ? `${selected.getDate()} ${formatMonth(selected)}`
      : `${dates[0].getDate()} – ${dates[view === "agenda" ? 13 : 6].getDate()} ${formatMonth(dates[view === "agenda" ? 13 : 6])}`;

  function navigate(amount: number) {
    if (view === "month") setSelected(new Date(selected.getFullYear(), selected.getMonth() + amount, 1));
    else setSelected(addDays(selected, amount * (view === "day" || view === "family" ? 1 : view === "agenda" ? 14 : 7)));
  }

  function showModal(date = selected, hour = 9, event: BoardEvent | null = null, participantId?: string) {
    setFormError("");
    setDetailEvent(null);
    setModalEvent(event);
    setModalDate(dateKey(date));
    setModalTime(`${String(hour).padStart(2, "0")}:00`);
    setDefaultParticipant(participantId || "");
  }

  const [defaultParticipant, setDefaultParticipant] = useState("");

  async function submitEvent(form: FormData) {
    setFormError("");
    try {
      const result = modalEvent
        ? await updateEvent(form)
        : await createEvent(form);
      setModalEvent(undefined);
      await refreshEvents();
      router.refresh();
      const status = result && "status" in result ? result.status : undefined;
      setToast(status === "CONFLICT"
        ? "Impegno salvato: verifica la sovrapposizione segnalata."
        : status === "UNASSIGNED"
          ? "Impegno salvato. Manca ancora un responsabile."
          : "Impegno salvato nel calendario.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Non è stato possibile salvare l’impegno.");
    }
  }

  async function removeEvent(id: string) {
    const form = new FormData();
    form.set("id", id);
    try {
      await deleteEvent(form);
      setDetailEvent(null);
      setModalEvent(undefined);
      await refreshEvents();
      router.refresh();
      setToast("Impegno eliminato.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Non è stato possibile eliminare l’impegno.");
    }
  }

  async function dropEvent(event: DragEvent<HTMLElement>, date: Date, hour?: number) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (!id) return;
    const original = events.find((item) => item.id === id);
    if (!original) return;
    const form = new FormData();
    form.set("id", id);
    form.set("date", dateKey(date));
    form.set("start", hour === undefined ? localTime(original.startTime) : `${String(hour).padStart(2, "0")}:00`);
    try {
      await moveEvent(form);
      await refreshEvents();
      router.refresh();
      setToast("Impegno spostato.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Non è stato possibile spostare l’impegno.");
    }
  }

  function chooseView(nextView: View) {
    setView(nextView);
    if (nextView === "family") setSelected(startOfLocalDay(selected));
  }

  function toggleMember(id: string) {
    setMembersFilter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(category: Category) {
    setCategoryFilter((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function renderMiniCalendar() {
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const start = addDays(first, -mondayOffset(first));
    return (
      <section className="mini-calendar">
        <div className="mini-calendar-heading"><span>{formatMonth(selected)}</span><span className="mini-calendar-nav"><button type="button" aria-label="Mese precedente" onClick={() => setSelected(new Date(selected.getFullYear(), selected.getMonth() - 1, 1))}>‹</button><button type="button" aria-label="Mese successivo" onClick={() => setSelected(new Date(selected.getFullYear(), selected.getMonth() + 1, 1))}>›</button></span></div>
        <div className="mini-grid">
          {shortDays.map((day) => <span className="mini-weekday" key={day}>{day[0]}</span>)}
          {Array.from({ length: 42 }, (_, index) => {
            const day = addDays(start, index);
            const classes = ["mini-day", day.getMonth() !== selected.getMonth() ? "outside" : "", dateKey(day) === dateKey(today) ? "today" : "", dateKey(day) === dateKey(selected) ? "selected" : ""].filter(Boolean).join(" ");
            return <button className={classes} type="button" key={dateKey(day)} onClick={() => setSelected(day)}>{day.getDate()}</button>;
          })}
        </div>
      </section>
    );
  }

  function renderFilters() {
    return (
      <div className="sidebar-filters">
        <div className="filter-heading">La mia famiglia<button className="filter-all" type="button" onClick={() => setMembersFilter(membersFilter.size === people.length ? new Set() : new Set(people.map((person) => person.id)))}>{membersFilter.size === people.length ? "Nessuno" : "Tutti"}</button></div>
        {people.map((person) => (
          <label className="filter-row" key={person.id} style={{ "--check": person.color } as React.CSSProperties}>
            <input type="checkbox" checked={membersFilter.has(person.id)} onChange={() => toggleMember(person.id)} />
            <span className="check-box" />
            <span className="filter-avatar" style={{ background: person.color }}>{person.initials}</span>
            <span className="filter-name">{person.name}</span>
          </label>
        ))}
        <div className="filter-heading">Categorie<button className="filter-all" type="button" onClick={() => setCategoryFilter(categoryFilter.size === CATEGORY_OPTIONS.length ? new Set() : new Set(CATEGORY_OPTIONS.map((item) => item.value)))}>{categoryFilter.size === CATEGORY_OPTIONS.length ? "Nessuna" : "Tutte"}</button></div>
        {CATEGORY_OPTIONS.map((category) => (
          <label className="filter-row" key={category.value} style={{ "--check": category.color } as React.CSSProperties}>
            <input type="checkbox" checked={categoryFilter.has(category.value)} onChange={() => toggleCategory(category.value)} />
            <span className="check-box" /><span className="filter-color" style={{ background: category.color }} /><span>{category.label}</span>
          </label>
        ))}
      </div>
    );
  }

  function renderMonth() {
    return (
      <div className="month-grid">
        {shortDays.map((day) => <div className="month-weekday" key={day}>{day}</div>)}
        {dates.map((date) => {
          const dayEvents = filteredEvents.filter((event) => eventDay(event) === dateKey(date)).sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <div className={`month-cell ${date.getMonth() !== selected.getMonth() ? "outside" : ""} ${dateKey(date) === dateKey(today) ? "today-cell" : ""}`} key={dateKey(date)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropEvent(event, date)} onClick={() => { setSelected(date); setView("day"); }}>
              <div className="day-heading"><span className="day-number">{date.getDate()}</span></div>
              <div className="month-events">
                {dayEvents.slice(0, 3).map((item) => {
                  const person = personForEvent(item, people);
                  const category = CATEGORY_META[item.category];
                  return <button className="month-event" key={item.id} type="button" draggable={canManage} onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onClick={(event) => { event.stopPropagation(); setDetailEvent(item); }} style={{ "--event-color": person?.color ?? category.color, "--event-soft": person ? `${person.color}20` : category.soft } as React.CSSProperties} title={`${item.title} · ${localTime(item.startTime)}`}><span className="month-event-time">{localTime(item.startTime)}</span><span className="month-event-title">{item.title}</span><span aria-hidden="true">{category.icon}</span>{hasConflict(item, events) && <TriangleAlert className="event-warning" size={10} aria-label="Conflitto" />}</button>;
                })}
                {dayEvents.length > 3 && <button className="more-events" type="button" onClick={(event) => { event.stopPropagation(); setSelected(date); setView("day"); }}>+{dayEvents.length - 3} altri</button>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderTimeGrid() {
    const timeline = view === "family";
    const lanes = timeline
      ? familyPeople.map((person) => ({ date: selected, person }))
      : dates.map((date) => ({ date, person: undefined as BoardPerson | undefined }));

    if (timeline && lanes.length === 0) return <EmptyState title="Nessun familiare selezionato" message="Attiva una persona dal menu per confrontare gli impegni." />;

    const eventMatches = (item: BoardEvent, person?: BoardPerson) => {
      if (!person) return true;
      return person.type === "kid" ? item.kidProfile?.id === person.id.slice(4) : !item.kidProfile && item.assignedUserId === person.userId;
    };

    return (
      <div className="week-scroll">
        <div className="week-header" style={{ "--columns": lanes.length } as React.CSSProperties}>
          <div className="now-label"><Clock3 size={11} /></div>
          {lanes.map(({ date, person }, index) => <div className={`week-day-heading ${dateKey(date) === dateKey(today) ? "today-heading" : ""}`} key={`${dateKey(date)}-${person?.id ?? index}`}><strong>{date.getDate()}</strong>{shortDays[mondayOffset(date)]}{person && <span style={{ color: person.color, fontSize: 8 }}>{person.initials} {person.name}</span>}</div>)}
        </div>
        <div className="week-grid" style={{ display: "grid", gridTemplateColumns: `48px repeat(${lanes.length}, minmax(100px, 1fr))`, minWidth: "max-content" }}>
          <div className="time-labels">{Array.from({ length: 24 }, (_, hour) => <div className="time-label" key={hour}>{String(hour).padStart(2, "0")}:00</div>)}</div>
          <div className="time-columns" style={{ "--columns": lanes.length } as React.CSSProperties}>
            {lanes.map(({ date, person }, index) => {
              const dayEvents = filteredEvents.filter((item) => eventDay(item) === dateKey(date) && eventMatches(item, person));
              return (
                <div className="calendar-lane" key={`${dateKey(date)}-${person?.id ?? index}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                  const slot = (event.target as HTMLElement).closest(".hour-slot");
                  const hour = slot ? Number(slot.getAttribute("data-hour")) : Math.max(0, Math.min(23, Math.floor((event.clientY - event.currentTarget.getBoundingClientRect().top) / hourHeight)));
                  void dropEvent(event, date, hour);
                }}>
                  {Array.from({ length: 24 }, (_, hour) => <button type="button" className="hour-slot" key={hour} data-hour={hour} aria-label={`Crea impegno alle ${hour}:00`} onClick={() => showModal(date, hour, null, person?.id)} />)}
                  <div className="lane-events">
                    {dayEvents.map((item) => {
                      const owner = personForEvent(item, people);
                      const category = CATEGORY_META[item.category];
                      const top = eventMinutes(item.startTime) / 60 * hourHeight;
                      const height = Math.max(25, (new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 3600000 * hourHeight);
                      return <button type="button" draggable={canManage} onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onClick={() => setDetailEvent(item)} className="timed-event" key={item.id} style={{ "--event-color": owner?.color ?? category.color, "--event-soft": owner ? `${owner.color}20` : category.soft, top, height } as React.CSSProperties}><span className="timed-title">{category.icon} {item.title}{hasConflict(item, events) && <TriangleAlert className="event-warning" size={10} />}</span><span className="timed-meta">{localTime(item.startTime)}–{localTime(item.endTime)}{!timeline && owner ? ` · ${owner.name}` : ""}</span></button>;
                    })}
                  </div>
                  {dateKey(date) === dateKey(today) && <div className="time-line" style={{ top: (new Date().getHours() * 60 + new Date().getMinutes()) / 60 * hourHeight }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderAgenda() {
    const dayEvents = dates.map((date) => ({ date, events: filteredEvents.filter((item) => eventDay(item) === dateKey(date)) })).filter((group) => group.events.length);
    if (!dayEvents.length) return <EmptyState title="Un po’ di spazio per respirare." message="Nessun impegno in questo periodo. Aggiungine uno con il pulsante qui sopra." />;
    return <div className="agenda-scroll"><div className="agenda-list">{dayEvents.map(({ date, events: items }) => <section className="agenda-day" key={dateKey(date)}><h3 className="agenda-day-heading">{italianDate.format(date)}</h3>{items.map((item) => { const person = personForEvent(item, people); const category = CATEGORY_META[item.category]; return <button className="agenda-card" key={item.id} type="button" style={{ "--event-color": person?.color ?? category.color } as React.CSSProperties} onClick={() => setDetailEvent(item)}><span className="agenda-time">{localTime(item.startTime)}<br />{localTime(item.endTime)}</span><span className="agenda-color" /><span><span className="agenda-title">{item.title}{hasConflict(item, events) && <TriangleAlert className="event-warning" size={11} />}</span><span className="agenda-detail">{category.label}{item.location ? ` · ${item.location}` : ""}</span></span><span className="agenda-member">{person?.name ?? "Da assegnare"}{item.pickupUser && <span className="agenda-detail">Accompagna {item.pickupUser.name}</span>}</span><span className="agenda-category" /></button>; })}</section>)}</div></div>;
  }

  function renderCreateEditModal() {
    if (modalEvent === undefined) return null;
    const event = modalEvent;
    const date = event ? asLocalInput(event.startTime).slice(0, 10) : modalDate;
    const start = event ? asLocalInput(event.startTime).slice(11, 16) : modalTime;
    const defaultEndHour = Math.min(Number(modalTime.slice(0, 2)) + 1, 23);
    const end = event ? asLocalInput(event.endTime).slice(11, 16) : `${String(defaultEndHour).padStart(2, "0")}:${defaultEndHour === 23 ? "59" : "00"}`;
    const participant = event?.kidProfile ? `kid:${event.kidProfile.id}` : event?.assignedUserId ? `user:${event.assignedUserId}` : defaultParticipant;
    const onSubmit = async (form: FormData) => {
      startTransition(async () => {
        await submitEvent(form);
      });
    };
    return (
      <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalEvent(undefined); }}>
        <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
          <div className="modal-header"><div><span className="modal-eyebrow">{event ? "MODIFICA IMPEGNO" : "NUOVO IMPEGNO"}</span><h2 className="modal-title" id="event-modal-title">{event ? "Modifica impegno" : "Aggiungi alla settimana"}</h2></div><button className="icon-button" type="button" aria-label="Chiudi" onClick={() => setModalEvent(undefined)}><X size={16} /></button></div>
          <form action={onSubmit}>
            {event && <input type="hidden" name="id" value={event.id} />}
            <label className="field-label">Titolo<input name="title" defaultValue={event?.title ?? ""} required maxLength={120} placeholder="Es. Allenamento di nuoto" /></label>
            <div className="form-row">
              <label className="field-label">Data<input type="date" name="date" defaultValue={date} required /></label>
              <label className="field-label">Categoria<select name="category" defaultValue={event?.category ?? "HOUSEHOLD"}>{CATEGORY_OPTIONS.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label className="field-label">Inizio<input type="time" name="start" defaultValue={start} required /></label>
              <label className="field-label">Fine<input type="time" name="end" defaultValue={end} required /></label>
            </div>
            <label className="field-label">Per chi?<select name="participantId" defaultValue={participant}><option value="">Impegno personale o familiare</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></label>
            <label className="field-label">Responsabile<select name="assignedUserId" defaultValue={event?.assignedUserId ?? ""}><option value="">Da assegnare</option>{people.filter((person) => person.type === "user" && person.permission !== "MEMBER").map((person) => <option key={person.userId} value={person.userId}>{person.name} · {person.role}</option>)}</select></label>
            <div className="form-row">
              <label className="field-label">Accompagna<select name="chaperoneUserId" defaultValue={event?.chaperoneUser?.id ?? ""}><option value="">Da assegnare</option>{people.filter((person) => person.type === "user").map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select></label>
              <label className="field-label">Riprende<select name="pickupUserId" defaultValue={event?.pickupUser?.id ?? ""}><option value="">Da assegnare</option>{people.filter((person) => person.type === "user").map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select></label>
            </div>
            <label className="field-label">Luogo<input name="location" defaultValue={event?.location ?? ""} maxLength={180} placeholder="Aggiungi un luogo" /></label>
            <label className="field-label">Note<textarea name="description" rows={2} defaultValue={event?.description ?? ""} maxLength={1000} placeholder="Un promemoria per la famiglia…" /></label>
            {!event && <label className="checkbox-row"><input type="checkbox" name="autoAssign" value="true" /><span>Suggerisci automaticamente un responsabile disponibile, bilanciando i turni e il carico della giornata.</span></label>}
            {formError && <div className="error-banner" role="alert">{formError}</div>}
            <div className="form-footer">
              {event && <button className="danger-button" type="button" onClick={() => void removeEvent(event.id)}>Elimina</button>}
              <button className="outline-button" type="button" onClick={() => setModalEvent(undefined)}>Annulla</button>
              <button className="primary-button" type="submit" disabled={pending}>{pending ? "Salvataggio…" : "Salva impegno"}</button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  function renderDetailModal() {
    if (!detailEvent) return null;
    const event = detailEvent;
    const participant = personForEvent(event, people);
    const category = CATEGORY_META[event.category];
    const conflict = hasConflict(event, events);
    const status = conflict ? "In conflitto" : event.status === "CONFIRMED" ? "Confermato" : "Da assegnare";
    return (
      <div className="modal-backdrop" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) setDetailEvent(null); }}>
        <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
          <div className="modal-header"><div><span className="modal-eyebrow">{category.icon} &nbsp;{category.label.toUpperCase()}</span><h2 className="modal-title" id="event-detail-title">{event.title}</h2></div><button className="icon-button" type="button" aria-label="Chiudi" onClick={() => setDetailEvent(null)}><X size={16} /></button></div>
          <div className="detail-meta">{italianDate.format(new Date(event.startTime))} · {localTime(event.startTime)}–{localTime(event.endTime)}</div>
          {participant && <div className="detail-person"><span className="avatar" style={{ background: participant.color }}>{participant.initials}</span><span><strong>{participant.name}</strong><small>{participant.role}</small></span></div>}
          {event.location && <a className="detail-location" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer"><span><MapPin size={13} /> {event.location}</span><span>Apri in Maps ↗</span></a>}
          <div className="detail-pickup"><span>RESPONSABILE E ACCOMPAGNAMENTO</span><strong>{event.assignedUser ? `Responsabile: ${event.assignedUser.name}` : "Responsabile: da assegnare"}{event.chaperoneUser ? ` · Accompagna: ${event.chaperoneUser.name}` : ""}{event.pickupUser ? ` · Riprende: ${event.pickupUser.name}` : ""}</strong></div>
          <div className="detail-status"><span className={`status-dot ${conflict ? "status-conflict" : status === "Confermato" ? "" : "status-unassigned"}`} />{status}{conflict ? " · Verifica gli orari sovrapposti" : ""}</div>
          {event.description && <p className="detail-notes">{event.description}</p>}
          <div className="form-footer">
            <button className="outline-button" type="button" onClick={() => setToast("Per inviare notifiche, configura il servizio email o push.")}>Invia promemoria</button>
            {canManage && <button className="primary-button" type="button" onClick={() => showModal(selected, 9, event)}>Modifica</button>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="calendar-layout">
      <aside className={`calendar-sidebar ${menuOpen ? "open" : ""}`}>
        <button className="primary-button side-create" type="button" onClick={() => canManage && showModal()} disabled={!canManage}><Plus size={15} />Crea impegno / task</button>
        {renderMiniCalendar()}
        {renderFilters()}
        <div className="sidebar-footer"><span className="sync-dot" />Calendario condiviso con la famiglia</div>
      </aside>
      <section className="calendar-main">
        <div className="calendar-toolbar">
          <div className="toolbar-left">
            <button className="icon-button mobile-menu" type="button" aria-label="Apri filtri" onClick={() => setMenuOpen(!menuOpen)}><CalendarDays size={14} /></button>
            <button className="today-button" type="button" onClick={() => setSelected(startOfLocalDay(new Date()))}>Oggi</button>
            <div className="arrow-group"><button className="arrow-button" type="button" aria-label="Periodo precedente" onClick={() => navigate(-1)}><ChevronLeft size={17} /></button><button className="arrow-button" type="button" aria-label="Periodo successivo" onClick={() => navigate(1)}><ChevronRight size={17} /></button></div>
            <h1 className="toolbar-title">{heading}</h1>
          </div>
          <div className="toolbar-right">
            <button className={`family-view-button ${view === "family" ? "active" : ""}`} type="button" onClick={() => chooseView(view === "family" ? "day" : "family")}><UsersRoundIcon />Family timeline</button>
            <label className="select-wrap"><span className="sr-only">Vista calendario</span><select className="view-select" value={view} onChange={(event) => chooseView(event.target.value as View)}><option value="day">Giorno</option><option value="week">Settimana</option><option value="month">Mese</option><option value="agenda">Agenda</option><option value="family">Family timeline</option></select><ChevronDown /></label>
            {canManage && <button className="primary-button create-main" type="button" onClick={() => showModal()}><Plus size={14} />Crea impegno</button>}
          </div>
        </div>
        <div className="calendar-subbar"><span>{view === "month" ? "Tutta la famiglia, giorno dopo giorno" : view === "family" ? "Impegni affiancati per ogni familiare" : view === "agenda" ? "Prossimi 14 giorni" : view === "day" ? italianDate.format(selected) : `${italianDate.format(dates[0])} – ${italianDate.format(dates[6])}`}</span><span>Trascina un impegno per spostarlo</span></div>
        <div className="calendar-surface">{view === "month" ? renderMonth() : view === "agenda" ? renderAgenda() : renderTimeGrid()}</div>
        {!canManage && <p className="permission-note">Puoi consultare il calendario. Per creare o modificare impegni, chiedi a un genitore o tutore.</p>}
      </section>
      {renderCreateEditModal()}
      {renderDetailModal()}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </div>
  );
}

function UsersRoundIcon() {
  return <UsersRound size={13} />;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><div className="empty-state-icon"><CalendarDays size={20} /></div><strong>{title}</strong><p>{message}</p></div>;
}
