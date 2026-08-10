-- Correction-signal learning loop for the tool-grounded registry agents
-- (app/server/agents/*). The older command-center system already has a
-- correction-signal concept (digital_employee_correction_signals), but it is
-- keyed by work_queue_id/role_key/task_key from a different, deterministic
-- state-machine system with no LLM in the loop -- not reusable here without
-- corrupting its key space. This is a new, minimal table keyed by the
-- ai_agent_runs/ai_approval_cases identifiers the LLM-based agents already
-- use, so a rejection can be traced back to the exact agent and run it
-- belongs to.
CREATE TABLE IF NOT EXISTS ai_agent_correction_signals(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  approval_case_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  correction_reason TEXT NOT NULL,
  corrected_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_correction_signals_agent ON ai_agent_correction_signals(organization_id,property_id,agent_key,created_at);
