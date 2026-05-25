"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { priceSuffix } from "@/lib/pricing";
import {
  btnSecondary,
  btnSuccess,
  emptyState,
  groupedCard,
  groupedRow,
  hint,
  pageStack,
  sectionLabel,
} from "@/lib/uiStyles";
import type { BillingPeriod } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";

type Req = {
  id: string;
  amountDue: number;
  status: string;
  createdAt: string;
  note: string | null;
  company: { id: string; name: string; seatLimit: number };
  targetTier: {
    label: string | null;
    minSeats: number;
    maxSeats: number;
    priceAmount: number;
    billingPeriod: BillingPeriod;
  };
};

export default function SuperBillingPage() {
  const [requests, setRequests] = useState<Req[]>([]);

  const load = useCallback(async () => {
    const r = await fetch("/api/super/billing-requests?status=PENDING");
    const j = await r.json();
    if (r.ok) setRequests(j.requests ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, status: "APPROVED" | "REJECTED") {
    if (!confirm(status === "APPROVED" ? "승인하고 회사 좌석·구독을 갱신할까요?" : "거절할까요?")) return;
    const r = await fetch(`/api/super/billing-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "처리 실패");
      return;
    }
    await load();
  }

  return (
    <div className={pageStack}>
      <PageHeader
        title="요금 상향 요청"
        subtitle="회사가 납부 후 요청하면 승인 시 좌석 상한·구독이 갱신됩니다."
      />

      <section>
        <p className={sectionLabel}>대기 중</p>
        {requests.length === 0 ? (
          <p className={emptyState}>대기 중인 요청이 없습니다.</p>
        ) : (
          <ul className={groupedCard}>
            {requests.map((q, i) => (
              <li
                key={q.id}
                className={`${groupedRow} ${i < requests.length - 1 ? "border-b border-[var(--separator)]" : ""}`}
              >
                <p className="text-[1.0625rem] font-semibold text-[var(--foreground)]">{q.company.name}</p>
                <p className={`mt-1.5 ${hint}`}>
                  목표: {q.targetTier.label ?? `${q.targetTier.minSeats}–${q.targetTier.maxSeats}명`} · Rs.
                  {q.targetTier.priceAmount}
                  {priceSuffix(q.targetTier.billingPeriod)} · 청구 Rs.{q.amountDue} · 현재 좌석{" "}
                  {q.company.seatLimit}
                </p>
                {q.note && <p className={`mt-1 ${hint}`}>메모: {q.note}</p>}
                <p className="mt-1 text-[0.75rem] text-[var(--apple-label-tertiary)]">
                  {new Date(q.createdAt).toLocaleString("ko-KR")}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" className={btnSuccess} onClick={() => void resolve(q.id, "APPROVED")}>
                    승인
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => void resolve(q.id, "REJECTED")}>
                    거절
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
