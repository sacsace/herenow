"use client";

import { AppLogo } from "@/components/AppLogo";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  authButtonPrimary,
  authCardSignup,
  authShellSignupWidth,
  authError,
  authFieldGroup,
  authFooter,
  authFormSignup,
  authHint,
  authInput,
  authLabel,
  authLink,
  authSelect,
  authSubtitleSignup,
  authTitle,
} from "@/components/auth/authStyles";
import { useI18n } from "@/components/LanguageProvider";
import { formatTierPrice } from "@/lib/pricing";
import { segmentedBtn, segmentedWrap } from "@/lib/uiStyles";
import type { BillingPeriod } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Tier = {
  id: string;
  minSeats: number;
  maxSeats: number;
  billingPeriod: BillingPeriod;
  priceAmount: number;
  currency: string;
  label: string | null;
  trialDays: number | null;
};

const IST_VALUE = "Asia/Kolkata" as const;

export default function SignupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [timezone] = useState<string>(IST_VALUE);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("YEARLY");
  const [tierId, setTierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTiers = useCallback(
    (period: BillingPeriod) => {
      void fetch(`/api/public/pricing-tiers?period=${period}`)
        .then((r) => r.json())
        .then((j: { tiers?: Tier[] }) => {
          const list = (j.tiers ?? []).map((row) => ({
            ...row,
            trialDays: row.trialDays ?? null,
          }));
          setTiers(list);
          setTierId(list[0]?.id ?? "");
        })
        .catch(() => setError(t("signup.errorTiers")));
    },
    [t]
  );

  useEffect(() => {
    loadTiers(billingPeriod);
  }, [billingPeriod, loadTiers]);

  const filteredTiers = tiers.filter((tr) => tr.billingPeriod === billingPeriod);

  function tierLabelLine(tr: Tier) {
    if (tr.trialDays != null && tr.trialDays > 0) {
      return t("signup.tierTrialLine").replace("{seats}", String(tr.maxSeats)).replace("{days}", String(tr.trialDays));
    }
    if (tr.label) {
      return `${tr.label} — ${formatTierPrice(tr)}`;
    }
    const range = `${tr.minSeats}–${tr.maxSeats}${t("signup.seats")}`;
    return `${range} — ${formatTierPrice(tr)}`;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const r = await fetch("/api/public/register-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName,
        timezone,
        adminEmail,
        adminPassword,
        pricingTierId: tierId,
        adminName: adminName.trim() || undefined,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) {
      setError(
        typeof j.error === "string"
          ? j.error
          : j.error?.fieldErrors
            ? t("signup.errorInput")
            : t("signup.errorSignup")
      );
      return;
    }
    router.push("/login?registered=1");
  }

  return (
    <AuthShell className={authShellSignupWidth}>
      <div className={authCardSignup}>
        <div className="mb-4 flex justify-center sm:mb-5">
          <AppLogo variant="auth" title={t("login.title")} />
        </div>
        <h1 className={authTitle}>{t("signup.title")}</h1>
        <p className={authSubtitleSignup}>{t("signup.subtitle")}</p>

        <form onSubmit={(e) => void onSubmit(e)} className={authFormSignup}>
          <div className={authFieldGroup}>
            <label className={authLabel}>{t("signup.companyName")}</label>
            <input
              className={authInput}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>
          <div className={authFieldGroup}>
            <label className={authLabel}>{t("signup.timezone")}</label>
            <select
              className={authSelect}
              value={timezone}
              disabled
              aria-label={t("signup.timezone")}
            >
              <option value={IST_VALUE}>
                {t("signup.timezoneOption")} ({IST_VALUE})
              </option>
            </select>
            <p className={authHint}>{t("signup.timezoneIndiaOnly")}</p>
          </div>
          <div className={authFieldGroup}>
            <label className={authLabel}>{t("signup.billingPeriod")}</label>
            <div className={segmentedWrap}>
              <button
                type="button"
                onClick={() => setBillingPeriod("MONTHLY")}
                className={segmentedBtn(billingPeriod === "MONTHLY")}
              >
                {t("signup.periodMonthly")}
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod("YEARLY")}
                className={segmentedBtn(billingPeriod === "YEARLY")}
              >
                {t("signup.periodYearly")}
              </button>
            </div>
          </div>
          <div className={authFieldGroup}>
            <label className={authLabel}>{t("signup.plan")}</label>
            <select
              className={authSelect}
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              required
            >
              {filteredTiers.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tierLabelLine(tr)}
                </option>
              ))}
            </select>
            <p className={authHint}>{t("signup.planHint")}</p>
          </div>
          <div className={authFieldGroup}>
            <label className={authLabel}>{t("signup.adminDisplayName")}</label>
            <input
              className={authInput}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder={t("signup.adminDisplayPlaceholder")}
            />
          </div>
          <div className={authFieldGroup}>
            <label className={authLabel}>{t("signup.adminEmail")}</label>
            <input
              type="email"
              autoComplete="email"
              className={authInput}
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
          </div>
          <div className={authFieldGroup}>
            <label className={authLabel}>{t("signup.adminPassword")}</label>
            <input
              type="password"
              autoComplete="new-password"
              className={authInput}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              minLength={8}
            />
            <p className={authHint}>{t("signup.adminIsCompanyAdmin")}</p>
          </div>
          {error && <p className={authError}>{error}</p>}
          <button type="submit" disabled={loading || !tierId} className={authButtonPrimary}>
            {loading ? t("common.processing") : t("signup.submit")}
          </button>
        </form>
        <p className={authFooter}>
          {t("signup.hasAccount")}{" "}
          <Link href="/login" className={authLink}>
            {t("signup.loginLink")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
