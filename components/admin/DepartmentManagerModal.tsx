"use client";

import { useI18n } from "@/components/LanguageProvider";
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  btnSecondary,
  emptyStateCompact,
  errorText,
  groupedCard,
  hint,
  input,
} from "@/lib/uiStyles";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Department = {
  id: string;
  name: string;
  employeeCount: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** SUPER_ADMIN 컨텍스트에서 사용 시 전달 */
  companyId?: string;
  /** 모달이 닫힐 때(또는 변경 시) 부모가 부서/직원 목록을 갱신하도록 알린다 */
  onChanged?: () => void;
};

/**
 * 회사별 부서 CRUD 모달.
 * - role=COMPANY_ADMIN/HR_MANAGER 는 자기 회사
 * - role=SUPER_ADMIN 은 companyId prop 전달 필요
 *
 * 헤더의 backdrop-filter 가 fixed 의 containing block 을 만드므로 portal 사용.
 */
export function DepartmentManagerModal({ open, onClose, companyId, onChanged }: Props) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const dirtyRef = useRef(false);

  const apiBase = "/api/admin/departments";
  const queryString = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}${queryString}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : "load fail");
      setDepartments(Array.isArray(j.departments) ? j.departments : []);
      setCanEdit(Boolean(j.canEdit));
      // 스키마가 아직 적용되지 않았을 때 안내
      if (j.schemaOutdated) {
        setError(t("admin.departmentsLoadFail"));
      }
    } catch {
      setDepartments([]);
      setError(t("admin.departmentsLoadFail"));
    } finally {
      setLoading(false);
    }
  }, [queryString, t]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    dirtyRef.current = false;
    setError(null);
    setEditingId(null);
    setEditingName("");
    setNewName("");
    void load();
  }, [open, load]);

  // 모달 오픈 시 바디 스크롤 잠금 + ESC 닫기
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    if (dirtyRef.current) onChanged?.();
    onClose();
  }

  async function addDepartment(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}${queryString}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.error === "DUPLICATE_NAME") {
          setError(t("admin.departmentsDuplicate"));
        } else {
          setError(t("admin.departmentsCreateFail"));
        }
        return;
      }
      setNewName("");
      dirtyRef.current = true;
      await load();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(d: Department) {
    setEditingId(d.id);
    setEditingName(d.name);
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/${encodeURIComponent(editingId)}${queryString}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.error === "DUPLICATE_NAME") {
          setError(t("admin.departmentsDuplicate"));
        } else {
          setError(t("admin.departmentsUpdateFail"));
        }
        return;
      }
      setEditingId(null);
      setEditingName("");
      dirtyRef.current = true;
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeDepartment(d: Department) {
    if (typeof window === "undefined") return;
    const ok = window.confirm(t("admin.departmentsDeleteConfirm").replace("{name}", d.name));
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/${encodeURIComponent(d.id)}${queryString}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        setError(t("admin.departmentsDeleteFail"));
        return;
      }
      dirtyRef.current = true;
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("admin.departmentsTitle")}
    >
      <button
        type="button"
        aria-label={t("admin.departmentsCloseButton")}
        onClick={handleClose}
        className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-sm"
      />
      <div
        className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-[var(--background)] shadow-2xl ring-1 ring-black/[0.05] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--separator)] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-[1rem] font-semibold text-[var(--foreground)]">
              {t("admin.departmentsTitle")}
            </h2>
            <p className={`mt-1 ${hint}`}>{t("admin.departmentsLead")}</p>
          </div>
          <button
            type="button"
            aria-label={t("admin.departmentsCloseButton")}
            onClick={handleClose}
            className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem] text-[var(--apple-label-secondary)] transition-colors hover:bg-[var(--fill-secondary)] hover:text-[var(--foreground)]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">
          {canEdit && (
            <form onSubmit={(e) => void addDepartment(e)} className="flex gap-2">
              <input
                className={input}
                placeholder={t("admin.departmentsAddPlaceholder")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={80}
                disabled={busy}
              />
              <button
                type="submit"
                className={`${btnPrimary} shrink-0`}
                disabled={busy || !newName.trim()}
              >
                {t("admin.departmentsAddButton")}
              </button>
            </form>
          )}

          {error && <p className={errorText}>{error}</p>}

          <ul className={`${groupedCard} divide-y divide-[var(--separator)]`}>
            {loading && departments === null ? (
              <li className={emptyStateCompact}>{t("common.loading")}</li>
            ) : !departments || departments.length === 0 ? (
              <li className={emptyStateCompact}>{t("admin.departmentsEmpty")}</li>
            ) : (
              departments.map((d) => {
                const isEditing = editingId === d.id;
                return (
                  <li key={d.id} className="flex items-center gap-2 px-4 py-3 sm:px-5">
                    {isEditing ? (
                      <>
                        <input
                          className={input}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          maxLength={80}
                          disabled={busy}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          className={`${btnPrimary} shrink-0`}
                          disabled={busy || !editingName.trim()}
                        >
                          {t("admin.departmentsSaveButton")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingName("");
                          }}
                          className={`${btnSecondary} shrink-0`}
                          disabled={busy}
                        >
                          {t("admin.departmentsCancelButton")}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-[var(--foreground)]">{d.name}</p>
                          <p className="mt-0.5 text-[0.75rem] text-[var(--apple-label-tertiary)]">
                            {t("admin.departmentsEmployeeCount").replace(
                              "{count}",
                              String(d.employeeCount)
                            )}
                          </p>
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(d)}
                              className={btnGhost}
                              disabled={busy}
                            >
                              {t("admin.departmentsRenameButton")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeDepartment(d)}
                              className={btnDanger}
                              disabled={busy}
                            >
                              {t("admin.departmentsDeleteButton")}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <footer className="flex justify-end border-t border-[var(--separator)] px-5 py-3 sm:px-6">
          <button type="button" onClick={handleClose} className={btnSecondary}>
            {t("admin.departmentsCloseButton")}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
