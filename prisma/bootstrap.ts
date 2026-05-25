/**
 * 운영용 부트스트랩 스크립트 — 슈퍼관리자 1명만 보장한다.
 *
 * - 절대 deleteMany 같은 파괴적 동작을 하지 않는다.
 * - 환경 변수로 이메일/비밀번호를 받아 upsert 한다 (이미 있으면 갱신, 없으면 생성).
 *   - SEED_SUPER_ADMIN_EMAIL    (필수)
 *   - SEED_SUPER_ADMIN_PASSWORD (필수, 12자 이상 권장)
 *   - SEED_SUPER_ADMIN_ROTATE_PASSWORD = "1" 이면 기존 사용자라도 비밀번호를 강제 갱신
 * - 동의 시점은 즉시(now) 처리하여 첫 로그인 시 동의 화면을 우회한다.
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const CONSENT_VERSION = "2026-04-01";

function readOptionalEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || !value.trim()) return null;
  return value.trim();
}

async function main() {
  const rawEmail = readOptionalEnv("SEED_SUPER_ADMIN_EMAIL");
  const password = readOptionalEnv("SEED_SUPER_ADMIN_PASSWORD");

  // 두 변수가 모두 비어 있으면 운영 중인 환경(부트스트랩 완료 후)으로 간주하고
  // 조용히 종료한다. 이로써 preDeployCommand 등에 묶여 있어도 매번 돌면서 실패하지 않는다.
  if (!rawEmail && !password) {
    console.log(
      "[bootstrap] SEED_SUPER_ADMIN_EMAIL/PASSWORD 미설정 — 부트스트랩 스킵"
    );
    return;
  }

  if (!rawEmail || !password) {
    throw new Error(
      "SEED_SUPER_ADMIN_EMAIL 와 SEED_SUPER_ADMIN_PASSWORD 는 함께 설정해야 합니다."
    );
  }
  if (password.length < 8) {
    throw new Error("SEED_SUPER_ADMIN_PASSWORD 는 최소 8자 이상이어야 합니다.");
  }
  const email = rawEmail.toLowerCase();
  const rotate =
    process.env.SEED_SUPER_ADMIN_ROTATE_PASSWORD === "1" ||
    process.env.SEED_SUPER_ADMIN_ROTATE_PASSWORD === "true";

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: Role.SUPER_ADMIN,
        companyId: null,
        consentGivenAt: new Date(),
        consentVersion: CONSENT_VERSION,
      },
    });
    console.log(`[bootstrap] SUPER_ADMIN 생성 완료: ${email}`);
    return;
  }

  const updates: Record<string, unknown> = {};

  if (existing.role !== Role.SUPER_ADMIN) {
    updates.role = Role.SUPER_ADMIN;
  }
  if (existing.companyId !== null) {
    updates.companyId = null;
  }
  if (rotate) {
    updates.passwordHash = await bcrypt.hash(password, 10);
  }
  if (!existing.consentGivenAt) {
    updates.consentGivenAt = new Date();
    updates.consentVersion = CONSENT_VERSION;
  }

  if (Object.keys(updates).length === 0) {
    console.log(`[bootstrap] SUPER_ADMIN 이미 존재 — 변경 없음: ${email}`);
    return;
  }

  await prisma.user.update({ where: { email }, data: updates });
  console.log(
    `[bootstrap] SUPER_ADMIN 갱신 완료: ${email} (필드: ${Object.keys(updates).join(", ")})`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[bootstrap] 실패:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
