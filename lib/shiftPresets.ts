import { parseHHmm } from "@/lib/attendanceRules";

export type ShiftCode = "A" | "B" | "C";

export type ShiftPreset = {
  label: string;
  workStartTime: string;
  workEndTime: string;
};

export type ShiftPresetsMap = Record<ShiftCode, ShiftPreset>;

export const SHIFT_CODES: ShiftCode[] = ["A", "B", "C"];

/** 3교대 기본: 08–16 / 16–00 / 00–08 (각 8시간) */
export const DEFAULT_SHIFT_PRESETS: ShiftPresetsMap = {
  A: { label: "1교대", workStartTime: "08:00", workEndTime: "16:00" },
  B: { label: "2교대", workStartTime: "16:00", workEndTime: "00:00" },
  C: { label: "3교대", workStartTime: "00:00", workEndTime: "08:00" },
};

export type ShiftLocale = "ko" | "en";

/** 기본 교대명 (한·영) */
export const BUILTIN_SHIFT_LABELS: Record<ShiftLocale, Record<ShiftCode, string>> = {
  ko: { A: "1교대", B: "2교대", C: "3교대" },
  en: { A: "1st Shift", B: "2nd Shift", C: "3rd Shift" },
};

const ALL_BUILTIN_SHIFT_LABELS = new Set(
  SHIFT_CODES.flatMap((code) => [BUILTIN_SHIFT_LABELS.ko[code], BUILTIN_SHIFT_LABELS.en[code]])
);

export function isBuiltinShiftLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return true;
  return ALL_BUILTIN_SHIFT_LABELS.has(label.trim());
}

/** 저장된 라벨이 기본 교대명이면 현재 언어로 표시 */
export function localizedShiftPresetLabel(
  code: ShiftCode,
  locale: ShiftLocale,
  stored?: string | null
): string {
  const trimmed = stored?.trim();
  if (!trimmed || isBuiltinShiftLabel(trimmed)) {
    return BUILTIN_SHIFT_LABELS[locale][code];
  }
  return trimmed;
}

export function localizeShiftPresetsMap(
  presets: ShiftPresetsMap,
  locale: ShiftLocale
): ShiftPresetsMap {
  const out = { ...presets };
  for (const code of SHIFT_CODES) {
    out[code] = {
      ...presets[code],
      label: localizedShiftPresetLabel(code, locale, presets[code].label),
    };
  }
  return out;
}

function isValidWindow(start: string, end: string): boolean {
  const a = parseHHmm(start);
  const b = parseHHmm(end);
  if (a == null || b == null) return false;
  return a !== b;
}

type ShiftTimes = Pick<ShiftPreset, "workStartTime" | "workEndTime">;

function shiftTimesKey(times: ShiftTimes): string {
  return `${times.workStartTime}|${times.workEndTime}`;
}

function presetsTimesKey(presets: ShiftPresetsMap): string {
  return SHIFT_CODES.map((code) =>
    shiftTimesKey({
      workStartTime: presets[code].workStartTime,
      workEndTime: presets[code].workEndTime,
    })
  ).join(";");
}

/** 예전 기본 교대 시간표 — 불러올 때 현재 DEFAULT 로 맞춤 */
const LEGACY_PRESET_TIME_KEYS = new Set(
  [
    {
      A: { workStartTime: "06:00", workEndTime: "14:00" },
      B: { workStartTime: "14:00", workEndTime: "22:00" },
      C: { workStartTime: "22:00", workEndTime: "06:00" },
    },
    {
      A: { workStartTime: "08:00", workEndTime: "16:00" },
      B: { workStartTime: "16:00", workEndTime: "22:00" },
      C: { workStartTime: "22:00", workEndTime: "06:00" },
    },
    {
      A: { workStartTime: "08:00", workEndTime: "17:00" },
      B: { workStartTime: "17:00", workEndTime: "02:00" },
      C: { workStartTime: "02:00", workEndTime: "11:00" },
    },
  ].map((set) =>
    SHIFT_CODES.map((code) => shiftTimesKey(set[code])).join(";")
  )
);

function applyDefaultShiftTimes(presets: ShiftPresetsMap): ShiftPresetsMap {
  const out = { ...presets };
  for (const code of SHIFT_CODES) {
    out[code] = {
      ...presets[code],
      workStartTime: DEFAULT_SHIFT_PRESETS[code].workStartTime,
      workEndTime: DEFAULT_SHIFT_PRESETS[code].workEndTime,
    };
  }
  return out;
}

/** 회사 shiftPresets JSON 정규화 — 없으면 기본 3교대 */
export function normalizeShiftPresets(raw: unknown): ShiftPresetsMap {
  const base = { ...DEFAULT_SHIFT_PRESETS };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const code of SHIFT_CODES) {
    const item = obj[code];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim() : base[code].label;
    const workStartTime =
      typeof rec.workStartTime === "string" ? rec.workStartTime.trim() : base[code].workStartTime;
    const workEndTime =
      typeof rec.workEndTime === "string" ? rec.workEndTime.trim() : base[code].workEndTime;
    if (!isValidWindow(workStartTime, workEndTime)) continue;
    base[code] = {
      label: label || base[code].label,
      workStartTime,
      workEndTime,
    };
  }
  if (LEGACY_PRESET_TIME_KEYS.has(presetsTimesKey(base))) {
    return applyDefaultShiftTimes(base);
  }
  return base;
}

export function shiftPresetToSchedule(
  preset: ShiftPreset
): { workStartTime: string; workEndTime: string } {
  return {
    workStartTime: preset.workStartTime,
    workEndTime: preset.workEndTime,
  };
}
