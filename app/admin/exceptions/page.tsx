"use client";

import { useI18n } from "@/components/LanguageProvider";
import { PageHeader } from "@/components/ui/PageHeader";
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
import { useCallback, useEffect, useState } from "react";

type Ex = {
  id: string;
  reason: string;
  status: string;
  attendance: {
    type: string;
    timestamp: string;
    employee: { name: string };
    site: { name: string } | null;
  };
};

export default function AdminExceptionsPage() {
  const { t, locale } = useI18n();
  const dateLocale = locale === "en" ? "en-US" : "ko-KR";
  const [items, setItems] = useState<Ex[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/exceptions");
    const j = await r.json();
    if (r.ok) setItems(j.exceptions ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, action: "approve" | "reject") {
    const r = await fetch(`/api/admin/exceptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (r.ok) await load();
  }

  function typeLabel(type: string) {
    if (type === "CHECK_IN") return t("admin.exceptionsTypeCheckIn");
    if (type === "CHECK_OUT") return t("admin.exceptionsTypeCheckOut");
    return type;
  }

  return (
    <div className={pageStack}>
      <PageHeader
        title={t("admin.exceptionsTitle")}
        subtitle={t("admin.exceptionsSubtitle")}
      />

      {loading ? (
        <p className="text-[1rem] text-[var(--apple-label-secondary)]">
          {t("common.loading")}
        </p>
      ) : items.length === 0 ? (
        <p className={emptyState}>{t("admin.exceptionsEmpty")}</p>
      ) : (
        <section>
          <p className={sectionLabel}>{t("admin.exceptionsListLabel")}</p>
          <ul className={groupedCard}>
            {items.map((x, i) => (
              <li
                key={x.id}
                className={`${groupedRow} ${i < items.length - 1 ? "border-b border-[var(--separator)]" : ""}`}
              >
                <p className="font-semibold text-[var(--foreground)]">
                  {x.attendance.employee.name} · {typeLabel(x.attendance.type)}
                  {x.attendance.site?.name ? ` · ${x.attendance.site.name}` : ""}
                </p>
                <p className={`mt-1 ${hint}`}>
                  {new Date(x.attendance.timestamp).toLocaleString(dateLocale)}
                </p>
                <p className="mt-2 text-[0.9375rem] text-[var(--foreground)]">
                  {t("admin.exceptionsReasonLabel")}: {x.reason}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={btnSuccess}
                    onClick={() => void resolve(x.id, "approve")}
                  >
                    {t("admin.exceptionsApprove")}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => void resolve(x.id, "reject")}
                  >
                    {t("admin.exceptionsReject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
