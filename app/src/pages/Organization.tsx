import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type { Organization } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText, DemoBadge } from "@/components/common";

export default function OrganizationPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [showInviteNotice, setShowInviteNotice] = useState(false);

  useEffect(() => {
    api.get<Organization>("/org").then(setOrg).catch(setError);
  }, []);

  const orgName = org
    ? (i18n.language === "fr" ? org.name_fr : i18n.language === "en" ? org.name_en : org.name_ar)
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-section text-ink">{t("org.title")}</h1>
        <Button variant="outline" onClick={() => setShowInviteNotice((v) => !v)}>
          {t("org.invite")}
        </Button>
      </div>

      {showInviteNotice && (
        <p role="note" className="rounded-md border border-oasis/40 bg-oasis/10 p-3 text-sm">
          {t("org.inviteNotice")}
        </p>
      )}

      <ErrorText error={error} />

      {org === null && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : org ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {orgName}
              <DemoBadge show={org.is_demo} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("org.code")}</dt>
                <dd dir="ltr">{org.code}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("org.yourAccount")}</dt>
                <dd>{user?.full_name} ({user?.email})</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("org.yourRole")}</dt>
                <dd><Badge variant="secondary">{user?.role}</Badge></dd>
              </div>
            </dl>
            <p className="mt-4 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              {t("org.membersNote")}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
