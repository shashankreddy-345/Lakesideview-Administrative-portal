// src/app/pages/admin/roomAnalyticsUtils.ts

export type BookingStatus = "completed" | "confirmed" | "active" | "cancelled" | string;

export type Booking = {
  resource_id: string;
  start_time: string; // ISO-like string recommended
  end_time: string;
  status: BookingStatus;
};

export type Resource = {
  resource_id: string;
  type: string;
  name: string;
  status?: string;
  capacity?: number;
};

export type HeatBand = { label: string; startHour: number; endHour: number };

export type UtilizationOptions = {
  includeStatuses?: BookingStatus[];
  onlyAvailableResources?: boolean;
  resourceType?: string;
  operatingHours?: { start: number; end: number }; // e.g. { start: 8, end: 20 }
};

const MS_MIN = 60_000;

function parseDT(s: string) {
  // Accept "YYYY-MM-DD HH:mm:ss" and ISO
  if (!s) return new Date(NaN);
  let iso = s.replace(" ", "T");
  // Strip timezone offset (Z or +HH:mm or -HH:mm) to treat as local time
  return new Date(iso.replace(/(Z|[+-]\d{2}:?\d{2})$/, ""));
}

function floorToHour(d: Date) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

/**
 * Utilization formula:
 * utilization(room) = booked_minutes(room in [rangeStart, rangeEnd)) / available_minutes_in_range * 100
 *
 * NOTE: This is "time utilization", not "occupancy utilization".
 */
export function buildUtilizationByRoomName(
  bookings: Booking[],
  resources: Resource[],
  rangeStart: Date,
  rangeEnd: Date,
  opts?: UtilizationOptions & { nameKey?: "name" | "resource_id" }
) {
  const includeStatuses = opts?.includeStatuses ?? ["completed", "confirmed", "active", "upcoming", "upcomming"]; // Added typo variant just in case
  const nameKey = opts?.nameKey ?? "name";

  const scopedResources = resources.filter((r) => {
    if (opts?.resourceType && r.type !== opts.resourceType) return false;
    if (opts?.onlyAvailableResources && r.status && r.status !== "available") return false;
    return true;
  });

  // Calculate totalRangeMin respecting operating hours
  let totalRangeMin = 0;
  const MS_HOUR = 3600000;
  
  let t = new Date(rangeStart);
  while (t < rangeEnd) {
    const hourStart = floorToHour(t);
    const hourEnd = new Date(hourStart.getTime() + MS_HOUR);
    const chunkStart = t > hourStart ? t : hourStart;
    const chunkEnd = rangeEnd < hourEnd ? rangeEnd : hourEnd;
    
    const h = hourStart.getHours();
    const isOpen = !opts?.operatingHours || (h >= opts.operatingHours.start && h < opts.operatingHours.end);
    
    if (isOpen && chunkEnd > chunkStart) {
      // Base minutes available in the range (per unit of capacity)
      totalRangeMin += (chunkEnd.getTime() - chunkStart.getTime()) / MS_MIN;
    }
    t = chunkEnd;
    if (t.getTime() === chunkStart.getTime()) break;
  }

  const bookedById = new Map<string, number>();
  for (const r of scopedResources) bookedById.set(r.resource_id, 0);

  for (const b of bookings) {
    if (!includeStatuses.includes(b.status)) continue;
    if (!bookedById.has(b.resource_id)) continue;

    const bs = parseDT(b.start_time);
    const be = parseDT(b.end_time);
    if (isNaN(bs.getTime()) || isNaN(be.getTime())) continue;

    const start = bs < rangeStart ? rangeStart : bs;
    const end = be > rangeEnd ? rangeEnd : be;
    if (end <= start) continue;

    // Sum up minutes only within operating hours
    let minutes = 0;
    let t = new Date(start);
    while (t < end) {
      const hourStart = floorToHour(t);
      const hourEnd = new Date(hourStart.getTime() + MS_HOUR);
      const chunkStart = t > hourStart ? t : hourStart;
      const chunkEnd = end < hourEnd ? end : hourEnd;
      
      const h = hourStart.getHours();
      if (!opts?.operatingHours || (h >= opts.operatingHours.start && h < opts.operatingHours.end)) {
        minutes += Math.max(0, (chunkEnd.getTime() - chunkStart.getTime()) / MS_MIN);
      }
      t = chunkEnd;
    }
    bookedById.set(b.resource_id, (bookedById.get(b.resource_id) ?? 0) + minutes);
  }

  return scopedResources
    .map((r) => {
      const bookedMin = bookedById.get(r.resource_id) ?? 0;
      const capacity = r.capacity || 1;
      const availableMin = totalRangeMin * capacity;
      const util = availableMin <= 0 ? 0 : Math.min(100, Math.max(0, (bookedMin / availableMin) * 100));

      const roomName = nameKey === "name" ? (r.name || r.resource_id) : r.resource_id;

      return {
        roomId: r.resource_id,
        roomName,
        utilization: Math.round(util),
        bookedMinutes: Math.round(bookedMin),
        availableMinutes: Math.round(availableMin),
      };
    })
    .filter(r => r.roomName !== 'undefined')    .sort((a, b) => b.utilization - a.utilization);
}

/**
 * Heatmap: Utilization per room per time-band
 * utilization(cell) = booked_minutes(room in band) / available_minutes_in_band * 100
 */
export function buildRoomTimebandHeatmap(
  bookings: Booking[],
  resources: Resource[],
  rangeStart: Date,
  rangeEnd: Date,
  opts?: UtilizationOptions & { bands: HeatBand[]; nameKey?: "name" | "resource_id" }
) {
  const includeStatuses = opts?.includeStatuses ?? ["completed", "confirmed", "active", "upcoming", "upcomming"];
    const nameKey = opts?.nameKey ?? "name";
  const bands = opts?.bands ?? [];

  const scopedResources = resources.filter((r) => {
    if (opts?.resourceType && r.type !== opts.resourceType) return false;
    if (opts?.onlyAvailableResources && r.status && r.status !== "available") return false;
    return true;
  });

  // Booked minutes per (room, bandIndex)
  const bookedMinByRoomBand = new Map<string, number[]>();
  for (const r of scopedResources) bookedMinByRoomBand.set(r.resource_id, Array(bands.length).fill(0));

  // Denominator per band for ONE room
  const availMinPerBand = bands.map(() => 0);
  {
    const dayStart = new Date(rangeStart);
    dayStart.setHours(0, 0, 0, 0);
    const rangeEndShifted = new Date(rangeEnd);

    for (let d = new Date(dayStart); d < rangeEndShifted; d.setDate(d.getDate() + 1)) {
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayWindowStart = d < rangeStart ? rangeStart : d;
      const dayWindowEnd = nextDay > rangeEndShifted ? rangeEndShifted : nextDay;
      if (dayWindowEnd <= dayWindowStart) continue;

      for (let i = 0; i < bands.length; i++) {
        const b = bands[i];
        const bandStart = new Date(d);
        bandStart.setHours(b.startHour, 0, 0, 0);
        const bandEnd = new Date(d);
        bandEnd.setHours(b.endHour, 0, 0, 0);
        const s = bandStart < dayWindowStart ? dayWindowStart : bandStart;
        const e = bandEnd > dayWindowEnd ? dayWindowEnd : bandEnd;
        if (e > s) {
           // This is base minutes. We will multiply by capacity later per room.
           availMinPerBand[i] += (e.getTime() - s.getTime()) / MS_MIN;
        }
      }
    }
  }

  for (const bkg of bookings) {
    if (!includeStatuses.includes(bkg.status)) continue;

    const row = bookedMinByRoomBand.get(bkg.resource_id);
    if (!row) continue;

    const bsRaw = parseDT(bkg.start_time);
    const beRaw = parseDT(bkg.end_time);
    if (isNaN(bsRaw.getTime()) || isNaN(beRaw.getTime())) continue;

    // Use native dates without shifting
    const bs = bsRaw;
    const be = beRaw;
    const rangeStartShifted = rangeStart;
    const rangeEndShifted = rangeEnd;

    const start0 = bs < rangeStartShifted ? rangeStartShifted : bs;
    const end0 = be > rangeEndShifted ? rangeEndShifted : be;
    if (end0 <= start0) continue;

    // Iterate day-by-day for this booking
    const curDay = new Date(start0);
    curDay.setHours(0, 0, 0, 0);

    for (let d = new Date(curDay); d < end0; d.setDate(d.getDate() + 1)) {
      for (let i = 0; i < bands.length; i++) {
        const band = bands[i];

        const bandStart = new Date(d);
        bandStart.setHours(band.startHour, 0, 0, 0);
        const bandEnd = new Date(d);
        bandEnd.setHours(band.endHour, 0, 0, 0);

        const s = bandStart > start0 ? bandStart : start0;
        const e = bandEnd < end0 ? bandEnd : end0;

        if (e > s) row[i] += (e.getTime() - s.getTime()) / MS_MIN;
      }
    }
  }

  return {
    bands: bands.map((b) => b.label),
    rooms: scopedResources.map((r) => {
      
      const roomName = nameKey === "name" ? (r.name || r.resource_id) : r.resource_id;
      const bookedArr = bookedMinByRoomBand.get(r.resource_id) ?? Array(bands.length).fill(0);

      return {
        roomId: r.resource_id,
        roomName,
        cells: bookedArr.map((bm, i) => {
          // Denominator is available minutes * capacity
          const denom = availMinPerBand[i] * (r.capacity || 1);
          const pct = denom <= 0 ? 0 : Math.min(100, Math.max(0, (bm / denom) * 100));
          return { band: bands[i].label, utilization: Math.round(pct) };
        }),
      };
    }),
  };
}