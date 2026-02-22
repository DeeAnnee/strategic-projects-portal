import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetServerSession, mockFindUserByEmail } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockFindUserByEmail: vi.fn()
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession
}));

vi.mock("@/lib/auth/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/users")>();
  return {
    ...actual,
    findUserByEmail: mockFindUserByEmail
  };
});

import { requireApiPrincipal } from "@/lib/auth/api";

describe("requireApiPrincipal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("denies forbidden module access server-side", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "u-basic",
        name: "Basic User",
        email: "basic@portal.local",
        roleType: "BASIC_USER",
        role: "BASIC_USER",
        azureObjectId: "11111111-1111-1111-1111-111111111111",
        isActive: true
      }
    });
    mockFindUserByEmail.mockResolvedValue(null);

    const result = await requireApiPrincipal("user_admin");
    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      return;
    }

    expect(result.error.status).toBe(403);
    await expect(result.error.json()).resolves.toMatchObject({
      message: "Forbidden"
    });
  });
});
