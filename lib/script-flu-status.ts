import type { Script, ScriptFluStatus } from "@/types/script"

/**
 * Read `fluStatus` from script queue payloads. Backend may send `fluStatus`,
 * `flu_status`, or `flustatus`.
 */
export function getScriptFluStatus(
  script: Script | undefined | null
): ScriptFluStatus | null | undefined {
  if (!script) return undefined
  const raw = script as Script & {
    flu_status?: ScriptFluStatus | null
    flustatus?: ScriptFluStatus | null
  }
  if (script.fluStatus !== undefined) return script.fluStatus
  if (raw.flu_status !== undefined) return raw.flu_status
  if (raw.flustatus !== undefined) return raw.flustatus
  return undefined
}
