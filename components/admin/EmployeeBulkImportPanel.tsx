"use client";

import { useI18n } from "@/components/LanguageProvider";
import {
  btnPrimary,
  btnSecondary,
  errorText,
  groupedCard,
  hint,
  label,
  successText,
} from "@/lib/uiStyles";
import { useRef, useState } from "react";

type BulkResult = {
  created: number;
  failed: number;
  failures: { row: number; email?: string; error: string }[];
  totalRows: number;
};

type Props = {
  onImported: () => void;
};

export function EmployeeBulkImportPanel({ onImported }: Props) {
  const { t, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  function downloadTemplate() {
    const lang = locale === "en" ? "en" : "ko";
    window.location.href = `/api/admin/employees/bulk/template?lang=${lang}`;
  }

  async function uploadFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("admin.employeesBulkNoFile"));
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/employees/bulk", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof j.error === "string" ? j.error : t("admin.employeesBulkFail"));
        return;
      }
      setResult(j as BulkResult);
      if (fileRef.current) fileRef.current.value = "";
      if ((j as BulkResult).created > 0) {
        onImported();
      }
    } catch (e) {
      console.error("[bulk import]", e);
      setError(t("admin.employeesBulkFail"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`${groupedCard} mt-4`}>
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <p className="text-[0.9375rem] font-semibold text-[var(--foreground)]">
          {t("admin.employeesBulkTitle")}
        </p>
        <p className={`mt-1 text-[0.8125rem] leading-relaxed ${hint}`}>
          {t("admin.employeesBulkLead")}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={downloadTemplate}>
            {t("admin.employeesBulkDownload")}
          </button>
        </div>

        <div className="mt-4">
          <label className={label} htmlFor="employees-bulk-file">
            {t("admin.employeesBulkFileLabel")}
          </label>
          <input
            ref={fileRef}
            id="employees-bulk-file"
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-1.5 block w-full max-w-md text-[0.875rem] text-[var(--foreground)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--fill-secondary)] file:px-3 file:py-2 file:text-[0.8125rem] file:font-medium"
            disabled={uploading}
          />
        </div>

        <button
          type="button"
          className={`${btnPrimary} mt-3`}
          disabled={uploading}
          onClick={() => void uploadFile()}
        >
          {uploading ? t("common.processing") : t("admin.employeesBulkUpload")}
        </button>

        {error && <p className={`mt-3 text-[0.875rem] ${errorText}`}>{error}</p>}

        {result && (
          <div className="mt-4 space-y-2">
            <p className={`text-[0.875rem] ${result.created > 0 ? successText : hint}`}>
              {t("admin.employeesBulkResult")
                .replace("{created}", String(result.created))
                .replace("{failed}", String(result.failed))
                .replace("{total}", String(result.totalRows))}
            </p>
            {result.failures.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-[var(--apple-separator)] bg-[var(--fill-tertiary)] px-3 py-2 text-[0.8125rem] text-[var(--apple-label-secondary)]">
                {result.failures.slice(0, 20).map((f) => (
                  <li key={`${f.row}-${f.email ?? ""}`} className="py-0.5">
                    {t("admin.employeesBulkRowError")
                      .replace("{row}", String(f.row))
                      .replace("{email}", f.email ? ` (${f.email})` : "")
                      .replace("{error}", f.error)}
                  </li>
                ))}
                {result.failures.length > 20 && (
                  <li className="py-0.5 italic">{t("admin.employeesBulkMoreErrors")}</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
