import { describe, expect, it } from "vitest";

import { parseAndValidateArtifact } from "@/lib/copilot/artifact-schemas";

describe("copilot artifact schema validation", () => {
  it("validates TASK_REWRITE payload", () => {
    const payload = {
      type: "TASK_REWRITE",
      version: "1.0",
      task: {
        title: "Finalize funding pack",
        smart_statement: "Complete and submit validated funding pack by 2026-03-31.",
        scope_in: ["Funding request package"],
        scope_out: ["Delivery execution"],
        deliverables: ["Signed funding pack"],
        acceptance_criteria: ["All mandatory fields complete"],
        due_date: "2026-03-31",
        dependencies: ["Sponsor input"],
        assumptions: ["Approver availability"]
      }
    };

    const result = parseAndValidateArtifact("TASK_REWRITE", JSON.stringify(payload));
    expect(result.artifact?.artifactType).toBe("TASK_REWRITE");
  });

  it("validates all structured artifact modes", () => {
    const cases: Array<{ mode: Parameters<typeof parseAndValidateArtifact>[0]; payload: unknown }> = [
      {
        mode: "SUBTASKS",
        payload: {
          type: "SUBTASKS",
          version: "1.0",
          parent_task: { title: "Deliver governance package", id: "Unknown" },
          subtasks: [
            {
              order: 1,
              title: "Draft package",
              description: "Create first draft",
              owner: "Unknown",
              effort_estimate: "8h",
              dependencies: [],
              acceptance_criteria: ["Draft uploaded"]
            }
          ]
        }
      },
      {
        mode: "RISK_REGISTER",
        payload: {
          type: "RISK_REGISTER",
          version: "1.0",
          risks: [
            {
              risk_id: "R-001",
              title: "Approval delay",
              risk_statement: "Sponsor approval could be delayed.",
              cause: "Conflicting priorities",
              impact: "Timeline slip",
              probability: "Medium",
              severity: "High",
              mitigation: "Weekly checkpoints",
              contingency: "Escalation path",
              owner: "Unknown",
              due_date: "Unknown",
              early_warning_indicators: ["No response for 5 days"]
            }
          ]
        }
      },
      {
        mode: "KPI_SET",
        payload: {
          type: "KPI_SET",
          version: "1.0",
          kpis: [
            {
              kpi_id: "KPI-001",
              name: "Cycle Time",
              type: "Leading",
              definition: "Time from submission to sponsor decision",
              formula: "decision_date - submit_date",
              baseline: "Unknown",
              target: "<= 10 days",
              frequency: "Weekly",
              data_source: "Approvals queue",
              owner: "Unknown",
              notes: ""
            }
          ]
        }
      },
      {
        mode: "EXEC_SUMMARY",
        payload: {
          type: "EXEC_SUMMARY",
          version: "1.0",
          summary: {
            purpose: "Improve onboarding flow",
            current_status: "Sponsor Review",
            value_and_benefits: ["Reduced processing time"],
            key_milestones: ["Funding submission"],
            key_risks_and_issues: ["Approval delay"],
            decisions_needed: ["Confirm funding source"],
            next_steps: ["Finalize committee packet"]
          }
        }
      },
      {
        mode: "PROJECT_INSIGHTS",
        payload: {
          type: "PROJECT_INSIGHTS",
          version: "1.0",
          insights: {
            what_looks_strong: ["Clear strategic alignment"],
            blind_spots: ["No fallback owner listed"],
            missing_information: ["Closure criteria"],
            likely_blockers: ["Sponsor bandwidth"],
            quick_wins: ["Set weekly review cadence"],
            recommended_next_actions: ["Update risk register"],
            recommended_next_artifacts: ["RISK_REGISTER", "KPI_SET"]
          }
        }
      }
    ];

    for (const testCase of cases) {
      const result = parseAndValidateArtifact(testCase.mode, JSON.stringify(testCase.payload));
      expect(result.artifact).not.toBeNull();
    }
  });

  it("returns error for invalid schema output", () => {
    const invalidPayload = {
      type: "KPI_SET",
      version: "1.0",
      kpis: [
        {
          kpi_id: "KPI-001",
          name: "Cycle Time"
        }
      ]
    };

    const result = parseAndValidateArtifact("KPI_SET", JSON.stringify(invalidPayload));
    expect(result.artifact).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

