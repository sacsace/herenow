"use client";

import { useI18n } from "@/components/LanguageProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type MobileNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

type Props = {
  items: MobileNavItem[];
  /** 햄버거 버튼만 보이는 분기점 (기본: sm:hidden) */
  buttonClassName?: string;
};

/**
 * 모바일 전용 좌측 슬라이드 드로어 + 햄버거 트리거.
 * 데스크톱(sm: 이상)에서는 자동으로 숨겨진다.
 *
 * 헤더에 적용된 backdrop-filter 가 fixed positioning 의 containing block 을
 * 만들어 드로어가 헤더 영역에 갇히는 문제를 막기 위해, 오버레이는 portal 로
 * document.body 에 렌더링한다.
 */
export function MobileNavDrawer({ items, buttonClassName = "" }: Props) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const overlay =
    open && mounted ? (
      <div
        id="mobile-nav-drawer"
        className="fixed inset-0 z-[100] sm:hidden"
        role="dialog"
        aria-modal="true"
        aria-label={t("common.menu")}
      >
        <button
          type="button"
          aria-label={t("common.menuClose")}
          onClick={() => setOpen(false)}
          className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-sm"
        />
        <aside className="absolute inset-y-0 left-0 flex h-full w-[min(20rem,82vw)] max-w-full flex-col bg-[var(--background)] pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--separator)] px-4 py-3">
            <span className="text-[0.9375rem] font-semibold text-[var(--foreground)]">
              {t("common.menu")}
            </span>
            <button
              type="button"
              aria-label={t("common.menuClose")}
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[0.625rem] text-[var(--apple-label-secondary)] transition-colors hover:bg-[var(--fill-secondary)] hover:text-[var(--foreground)]"
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
          </div>
          <nav className="flex-1 overflow-y-auto p-2" aria-label={t("common.menu")}>
            <ul className="flex flex-col gap-0.5">
              {items.map((it) => {
                const active = isActive(it.href, it.exact);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-[0.625rem] px-3 py-2.5 text-[0.9375rem] transition-colors ${
                        active
                          ? "bg-[var(--fill-tertiary)] font-semibold text-[var(--foreground)]"
                          : "font-medium text-[var(--apple-label-secondary)] hover:bg-[var(--fill-tertiary)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        aria-label={t("common.menuOpen")}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-[var(--fill-secondary)] text-[var(--foreground)] transition-colors hover:bg-[var(--fill-secondary-hover)] sm:hidden ${buttonClassName}`.trim()}
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
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      {mounted && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}
