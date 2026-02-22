"use client";

import { useEffect, useMemo, useState } from "react";

import {
  referenceDataLabels,
  type ReferenceData,
  type ReferenceDataKey
} from "@/lib/admin/reference-data-config";
import {
  defaultBusinessCaseConfig,
  type BusinessCaseConfig
} from "@/lib/admin/business-case-config-defs";
import { ROLES, roleLabels, type Role } from "@/lib/auth/roles";
import { canAccessModule, projectVisibilityScope } from "@/lib/auth/rbac";

type AdminUser = {
  id: string;
  azureObjectId: string;
  name: string;
  email: string;
  roleType: Role;
  role: Role;
  isActive: boolean;
  jobTitle: string;
  department: string;
  photoUrl?: string;
};

type GovernanceAuditEntry = {
  id: string;
  createdAt: string;
  area: "SUBMISSIONS" | "WORKFLOW" | "ADMIN" | "SPO_COMMITTEE" | "OPERATIONS" | "SECURITY";
  action: string;
  entityType: string;
  entityId?: string;
  outcome: "SUCCESS" | "FAILED" | "DENIED";
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  details?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type UserEditSnapshot = {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  roleType: Role;
  isActive: boolean;
};

const defaultReferenceData: ReferenceData = {
  executiveSponsors: [],
  businessSponsors: [],
  segments: [],
  projectThemes: [],
  strategicObjectives: [],
  classificationTypes: [],
  enterpriseThemes: [],
  portfolioEscs: [],
  projectCategories: [],
  fundingSources: [],
  fundingTypes: [],
  projectImportanceLevels: [],
  projectComplexityLevels: [],
  userExperienceImpacts: [],
  resourceTypes: [],
  capexOpexTypes: [],
  availabilityApplicationTiers: [],
  strategicNonStrategicOptions: [],
  riskAssessmentRequiredOptions: [],
  businessUnits: [],
  opcos: []
};

const listKeys = (Object.keys(referenceDataLabels) as ReferenceDataKey[]).filter(
  (key) =>
    key !== "executiveSponsors" &&
    key !== "businessSponsors" &&
    key !== "businessUnits" &&
    key !== "opcos"
);

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");

const buildRolePreview = (roleType: Role) => {
  const principal = { roleType, isActive: true };
  return {
    projectVisibility: projectVisibilityScope(principal, "projects"),
    dashboardVisibility: projectVisibilityScope(principal, "dashboard"),
    stratosVisibility: projectVisibilityScope(principal, "stratos_lab"),
    modules: {
      financeHub: canAccessModule(principal, "finance_governance_hub"),
      projectGovHub: canAccessModule(principal, "project_governance_hub"),
      spoHub: canAccessModule(principal, "spo_committee_hub"),
      pmHub: canAccessModule(principal, "project_management_hub"),
      userAdmin: canAccessModule(principal, "user_admin")
    }
  };
};

export default function AdminConsole() {
  const [referenceData, setReferenceData] = useState<ReferenceData>(defaultReferenceData);
  const [businessCaseConfig, setBusinessCaseConfig] = useState<BusinessCaseConfig>(defaultBusinessCaseConfig);
  const [selectedListKey, setSelectedListKey] = useState<ReferenceDataKey>("segments");
  const [listEditorValue, setListEditorValue] = useState("");
  const [depreciationEditorValue, setDepreciationEditorValue] = useState("");
  const [depreciationCategoryEditorValue, setDepreciationCategoryEditorValue] = useState("");
  const [kpiEditorValue, setKpiEditorValue] = useState("");
  const [payGradeSalaryEditorValue, setPayGradeSalaryEditorValue] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<GovernanceAuditEntry[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>("BASIC_USER");
  const [newUserJobTitle, setNewUserJobTitle] = useState("");
  const [newUserDepartment, setNewUserDepartment] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingSnapshot, setEditingSnapshot] = useState<UserEditSnapshot | null>(null);
  const [savingList, setSavingList] = useState(false);
  const [savingBusinessCaseConfig, setSavingBusinessCaseConfig] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedListValues = useMemo(() => referenceData[selectedListKey] ?? [], [referenceData, selectedListKey]);
  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [selectedUserId, users]
  );
  const selectedRolePreview = useMemo(
    () => (selectedUser ? buildRolePreview(selectedUser.roleType) : null),
    [selectedUser]
  );

  useEffect(() => {
    setListEditorValue(selectedListValues.join("\n"));
  }, [selectedListValues]);

  useEffect(() => {
    const depreciationLines = businessCaseConfig.depreciationRules
      .map((rule) => `${rule.label} | ${rule.usefulLifeYears}`)
      .join("\n");
    setDepreciationEditorValue(depreciationLines);

    const depreciationCategoryLines = Object.entries(businessCaseConfig.depreciationCategoryMap)
      .flatMap(([category, items]) => {
        if (items.length === 0) return [`${category} |`];
        return items.map((item) => `${category} | ${item}`);
      })
      .join("\n");
    setDepreciationCategoryEditorValue(depreciationCategoryLines);

    const kpiLines = Object.entries(businessCaseConfig.kpiMetricMap)
      .flatMap(([category, metrics]) => {
        if (metrics.length === 0) return [`${category} |`];
        return metrics.map((metric) => `${category} | ${metric}`);
      })
      .join("\n");
    setKpiEditorValue(kpiLines);

    const payGradeSalaryLines = Object.entries(businessCaseConfig.payGradeMonthlySalaryUsd)
      .map(([payGrade, monthlySalary]) => `${payGrade} | ${monthlySalary}`)
      .join("\n");
    setPayGradeSalaryEditorValue(payGradeSalaryLines);
  }, [businessCaseConfig]);

  useEffect(() => {
    const loadAdminData = async () => {
      setError(null);
      try {
        const [refResponse, usersResponse, businessCaseResponse, auditResponse] = await Promise.all([
          fetch("/api/admin/reference-data"),
          fetch("/api/admin/users"),
          fetch("/api/admin/business-case-config"),
          fetch("/api/admin/governance-audit-log?limit=120")
        ]);

        if (!refResponse.ok || !usersResponse.ok || !businessCaseResponse.ok || !auditResponse.ok) {
          throw new Error("Failed to load admin configuration.");
        }

        const refPayload = await refResponse.json();
        const usersPayload = await usersResponse.json();
        const businessCasePayload = await businessCaseResponse.json();
        const auditPayload = await auditResponse.json();
        setReferenceData((prev) => ({ ...prev, ...(refPayload.data ?? {}) }));
        const loadedUsers = (usersPayload.data ?? []) as AdminUser[];
        setUsers(loadedUsers);
        setSelectedUserId((prev) => prev ?? loadedUsers[0]?.id ?? null);
        setBusinessCaseConfig((prev) => ({ ...prev, ...(businessCasePayload.data ?? {}) }));
        setAuditLogs(Array.isArray(auditPayload.data) ? auditPayload.data : []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load admin configuration.");
      }
    };

    void loadAdminData();
  }, []);

  const saveSelectedList = async () => {
    setSavingList(true);
    setError(null);
    setSuccess(null);

    try {
      const values = listEditorValue
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);

      const response = await fetch("/api/admin/reference-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: selectedListKey, values })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to save list.");
      }

      setReferenceData((prev) => ({ ...prev, ...(payload.data ?? {}) }));
      setSuccess(`${referenceDataLabels[selectedListKey]} updated.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save list.");
    } finally {
      setSavingList(false);
    }
  };

  const saveBusinessCaseConfig = async () => {
    setSavingBusinessCaseConfig(true);
    setError(null);
    setSuccess(null);

    try {
      const depreciationRules = depreciationEditorValue
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [rawLabel, rawYears] = line.split("|").map((part) => part.trim());
          const years = Number(rawYears);
          if (!rawLabel || !Number.isFinite(years) || years <= 0) {
            throw new Error(
              `Invalid depreciation rule "${line}". Use format: Label | Years`
            );
          }
          return { label: rawLabel, usefulLifeYears: years };
        });

      const kpiMetricMap = kpiEditorValue
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .reduce<Record<string, string[]>>((acc, line) => {
          const [rawCategory, rawMetric = ""] = line.split("|");
          const category = rawCategory?.trim();
          const metric = rawMetric.trim();
          if (!category) {
            throw new Error(`Invalid KPI mapping "${line}". Use format: Category | Metric`);
          }
          if (!acc[category]) {
            acc[category] = [];
          }
          if (metric) {
            acc[category].push(metric);
          }
          return acc;
        }, {});

      const depreciationCategoryMap = depreciationCategoryEditorValue
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .reduce<Record<string, string[]>>((acc, line) => {
          const [rawCategory, rawItem = ""] = line.split("|");
          const category = rawCategory?.trim();
          const item = rawItem.trim();
          if (!category) {
            throw new Error(
              `Invalid depreciation category mapping "${line}". Use format: Category | Capex/Prepaid Category`
            );
          }
          if (!acc[category]) {
            acc[category] = [];
          }
          if (item) {
            acc[category].push(item);
          }
          return acc;
        }, {});

      const payGradeMonthlySalaryUsd = payGradeSalaryEditorValue
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .reduce<Record<string, number>>((acc, line) => {
          const [rawPayGrade, rawSalary = ""] = line.split("|");
          const payGrade = rawPayGrade?.trim();
          const salary = Number(rawSalary.trim());
          if (!payGrade || !Number.isFinite(salary) || salary < 0) {
            throw new Error(
              `Invalid pay grade salary mapping "${line}". Use format: Pay Grade | Monthly Salary USD`
            );
          }
          acc[payGrade] = salary;
          return acc;
        }, {});

      const response = await fetch("/api/admin/business-case-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depreciationRules,
          depreciationCategoryMap,
          kpiMetricMap,
          payGradeMonthlySalaryUsd
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to save Business Case configuration.");
      }

      setBusinessCaseConfig((prev) => ({ ...prev, ...(payload.data ?? {}) }));
      setSuccess("Business Case depreciation rules, nested dropdown mappings, KPI, and pay grade salary mappings updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save Business Case configuration.");
    } finally {
      setSavingBusinessCaseConfig(false);
    }
  };

  const updateUserRole = (id: string, roleType: Role) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, roleType, role: roleType } : user)));
  };

  const updateUserNameLocal = (id: string, name: string) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, name } : user)));
  };

  const updateUserEmailLocal = (id: string, email: string) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, email } : user)));
  };

  const updateUserJobTitleLocal = (id: string, jobTitle: string) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, jobTitle } : user)));
  };

  const updateUserDepartmentLocal = (id: string, department: string) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, department } : user)));
  };

  const updateUserActiveLocal = (id: string, isActive: boolean) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, isActive } : user)));
  };

  const saveUser = async (user: AdminUser) => {
    setSavingUserId(user.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          name: user.name,
          email: user.email,
          jobTitle: user.jobTitle,
          department: user.department,
          roleType: user.roleType,
          isActive: user.isActive
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to save user rights.");
      }

      setUsers((prev) =>
        prev.map((row) => (row.id === user.id ? { ...row, ...(payload.data as AdminUser) } : row))
      );
      setEditingUserId((prev) => (prev === user.id ? null : prev));
      setEditingSnapshot((prev) => (prev?.id === user.id ? null : prev));
      setSuccess(`Updated access for ${user.name}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save user access.");
    } finally {
      setSavingUserId(null);
    }
  };

  const beginUserEdit = (user: AdminUser) => {
    setUsers((prev) => {
      if (!editingSnapshot || editingSnapshot.id === user.id) {
        return prev;
      }
      return prev.map((row) =>
        row.id === editingSnapshot.id
          ? {
              ...row,
              name: editingSnapshot.name,
              email: editingSnapshot.email,
              jobTitle: editingSnapshot.jobTitle,
              department: editingSnapshot.department,
              roleType: editingSnapshot.roleType,
              role: editingSnapshot.roleType,
              isActive: editingSnapshot.isActive
            }
          : row
      );
    });
    setEditingUserId(user.id);
    setEditingSnapshot({
      id: user.id,
      name: user.name,
      email: user.email,
      jobTitle: user.jobTitle,
      department: user.department,
      roleType: user.roleType,
      isActive: user.isActive
    });
  };

  const cancelUserEdit = (userId: string) => {
    setUsers((prev) =>
      prev.map((row) =>
        row.id === userId && editingSnapshot?.id === userId
          ? {
              ...row,
              name: editingSnapshot.name,
              email: editingSnapshot.email,
              jobTitle: editingSnapshot.jobTitle,
              department: editingSnapshot.department,
              roleType: editingSnapshot.roleType,
              role: editingSnapshot.roleType,
              isActive: editingSnapshot.isActive
            }
          : row
      )
    );
    setEditingUserId((prev) => (prev === userId ? null : prev));
    setEditingSnapshot((prev) => (prev?.id === userId ? null : prev));
  };

  const createNewUser = async () => {
    const name = newUserName.trim();
    const email = newUserEmail.trim().toLowerCase();

    if (!name || !email || !newUserPassword) {
      setError("Name, email, and temporary password are required to create a user.");
      setSuccess(null);
      return;
    }

    if (newUserPassword.length < 8) {
      setError("Temporary password must be at least 8 characters.");
      setSuccess(null);
      return;
    }

    setCreatingUser(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password: newUserPassword,
          roleType: newUserRole,
          jobTitle: newUserJobTitle.trim() || undefined,
          department: newUserDepartment.trim() || undefined
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to create user.");
      }

      const createdUser = payload.data as AdminUser;
      setUsers((prev) => [...prev, createdUser]);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("BASIC_USER");
      setNewUserJobTitle("");
      setNewUserDepartment("");
      setSelectedUserId(createdUser.id);
      setSuccess(`Created user ${createdUser.name}.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create user.");
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Admin Configuration</h2>
        <p className="mt-2 text-sm text-slate-600">
          Manage intake dropdown lists and centralized role-based access control settings.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Dropdown List Management</h3>
        <p className="mt-1 text-sm text-slate-600">
          Person dropdowns (Business Sponsor, Executive Sponsor, Business Delegate, Technology Sponsor, Finance
          Sponsor, Benefits Sponsor) are sourced from the User Rights Assignment table.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[280px_1fr]">
          <label className="text-sm">
            List
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={selectedListKey}
              onChange={(event) => setSelectedListKey(event.target.value as ReferenceDataKey)}
            >
              {listKeys.map((key) => (
                <option key={key} value={key}>
                  {referenceDataLabels[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Values (one per line)
            <textarea
              className="mt-1 h-48 w-full rounded-md border border-slate-300 px-3 py-2"
              value={listEditorValue}
              onChange={(event) => setListEditorValue(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              void saveSelectedList();
            }}
            disabled={savingList}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {savingList ? "Saving..." : "Save List"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">User Rights Assignment</h3>
        <p className="mt-1 text-sm text-slate-600">
          Manage users with centralized role assignments. All API permissions are derived from role type and server-side policy.
        </p>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Set up new user</p>
          <p className="mt-1 text-xs text-slate-600">
            Create a new user profile and assign one role. There are no manual permission checkboxes.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-xs text-slate-700">
              Name
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                value={newUserName}
                onChange={(event) => setNewUserName(event.target.value)}
                placeholder="e.g. Jordan Analyst"
              />
            </label>
            <label className="text-xs text-slate-700">
              Email
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                value={newUserEmail}
                onChange={(event) => setNewUserEmail(event.target.value)}
                placeholder="user@portal.local"
              />
            </label>
            <label className="text-xs text-slate-700">
              Job title
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                value={newUserJobTitle}
                onChange={(event) => setNewUserJobTitle(event.target.value)}
                placeholder="e.g. Governance Analyst"
              />
            </label>
            <label className="text-xs text-slate-700">
              Department
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                value={newUserDepartment}
                onChange={(event) => setNewUserDepartment(event.target.value)}
                placeholder="e.g. Transformation"
              />
            </label>
            <label className="text-xs text-slate-700">
              Temporary password
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                value={newUserPassword}
                onChange={(event) => setNewUserPassword(event.target.value)}
                placeholder="Minimum 8 characters"
              />
            </label>
            <label className="text-xs text-slate-700">
              Role
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                value={newUserRole}
                onChange={(event) => setNewUserRole(event.target.value as Role)}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end md:col-span-1">
              <button
                type="button"
                onClick={() => {
                  void createNewUser();
                }}
                disabled={creatingUser}
                className="w-full rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
              >
                {creatingUser ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">User</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Title</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Active</th>
                  <th className="px-3 py-2 font-semibold">Edit</th>
                  <th className="px-3 py-2 font-semibold">Save</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-500" colSpan={7}>
                      No users available.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const isEditing = editingUserId === user.id;
                    return (
                      <tr
                        key={user.id}
                        className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selectedUser?.id === user.id ? "bg-slate-100" : "bg-white"}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {user.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={user.photoUrl} alt={user.name} className="h-8 w-8 rounded-full border border-slate-200 object-cover" />
                            ) : (
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                                {getInitials(user.name || "U")}
                              </span>
                            )}
                            {isEditing ? (
                              <input
                                type="text"
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                                value={user.name}
                                onChange={(event) => updateUserNameLocal(user.id, event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                              />
                            ) : (
                              <span className="font-medium text-slate-800">{user.name}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {isEditing ? (
                            <input
                              type="email"
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                              value={user.email}
                              onChange={(event) => updateUserEmailLocal(user.id, event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : (
                            user.email
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {isEditing ? (
                            <div className="grid gap-1">
                              <input
                                type="text"
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                                value={user.jobTitle}
                                onChange={(event) => updateUserJobTitleLocal(user.id, event.target.value)}
                                placeholder="Job title"
                                onClick={(event) => event.stopPropagation()}
                              />
                              <input
                                type="text"
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                                value={user.department}
                                onChange={(event) => updateUserDepartmentLocal(user.id, event.target.value)}
                                placeholder="Department"
                                onClick={(event) => event.stopPropagation()}
                              />
                            </div>
                          ) : (
                            <>
                              {user.jobTitle || "-"}
                              {user.department ? ` · ${user.department}` : ""}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-md border border-slate-300 px-2 py-1 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-500"
                            value={user.roleType}
                            onChange={(event) => updateUserRole(user.id, event.target.value as Role)}
                            disabled={!isEditing}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {roleLabels[role]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="accent-brand-700 disabled:opacity-50"
                              checked={user.isActive}
                              onChange={(event) => updateUserActiveLocal(user.id, event.target.checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-xs font-medium text-slate-700">
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </label>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (isEditing) {
                                cancelUserEdit(user.id);
                              } else {
                                beginUserEdit(user);
                              }
                            }}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                              isEditing
                                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                : "border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                            }`}
                          >
                            {isEditing ? "Cancel" : "Edit"}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void saveUser(user);
                            }}
                            disabled={savingUserId === user.id || !isEditing}
                            className="rounded-md bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                          >
                            {savingUserId === user.id ? "Saving..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Role Preview</p>
            {selectedUser && selectedRolePreview ? (
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <p className="font-semibold text-slate-800">{selectedUser.name}</p>
                <p>{roleLabels[selectedUser.roleType]}</p>
                <p>Projects visibility: {selectedRolePreview.projectVisibility}</p>
                <p>Dashboard visibility: {selectedRolePreview.dashboardVisibility}</p>
                <p>STRATOS visibility: {selectedRolePreview.stratosVisibility}</p>
                <p>Finance Hub: {selectedRolePreview.modules.financeHub ? "Yes" : "No"}</p>
                <p>Project Gov Hub: {selectedRolePreview.modules.projectGovHub ? "Yes" : "No"}</p>
                <p>SPO Hub: {selectedRolePreview.modules.spoHub ? "Yes" : "No"}</p>
                <p>PM Hub: {selectedRolePreview.modules.pmHub ? "Yes" : "No"}</p>
                <p>User Admin: {selectedRolePreview.modules.userAdmin ? "Yes" : "No"}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-600">Select a user to preview derived access.</p>
            )}
          </aside>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Business Case Calculation Configuration</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure depreciation useful-life rules, depreciation category nested dropdown mappings, KPI nested dropdown
          mappings, and pay-grade salary mappings used by the Funding Request Business Case form.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="text-sm">
            Depreciation Rules (one per line, format: <span className="font-mono">Label | Years</span>)
            <textarea
              className="mt-1 h-60 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={depreciationEditorValue}
              onChange={(event) => setDepreciationEditorValue(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Depreciation Category Nested Mappings (one per line, format:{" "}
            <span className="font-mono">Category | Capex/Prepaid Category</span>)
            <textarea
              className="mt-1 h-60 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={depreciationCategoryEditorValue}
              onChange={(event) => setDepreciationCategoryEditorValue(event.target.value)}
            />
          </label>
          <label className="text-sm">
            KPI Nested Mappings (one per line, format: <span className="font-mono">Category | Metric</span>)
            <textarea
              className="mt-1 h-60 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={kpiEditorValue}
              onChange={(event) => setKpiEditorValue(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Pay Grade Monthly Salary (USD) (one per line, format: <span className="font-mono">Pay Grade | Salary</span>)
            <textarea
              className="mt-1 h-48 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={payGradeSalaryEditorValue}
              onChange={(event) => setPayGradeSalaryEditorValue(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              void saveBusinessCaseConfig();
            }}
            disabled={savingBusinessCaseConfig}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {savingBusinessCaseConfig ? "Saving..." : "Save Business Case Config"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Governance Audit Log</h3>
        <p className="mt-1 text-sm text-slate-600">
          Immutable record of key governance/admin actions for QA and compliance review.
        </p>
        <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Timestamp</th>
                <th className="px-3 py-2 font-semibold">Area</th>
                <th className="px-3 py-2 font-semibold">Action</th>
                <th className="px-3 py-2 font-semibold">Entity</th>
                <th className="px-3 py-2 font-semibold">Outcome</th>
                <th className="px-3 py-2 font-semibold">Actor</th>
                <th className="px-3 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={7}>
                    No governance audit events available.
                  </td>
                </tr>
              ) : (
                auditLogs.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {new Date(item.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </td>
                    <td className="px-3 py-2">{item.area}</td>
                    <td className="px-3 py-2">{item.action}</td>
                    <td className="px-3 py-2">
                      {item.entityType}
                      {item.entityId ? ` · ${item.entityId}` : ""}
                    </td>
                    <td className="px-3 py-2">{item.outcome}</td>
                    <td className="px-3 py-2">
                      {item.actorName || "System"}
                      {item.actorEmail ? ` (${item.actorEmail})` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{item.details || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
    </div>
  );
}
