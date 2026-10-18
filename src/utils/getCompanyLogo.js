import logoData from "../data/logolocalcdn.json";

export function getLocalLogo(companyId) {
  if (!companyId) return null;
  const company = logoData?.find((item) => item.ID === `${companyId}`);
  if (!company) return null;
  if (!Array.isArray(company.logos)) return null;
  return company.logos.map((logo) =>
    typeof logo === "string"
      ? getLogoLink(logo)
      : { ...logo, link: getLogoLink(logo) },
  );
}

const asLogoList = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const getLogoLink = (value) => {
  const link = typeof value === "string"
    ? value.trim()
    : typeof value?.link === "string" ? value.link.trim() : "";
  // Public files must resolve from the app root, including /editor/ and form routes.
  return link.replace(/^(?:\.\/)?companylogo\//, "/companylogo/");
};

export function getCompanyLogoUrl(company, preferredSize = "square") {
  if (!company) return "";

  const candidates = [
    ...asLogoList(getLocalLogo(company.id)),
    ...asLogoList(company.logos),
    company.logoURL,
    company.logoUrl,
    company.logo,
  ].filter((item) => getLogoLink(item));

  const preferred = candidates?.find(
    (item) =>
      typeof item === "object" &&
      item?.index === 0,
      
  );

  return getLogoLink(preferred || candidates[0]);
}
