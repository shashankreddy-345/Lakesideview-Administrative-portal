// analyticsUtilization.ts

type BookingStatus = "completed" | "confirmed" | "active" | "cancelled" | string;

export type Booking = {
  resource_id: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
};

export type Resource = {
  resource_id: string;
  type: string;
  name: string;
  status?: "available" | "maintenance" | "disabled" | string;
  capacity?: number;
};

const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;

function parseDT(s: string) {
  let iso = s.replace(" ", "T"); // Ensure ISO format for Date constructor
  // Strip timezone offset (Z or +HH:mm or -HH:mm) to treat as local time
  return new Date(iso.replace(/(Z|[+-]\d{2}:?\d{2})$/, ""));
}

function floorToHour(d: Date) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

// JS getDay(): Sun=0..Sat=6 => Mon=0..Sun=6
function weekdayMon0(d: Date) {
  return (d.getDay() + 6) % 7;
}

function toHourLabel(h: number) {
  const isAM = h < 12;
  const hour12 = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${hour12} ${isAM ? "AM" : "PM"}`;
}

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type UtilizationOptions = {
  includeStatuses?: BookingStatus[];     // default: completed+confirmed+active
  onlyAvailableResources?: boolean;      // true => status === "available"
  resourceType?: string;                // filter (e.g. "study-room")
  operatingHours?: { start: number; end: number }; // e.g. { start: 8, end: 20 }
};

/**
 * CORE: Builds booked/available minutes + booking counts grouped by:
 * - "hour"  => key 0..23
 * - "weekday" => key 0..6 (Mon=0..Sun=6)
 * - "type" => key resource.type string
 *
 * All charts are derived from this single output.
 */
export function computeUtilizationMetrics(
  bookings: Booking[],
  resources: Resource[],
  rangeStart: Date,
  rangeEnd: Date,
  groupBy: "hour" | "weekday" | "type",
  opts?: UtilizationOptions
) {
  const includeStatuses =
    opts?.includeStatuses ?? ["completed", "confirmed", "active", "upcoming"];

  // resources in scope
  const scopedResources = resources.filter((r) => {
    if (opts?.resourceType && r.type !== opts.resourceType) return false;
    if (opts?.onlyAvailableResources && r.status && r.status !== "available") return false;
    return true;
  });

  const resourceById = new Map(scopedResources.map((r) => [r.resource_id, r]));
  
  // Calculate totalRangeMin respecting operating hours
  let totalRangeMin = 0;
  {
    let t = new Date(rangeStart);
    while (t < rangeEnd) {
      const hourStart = floorToHour(t);
      const hourEnd = new Date(hourStart.getTime() + MS_HOUR);
      const chunkStart = t > hourStart ? t : hourStart;
      const chunkEnd = rangeEnd < hourEnd ? rangeEnd : hourEnd;
      
      const h = hourStart.getHours();
      const isOpen = !opts?.operatingHours || (h >= opts.operatingHours.start && h < opts.operatingHours.end);
      
      if (isOpen) totalRangeMin += Math.max(0, (chunkEnd.getTime() - chunkStart.getTime()) / MS_MIN);
      t = chunkEnd;
      if (t.getTime() === chunkStart.getTime()) break;
    }
  }

  // --- helpers to initialize group accumulator ---
  type Acc = {
    bookedMin: number;    // resource-minutes booked in group
    availMin: number;     // resource-minutes available in group
    bookings: number;     // count of bookings (by start_time) in group
    // for "type" chart: count of resources in that group
    resourcesCount: number;
  };

  const acc = new Map<string | number, Acc>();
  const getAcc = (k: string | number) => {
    const cur = acc.get(k);
    if (cur) return cur;
    const fresh: Acc = { bookedMin: 0, availMin: 0, bookings: 0, resourcesCount: 0 };
    acc.set(k, fresh);
    return fresh;
  };

  // --- set resourcesCount per group (needed for "type") ---
  if (groupBy === "type") {
    for (const r of scopedResources) {
      getAcc(r.type).resourcesCount += 1;
    }
  }

  // --- denominator: available minutes ---
  // hour/weekday need time-sliced denominator; type uses totalRangeMin * resourcesCount
  if (groupBy === "type") {
    // For type, we need to sum up capacity-minutes for all resources in this type
    // But since we don't have easy access to the specific resources in this loop without re-iterating,
    // we can iterate resources again.
    for (const r of scopedResources) {
      const capacity = r.capacity || 1;
      getAcc(r.type).availMin += totalRangeMin * capacity;
    }
  } else {
    let t = new Date(rangeStart);
    while (t < rangeEnd) {
      const hourStart = floorToHour(t);
      const hourEnd = new Date(hourStart.getTime() + MS_HOUR);

      const chunkStart = t > hourStart ? t : hourStart;
      const chunkEnd = rangeEnd < hourEnd ? rangeEnd : hourEnd;

      const minutes = Math.max(0, (chunkEnd.getTime() - chunkStart.getTime()) / MS_MIN);

      const h = hourStart.getHours();
      if (!opts?.operatingHours || (h >= opts.operatingHours.start && h < opts.operatingHours.end)) {
        const key = groupBy === "hour" ? h : weekdayMon0(hourStart);
        
        // Add minutes * capacity for EACH resource
        for (const r of scopedResources) {
          getAcc(key).availMin += minutes * (r.capacity || 1);
        }
      }

      t = chunkEnd;
      if (t.getTime() === chunkStart.getTime()) break;
    }
  }

  // --- numerator: booked minutes + booking count ---
  for (const b of bookings) {
    if (!includeStatuses.includes(b.status)) continue;

    const r = resourceById.get(b.resource_id);
    if (!r) continue; // booking resource not in scope

    const bs = parseDT(b.start_time);
    const be = parseDT(b.end_time);

    const start = bs < rangeStart ? rangeStart : bs;
    const end = be > rangeEnd ? rangeEnd : be;
    if (end <= start) continue;

    // booking count: by start_time within range (prevents multi-day double-counting)
    const countTime = bs < rangeStart ? rangeStart : bs;
    if (countTime >= rangeStart && countTime < rangeEnd) {
      const k =
        groupBy === "hour" ? countTime.getHours()
        : groupBy === "weekday" ? weekdayMon0(countTime)
        : r.type;
      getAcc(k).bookings += 1;
    }

    // booked minutes: time-sliced for hour/weekday; simple add for type
    if (groupBy === "type") {
      getAcc(r.type).bookedMin += (end.getTime() - start.getTime()) / MS_MIN;
    } else {
      let t = new Date(start);
      while (t < end) {
        const hourStart = floorToHour(t);
        const hourEnd = new Date(hourStart.getTime() + MS_HOUR);

        const chunkStart = t > hourStart ? t : hourStart;
        const chunkEnd = end < hourEnd ? end : hourEnd;

        const h = hourStart.getHours();
        if (!opts?.operatingHours || (h >= opts.operatingHours.start && h < opts.operatingHours.end)) {
          const minutes = Math.max(0, (chunkEnd.getTime() - chunkStart.getTime()) / MS_MIN);
          const key = groupBy === "hour" ? h : weekdayMon0(hourStart);
          getAcc(key).bookedMin += minutes;
        }

        t = chunkEnd;
        if (t.getTime() === chunkStart.getTime()) break;
      }
    }
  }

  return acc;
}

/** CHART 1: Daily Utilization Trend (24 points) */
export function buildDailyUtilizationTrend(
  bookings: Booking[],
  resources: Resource[],
  rangeStart: Date,
  rangeEnd: Date,
  opts?: UtilizationOptions
) {
  const acc = computeUtilizationMetrics(bookings, resources, rangeStart, rangeEnd, "hour", opts);

  return Array.from({ length: 24 }, (_, h) => {
    const a = acc.get(h) ?? { bookedMin: 0, availMin: 0, bookings: 0, resourcesCount: 0 };
    const util = a.availMin <= 0 ? 0 : Math.min(100, Math.max(0, (a.bookedMin / a.availMin) * 100));

    return {
      hour: toHourLabel(h),
      utilization: Math.round(util),
    };
  });
}

/** CHART 2: Weekly Utilization & Booking Trends (Mon–Sun) */
export function buildWeeklyUtilizationAndBookings(
  bookings: Booking[],
  resources: Resource[],
  rangeStart: Date,
  rangeEnd: Date,
  opts?: UtilizationOptions
) {
  const acc = computeUtilizationMetrics(bookings, resources, rangeStart, rangeEnd, "weekday", opts);

  return WEEK_LABELS.map((day, i) => {
    const a = acc.get(i) ?? { bookedMin: 0, availMin: 0, bookings: 0, resourcesCount: 0 };
    const util = a.availMin <= 0 ? 0 : Math.min(100, Math.max(0, (a.bookedMin / a.availMin) * 100));

    return {
      day,
      utilization: Math.round(util),
      bookings: a.bookings,
    };
  });
}

/** CHART 3: Utilization Status by Resource Type (Optimal/Busy/Over) */
export function buildUtilizationStatusByType(
  bookings: Booking[],
  resources: Resource[],
  rangeStart: Date,
  rangeEnd: Date,
  opts?: UtilizationOptions & { thresholds?: { optimalMax: number; busyMax: number } }
) {
  const thresholds = opts?.thresholds ?? { optimalMax: 60, busyMax: 85 };

  // We need per-resource utilization, then bucket counts per type.
  // We'll compute booked minutes per resource_id (clamped), then compare to totalRangeMin.
  const includeStatuses =
    opts?.includeStatuses ?? ["completed", "confirmed", "active", "upcoming"];

  const scopedResources = resources.filter((r) => {
    if (opts?.resourceType && r.type !== opts.resourceType) return false;
    if (opts?.onlyAvailableResources && r.status && r.status !== "available") return false;
    return true;
  });

  // Calculate totalRangeMin respecting operating hours (same logic as above)
  let totalRangeMin = 0;
  {
    let t = new Date(rangeStart);
    while (t < rangeEnd) {
      const hourStart = floorToHour(t);
      const hourEnd = new Date(hourStart.getTime() + MS_HOUR);
      const chunkStart = t > hourStart ? t : hourStart;
      const chunkEnd = rangeEnd < hourEnd ? rangeEnd : hourEnd;
      
      const h = hourStart.getHours();
      const isOpen = !opts?.operatingHours || (h >= opts.operatingHours.start && h < opts.operatingHours.end);
      
      if (isOpen && chunkEnd > chunkStart) totalRangeMin += (chunkEnd.getTime() - chunkStart.getTime()) / MS_MIN;
      t = chunkEnd;
      if (t.getTime() === chunkStart.getTime()) break;
    }
  }

  const bookedByResource = new Map<string, number>();
  for (const r of scopedResources) bookedByResource.set(r.resource_id, 0);

  for (const b of bookings) {
    if (!includeStatuses.includes(b.status)) continue;
    if (!bookedByResource.has(b.resource_id)) continue;

    const bs = parseDT(b.start_time);
    const be = parseDT(b.end_time);

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
    bookedByResource.set(b.resource_id, (bookedByResource.get(b.resource_id) ?? 0) + minutes);
  }

  type C = { total: number; optimal: number; busy: number; over: number };
  const counts = new Map<string, C>();

  for (const r of scopedResources) {
    const bookedMin = bookedByResource.get(r.resource_id) ?? 0;
    const util = totalRangeMin <= 0 ? 0 : Math.min(100, Math.max(0, (bookedMin / totalRangeMin) * 100));

    let bucket: "optimal" | "busy" | "over" = "optimal";
    if (util > thresholds.busyMax) bucket = "over";
    else if (util > thresholds.optimalMax) bucket = "busy";

    const c = counts.get(r.type) ?? { total: 0, optimal: 0, busy: 0, over: 0 };
    c.total += 1;
    c[bucket] += 1;
    counts.set(r.type, c);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, c]) => {
      const total = c.total || 1;
      const optimal = Math.round((c.optimal / total) * 100);
      const busy = Math.round((c.busy / total) * 100);
      const over = Math.min(100, Math.max(0, 100 - optimal - busy)); // force exact 100

      return { type, optimal, busy, overUtilized: over };
    });
}

export type HeatBand = { label: string; startHour: number; endHour: number }; // end exclusive

export function buildWeeklyUsageHeatmap(
  bookings: Booking[],
  resources: Resource[],
  rangeStart: Date,
  rangeEnd: Date,
  opts?: UtilizationOptions & { bands?: HeatBand[] }
) {
  const includeStatuses =
    opts?.includeStatuses ?? ["completed", "confirmed", "active"];

  const bands: HeatBand[] =
    opts?.bands ?? [
      { label: "8-9", startHour: 8, endHour: 9 },
      { label: "9-10", startHour: 9, endHour: 10 },
      { label: "10-11", startHour: 10, endHour: 11 },
      { label: "11-12", startHour: 11, endHour: 12 },
      { label: "12-13", startHour: 12, endHour: 13 },
      { label: "13-14", startHour: 13, endHour: 14 },
      { label: "14-15", startHour: 14, endHour: 15 },
      { label: "15-16", startHour: 15, endHour: 16 },
      { label: "16-17", startHour: 16, endHour: 17 },
      { label: "17-18", startHour: 17, endHour: 18 },
      { label: "18-19", startHour: 18, endHour: 19 },
      { label: "19-20", startHour: 19, endHour: 20 },
      { label: "20-21", startHour: 20, endHour: 21 },
      { label: "21-22", startHour: 21, endHour: 22 },
    ];

  const scopedResources = resources.filter((r) => {
    if (opts?.resourceType && r.type !== opts.resourceType) return false;
    if (opts?.onlyAvailableResources && r.status && r.status !== "available") return false;
    return true;
  });

  const resourceIds = new Set(scopedResources.map((r) => r.resource_id));
  const resourceCount = scopedResources.length;

  const bookedMin: number[][] = Array.from({ length: 7 }, () => Array(bands.length).fill(0));
  const availMin: number[][] = Array.from({ length: 7 }, () => Array(bands.length).fill(0));

  {
    const dayStart = new Date(rangeStart);
    dayStart.setHours(0, 0, 0, 0);

    const dayEndLimit = new Date(rangeEnd);

    for (let d = new Date(dayStart); d < dayEndLimit; d.setDate(d.getDate() + 1)) {
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayWindowStart = d < rangeStart ? rangeStart : d;
      const dayWindowEnd = nextDay > rangeEnd ? rangeEnd : nextDay;
      if (dayWindowEnd <= dayWindowStart) continue;

      const wd = weekdayMon0(d);

      for (let bi = 0; bi < bands.length; bi++) {
        const b = bands[bi];

        const bandStart = new Date(d);
        bandStart.setHours(b.startHour, 0, 0, 0);
        const bandEnd = new Date(d);
        bandEnd.setHours(b.endHour, 0, 0, 0);

        const start = bandStart < dayWindowStart ? dayWindowStart : bandStart;
        const end = bandEnd > dayWindowEnd ? dayWindowEnd : bandEnd;

        if (end > start) {
          const minutes = (end.getTime() - start.getTime()) / MS_MIN;
          availMin[wd][bi] += minutes * resourceCount;
        }
      }
    }
  }

  for (const bkg of bookings) {
    if (!includeStatuses.includes(bkg.status)) continue;
    if (!resourceIds.has(bkg.resource_id)) continue;

    const bs = parseDT(bkg.start_time);
    const be = parseDT(bkg.end_time);

    const start0 = bs < rangeStart ? rangeStart : bs;
    const end0 = be > rangeEnd ? rangeEnd : be;
    if (end0 <= start0) continue;

    const curDay = new Date(start0);
    curDay.setHours(0, 0, 0, 0);

    for (let d = new Date(curDay); d < end0; d.setDate(d.getDate() + 1)) {
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayStart = d;
      const dayEnd = nextDay;

      const dayClipStart = start0 > dayStart ? start0 : dayStart;
      const dayClipEnd = end0 < dayEnd ? end0 : dayEnd;
      if (dayClipEnd <= dayClipStart) continue;

      const wd = weekdayMon0(d);

      for (let bi = 0; bi < bands.length; bi++) {
        const band = bands[bi];
        const bandStart = new Date(d);
        bandStart.setHours(band.startHour, 0, 0, 0);
        const bandEnd = new Date(d);
        bandEnd.setHours(band.endHour, 0, 0, 0);

        const s = bandStart > dayClipStart ? bandStart : dayClipStart;
        const e = bandEnd < dayClipEnd ? bandEnd : dayClipEnd;

        if (e > s) {
          const minutes = (e.getTime() - s.getTime()) / MS_MIN;
          bookedMin[wd][bi] += minutes;
        }
      }
    }
  }

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

  const rows = days.map((day, wd) => {
    const cells = bands.map((band, bi) => {
      const denom = availMin[wd][bi];
      const pct = denom <= 0 ? 0 : Math.min(100, Math.max(0, (bookedMin[wd][bi] / denom) * 100));
      return {
        band: band.label,
        utilization: Math.round(pct),
      };
    });
    return { day, cells };
  });

  return { bands: bands.map((b) => b.label), rows };
}