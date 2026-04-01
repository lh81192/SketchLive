import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Activity, Database, FolderKanban, HardDrive, Shield, Users } from "lucide-react";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogoIcon } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminOverview } from "@/lib/admin/overview";

const metricIcons = [Users, FolderKanban, Activity, Database];

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin");
  await requireAdmin(locale);
  const overview = await getAdminOverview();

  return (
    <div className="flex min-h-screen flex-col bg-[--surface]">
      <header className="sticky top-0 z-30 border-b border-[--border-subtle] bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <Link href={`/${locale}`} className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
                <LogoIcon size={18} />
              </div>
              <div>
                <div className="font-display text-sm font-semibold text-[--text-primary]">{t("brand")}</div>
                <div className="text-xs text-[--text-muted]">{t("overviewSubtitle")}</div>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <AdminLogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
        <section className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Shield className="h-3.5 w-3.5" />
            {t("eyebrow")}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[--text-primary]">{t("overviewTitle")}</h1>
          <p className="max-w-3xl text-sm leading-6 text-[--text-secondary]">{t("overviewDescription")}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overview.metrics.map((metric, index) => {
            const Icon = metricIcons[index] || Activity;
            return (
              <Card key={metric.key} className="bg-white">
                <CardHeader>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-3xl">{metric.value}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-[--text-secondary]">{metric.detail}</CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("taskStatusTitle")}</CardTitle>
              <CardDescription>{t("taskStatusDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {overview.taskStatus.map((item) => (
                <div key={item.label} className="rounded-xl border border-[--border-subtle] bg-[--surface] px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.15em] text-[--text-muted]">{item.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-[--text-primary]">{item.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("importStatusTitle")}</CardTitle>
              <CardDescription>{t("importStatusDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.importStatus.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-[--border-subtle] bg-[--surface] px-4 py-3">
                  <span className="text-sm text-[--text-secondary]">{item.label}</span>
                  <span className="text-lg font-semibold text-[--text-primary]">{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card className="bg-white">
            <CardHeader>
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary" />
                <CardTitle>{t("storageTitle")}</CardTitle>
              </div>
              <CardDescription>{t("storageDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.storage.map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-xl border border-[--border-subtle] bg-[--surface] px-4 py-3">
                  <span className="text-sm text-[--text-secondary]">{item.label}</span>
                  <span className="text-lg font-semibold text-[--text-primary]">{item.formatted}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <CardTitle>{t("modelAccessTitle")}</CardTitle>
              </div>
              <CardDescription>{t("modelAccessDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.modelAccess.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-[--border-subtle] bg-[--surface] px-4 py-3">
                  <span className="text-sm text-[--text-secondary]">{item.label}</span>
                  <span className="text-sm font-semibold text-[--text-primary]">{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("usersListTitle")}</CardTitle>
              <CardDescription>{t("usersListDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.usersList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[--border-subtle] bg-[--surface] px-4 py-6 text-sm text-[--text-muted]">
                  {t("emptyUsers")}
                </div>
              ) : (
                overview.usersList.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[--border-subtle] bg-[--surface] px-4 py-3">
                    <div className="font-medium text-[--text-primary]">{item.title}</div>
                    <div className="text-sm text-[--text-secondary]">{item.subtitle}</div>
                    <div className="mt-1 text-xs text-[--text-muted]">{item.meta}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("projectsListTitle")}</CardTitle>
              <CardDescription>{t("projectsListDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.projectsList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[--border-subtle] bg-[--surface] px-4 py-6 text-sm text-[--text-muted]">
                  {t("emptyProjects")}
                </div>
              ) : (
                overview.projectsList.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[--border-subtle] bg-[--surface] px-4 py-3">
                    <div className="font-medium text-[--text-primary]">{item.title}</div>
                    <div className="text-sm text-[--text-secondary]">{item.subtitle}</div>
                    <div className="mt-1 text-xs text-[--text-muted]">{item.meta}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("failedTasksTitle")}</CardTitle>
              <CardDescription>{t("failedTasksDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.failedTasksList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[--border-subtle] bg-[--surface] px-4 py-6 text-sm text-[--text-muted]">
                  {t("emptyFailedTasks")}
                </div>
              ) : (
                overview.failedTasksList.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[--border-subtle] bg-[--surface] px-4 py-3">
                    <div className="font-medium text-[--text-primary]">{item.title}</div>
                    <div className="text-sm text-[--text-secondary]">{item.subtitle}</div>
                    {item.detail ? (
                      <div className="mt-1 text-xs text-[--text-secondary] line-clamp-3">{item.detail}</div>
                    ) : null}
                    <div className="mt-2 text-xs text-[--text-muted]">{item.meta}</div>
                    {item.secondaryMeta ? (
                      <div className="mt-1 text-xs text-[--text-muted]">{item.secondaryMeta}</div>
                    ) : null}
                    {item.href ? (
                      <div className="mt-2">
                        <Link
                          href={`/${locale}${item.href}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {t("openProject")}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("recentActivityTitle")}</CardTitle>
              <CardDescription>{t("recentActivityDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.recentActivity.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[--border-subtle] bg-[--surface] px-4 py-6 text-sm text-[--text-muted]">
                  {t("emptyActivity")}
                </div>
              ) : (
                overview.recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-[--border-subtle] bg-[--surface] px-4 py-3">
                    <div>
                      <div className="font-medium text-[--text-primary]">{item.title}</div>
                      <div className="text-sm text-[--text-secondary]">{item.description}</div>
                    </div>
                    <div className="whitespace-nowrap text-xs text-[--text-muted]">
                      {new Date(item.time).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
