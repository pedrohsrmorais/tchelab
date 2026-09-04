// perfil.editar.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, User, Building2, FlaskConical, Link2 } from "lucide-react";
import { Card, PageHeader, Field, Input, Button } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { usersApi } from "@/lib/api";
import type { UpdateUserPayload, UpdatePasswordPayload } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/perfil/editar")({
  head: () => ({ meta: [{ title: "Editar perfil — TcheLab" }] }),
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  // ── Estado do formulário ─────────────────────────────────────────
  const [form, setForm] = useState<UpdateUserPayload>({
    name:          user?.name          ?? "",
    bio:           user?.bio           ?? "",
    research_area: user?.research_area ?? "",
    institution:   user?.institution   ?? "",
    birth_date:    user?.birth_date    ?? "",
    lattes_url:    user?.lattes_url    ?? "",
    linkedin_url:  user?.linkedin_url  ?? "",
    github_url:    user?.github_url    ?? "",
  });

  const [pwd, setPwd] = useState<UpdatePasswordPayload>({
    current_password: "",
    new_password:     "",
  });
  const [pwdConfirm, setPwdConfirm] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd,     setSavingPwd]     = useState(false);

  function set(field: keyof UpdateUserPayload) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  // ── Salvar perfil ────────────────────────────────────────────────
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error(t("profileEdit.nameRequired")); return; }

    setSavingProfile(true);
    try {
      const { data } = await usersApi.updateMe(form);
      setUser(data);
      toast.success(t("profileEdit.profileUpdated"));
      navigate({ to: "/perfil" });
    } catch {
      toast.error(t("profileEdit.profileError"));
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Alterar senha ────────────────────────────────────────────────
  async function handleSavePwd(e: React.FormEvent) {
    e.preventDefault();
    if (!pwd.current_password || !pwd.new_password) {
      toast.error(t("profileEdit.pwdFillBoth"));
      return;
    }
    if (pwd.new_password.length < 8) {
      toast.error(t("profileEdit.pwdMinLength"));
      return;
    }
    if (pwd.new_password !== pwdConfirm) {
      toast.error(t("profileEdit.pwdMismatch"));
      return;
    }

    setSavingPwd(true);
    try {
      await usersApi.updatePassword(pwd);
      toast.success(t("profileEdit.pwdChanged"));
      setPwd({ current_password: "", new_password: "" });
      setPwdConfirm("");
    } catch {
      toast.error(t("profileEdit.pwdIncorrect"));
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("profileEdit.title")}
        subtitle={t("profileEdit.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/perfil" })}>
            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
          </Button>
        }
      />

      <div className="max-w-2xl space-y-6">

        {/* ── Dados pessoais ──────────────────────────────────────── */}
        <form onSubmit={handleSaveProfile}>
          <Card className="p-6 space-y-6">

            <SectionTitle icon={<User className="h-4 w-4" />} label={t("profileEdit.sections.personal")} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("profileEdit.fields.fullName")}>
                <Input
                  value={form.name ?? ""}
                  onChange={set("name")}
                  placeholder={t("profileEdit.fields.fullNamePlaceholder")}
                  required
                />
              </Field>
              <Field label={t("profileEdit.fields.birthDate")}>
                <Input
                  type="date"
                  value={form.birth_date ?? ""}
                  onChange={set("birth_date")}
                />
              </Field>
            </div>

            <Field label={t("profileEdit.fields.bio")}>
              <textarea
                value={form.bio ?? ""}
                onChange={set("bio")}
                rows={3}
                placeholder={t("profileEdit.fields.bioPlaceholder")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </Field>

            <div className="border-t border-border pt-5">
              <SectionTitle icon={<Building2 className="h-4 w-4" />} label={t("profileEdit.sections.academic")} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <Field label={t("profileEdit.fields.institution")}>
                  <Input
                    value={form.institution ?? ""}
                    onChange={set("institution")}
                    placeholder={t("profileEdit.fields.institutionPlaceholder")}
                  />
                </Field>
                <Field label={t("profileEdit.fields.researchArea")}>
                  <Input
                    value={form.research_area ?? ""}
                    onChange={set("research_area")}
                    placeholder={t("profileEdit.fields.researchAreaPlaceholder")}
                  />
                </Field>
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <SectionTitle icon={<Link2 className="h-4 w-4" />} label={t("profileEdit.sections.links")} />
              <div className="space-y-3 mt-4">
                <Field label={t("profileEdit.fields.lattes")}>
                  <Input
                    type="url"
                    value={form.lattes_url ?? ""}
                    onChange={set("lattes_url")}
                    placeholder="http://lattes.cnpq.br/…"
                  />
                </Field>
                <Field label={t("profileEdit.fields.linkedin")}>
                  <Input
                    type="url"
                    value={form.linkedin_url ?? ""}
                    onChange={set("linkedin_url")}
                    placeholder="https://linkedin.com/in/…"
                  />
                </Field>
                <Field label={t("profileEdit.fields.github")}>
                  <Input
                    type="url"
                    value={form.github_url ?? ""}
                    onChange={set("github_url")}
                    placeholder="https://github.com/…"
                  />
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/perfil" })}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("profileEdit.buttons.savingProfile")}</>
                  : t("profileEdit.buttons.saveProfile")
                }
              </Button>
            </div>
          </Card>
        </form>

        {/* ── Alterar senha ───────────────────────────────────────── */}
        <form onSubmit={handleSavePwd}>
          <Card className="p-6 space-y-4">
            <SectionTitle icon={<FlaskConical className="h-4 w-4" />} label={t("profileEdit.sections.password")} />

            <Field label={t("profileEdit.fields.currentPassword")}>
              <Input
                type="password"
                value={pwd.current_password}
                onChange={(e) => setPwd((p) => ({ ...p, current_password: e.target.value }))}
                autoComplete="current-password"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("profileEdit.fields.newPassword")}>
                <Input
                  type="password"
                  value={pwd.new_password}
                  onChange={(e) => setPwd((p) => ({ ...p, new_password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder={t("profileEdit.fields.newPasswordPlaceholder")}
                />
              </Field>
              <Field label={t("profileEdit.fields.confirmPassword")}>
                <Input
                  type="password"
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button type="submit" variant="outline" disabled={savingPwd}>
                {savingPwd
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("profileEdit.buttons.changingPassword")}</>
                  : t("profileEdit.buttons.changePassword")
                }
              </Button>
            </div>
          </Card>
        </form>

      </div>
    </>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="text-primary">{icon}</span>
      {label}
    </h2>
  );
}