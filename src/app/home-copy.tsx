"use client";

import { useTranslation } from "@/lib/i18n/language-provider";

export function HomeCopy() {
  const { t } = useTranslation();

  return (
    <>
      <h1 className="font-heading text-4xl font-bold tracking-tight text-moana">
        {t("app.name")}
      </h1>
      <h2 className="text-lg">{t("app.tagline")}</h2>
      <p className="max-w-md text-lg">{t("app.description")}</p>
    </>
  );
}
