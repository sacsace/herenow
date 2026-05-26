"use client";

import { useCallback, useEffect, useState } from "react";

export type PunchStatus = {
  isCheckedIn: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  checkInBlock: "ALREADY_CHECKED_IN" | "COOLDOWN" | null;
  checkInMessage: string | null;
  nextCheckInAt: string | null;
  lastType: "CHECK_IN" | "CHECK_OUT" | null;
  lastTimestamp: string | null;
  today: string;
  /** 지금 퇴근하면 조퇴 — 사유 입력·승인 절차가 필요 */
  earlyLeaveExpected?: boolean;
  /** 회사 타임존 기준 정규 퇴근 "HH:mm" (UI 표시용) */
  workEndTime?: string | null;
};

export function usePunchStatus() {
  const [status, setStatus] = useState<PunchStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/attendance/status");
      const j = (await r.json().catch(() => ({}))) as PunchStatus & { error?: string };
      if (r.ok) setStatus(j);
      else setStatus(null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { status, loading, reload };
}
