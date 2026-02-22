type SponsorDirectory = Record<string, string>;

const sponsorDirectory: SponsorDirectory = {
  "Jordan Sponsor": "approver@portal.local",
  "Casey Sponsor": "reviewer@portal.local",
  "Avery Sponsor": "approver@portal.local",
  "Drew Sponsor": "admin@portal.local"
};

const toEmailSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

export const resolveSponsorEmail = (nameOrEmail?: string, explicitEmail?: string) => {
  const direct = (explicitEmail ?? "").trim().toLowerCase();
  if (direct.includes("@")) {
    return direct;
  }

  const candidate = (nameOrEmail ?? "").trim();
  if (!candidate) {
    return "approver@portal.local";
  }

  if (candidate.includes("@")) {
    return candidate.toLowerCase();
  }

  const mapped = sponsorDirectory[candidate];
  if (mapped) {
    return mapped;
  }

  return `${toEmailSlug(candidate) || "approver"}@portal.local`;
};

export const resolveSponsorName = (businessSponsor?: string, sponsorName?: string) =>
  (businessSponsor && businessSponsor.trim()) ||
  (sponsorName && sponsorName.trim()) ||
  "Business Sponsor";
