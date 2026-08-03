import { getDb } from "@/lib/db";

interface HolidayRow {
  holiday_date: string;
  name_en: string;
  name_mi: string;
  shift_days: number;
}

export interface HolidayApiRecord {
  date: string;
  nameEn: string;
  nameMi: string;
  shiftDays: number;
}

export function toHolidayApiRecord(row: HolidayRow): HolidayApiRecord {
  return {
    date: row.holiday_date,
    nameEn: row.name_en,
    nameMi: row.name_mi,
    shiftDays: row.shift_days,
  };
}

export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    const rows: HolidayRow[] = await db("holidays")
      .orderBy("holiday_date", "asc")
      .select("holiday_date", "name_en", "name_mi", "shift_days");

    return Response.json({ results: rows.map(toHolidayApiRecord) });
  } catch {
    return Response.json(
      { error: "Unable to load public holidays." },
      { status: 503 },
    );
  }
}
