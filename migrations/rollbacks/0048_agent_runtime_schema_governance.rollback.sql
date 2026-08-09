-- Run only after exporting Agent Studio data and disabling the module.
DROP INDEX IF EXISTS ai_agent_action_scope_idx;
DROP INDEX IF EXISTS ai_agent_exception_scope_idx;
DROP INDEX IF EXISTS ai_agent_run_scope_idx;
DROP TABLE IF EXISTS digital_employee_handoffs;
DROP TABLE IF EXISTS digital_system_capabilities;
DROP TABLE IF EXISTS ai_agent_action_log;
DROP TABLE IF EXISTS digital_employee_policies;
DROP TABLE IF EXISTS ai_manual_fallback_cases;
DROP TABLE IF EXISTS ai_approval_cases;
DROP TABLE IF EXISTS ai_agent_tool_calls;
DROP TABLE IF EXISTS ai_agent_runs;
DROP TABLE IF EXISTS ai_runtime_agent_registry;
