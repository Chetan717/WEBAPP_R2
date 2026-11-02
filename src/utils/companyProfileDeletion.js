export const DELETE_COMPANY_PROFILE_PATH = "/profile/delete-company-profile";

export function canConfirmCompanyProfileDeletion({ profileId, mobile, confirmation }) {
  const registeredMobile = String(mobile || "").replace(/\D/g, "").slice(-10);
  return typeof profileId === "string" && profileId.trim().length > 0 &&
    /^\d{10}$/.test(registeredMobile) &&
    String(confirmation || "").trim() === registeredMobile;
}

export async function confirmCompanyProfileDeletion({
  profileId, mobile, confirmation, deleteProfile,
}) {
  if (!canConfirmCompanyProfileDeletion({ profileId, mobile, confirmation })) {
    throw new Error("Enter your registered mobile number to confirm.");
  }
  // Reuse the existing profile-only deletion and company-cache cleanup.
  // This helper never reads Firestore or calls account deletion/sign-out.
  await deleteProfile(profileId);
}
