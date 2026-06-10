// Pure attendance helpers shared by AttendanceSection and SalaryPaymentsSection.
// Keeping these as pure functions so they're testable without Supabase.

export type AttendanceStatus = "present" | "absent" | "half" | "leave" | "overtime";

export type AttendanceMark = {
  employee_id?: string;
  date?: string;
  status: string;
  note: string | null;
};

/** Parse overtime hours from a note like "OT:2.5". Returns 0 if missing. */
export function parseOT(note: string | null | undefined): number {
  if (!note) return 0;
  const m = note.match(/OT:(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

export type AttendanceSummary = {
  present: number;
  absent: number;
  half: number;
  leave: number;
  overtime_hours: number;
  /** Effective days worked = present + 0.5 * half-day. Used for salary calculation. */
  days_present: number;
};

/** Aggregate a set of attendance marks into a per-employee monthly summary. */
export function summarizeAttendance(marks: AttendanceMark[]): AttendanceSummary {
  const present = marks.filter((m) => m.status === "present").length;
  const absent = marks.filter((m) => m.status === "absent").length;
  const half = marks.filter((m) => m.status === "half").length;
  const leave = marks.filter((m) => m.status === "leave").length;
  const overtime_hours = marks
    .filter((m) => m.status === "overtime")
    .reduce((s, m) => s + parseOT(m.note), 0);
  return {
    present,
    absent,
    half,
    leave,
    overtime_hours,
    days_present: present + 0.5 * half,
  };
}
