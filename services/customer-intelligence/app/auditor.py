from dataclasses import dataclass, asdict
from urllib.parse import urlparse
import httpx


@dataclass
class AuditCheck:
    key: str
    score: float
    weight: float
    status: str
    detail: str


async def pagespeed_check(url: str, api_key: str | None) -> AuditCheck:
    if not api_key:
        return AuditCheck("pagespeed", 0, .35, "CONFIGURATION_REQUIRED", "Google PageSpeed API key is not configured.")
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.get("https://www.googleapis.com/pagespeedonline/v5/runPagespeed", params={"url": url, "key": api_key, "category": "performance"})
    response.raise_for_status()
    score = float(response.json()["lighthouseResult"]["categories"]["performance"]["score"]) * 100
    return AuditCheck("pagespeed", score, .35, "PASS" if score >= 80 else "NEEDS_WORK", f"Performance score {score:.0f}/100.")


def menu_schema_check(schema: dict) -> AuditCheck:
    required = {"@context", "@type", "name", "hasMenuSection"}
    missing = sorted(required - set(schema))
    score = max(0, 100 - len(missing) * 25)
    return AuditCheck("menu_schema", score, .35, "PASS" if not missing else "NEEDS_WORK", "Complete Menu schema." if not missing else f"Missing: {', '.join(missing)}")


def directory_check(url: str, directory_records: list[dict]) -> AuditCheck:
    host = urlparse(url).hostname or ""
    matched = [item for item in directory_records if host in str(item.get("website", ""))]
    complete = sum(bool(item.get(field)) for item in matched for field in ("name", "address", "phone", "hours"))
    denominator = max(1, len(matched) * 4)
    score = 100 * complete / denominator
    return AuditCheck("local_directory", score, .30, "PASS" if score >= 90 else "NEEDS_WORK", f"{len(matched)} matching directory record(s).")


async def run_layout_audit(url: str, menu_schema: dict, directory_records: list[dict], pagespeed_api_key: str | None) -> dict:
    checks: list[AuditCheck] = []
    try:
        checks.append(await pagespeed_check(url, pagespeed_api_key))
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        checks.append(AuditCheck("pagespeed", 0, .35, "FAILED", f"PageSpeed unavailable: {type(exc).__name__}"))
    checks.extend([menu_schema_check(menu_schema), directory_check(url, directory_records)])
    available = [check for check in checks if check.status != "CONFIGURATION_REQUIRED"]
    weight = sum(check.weight for check in available) or 1
    grade = round(sum(check.score * check.weight for check in available) / weight, 1)
    return {"grade": grade, "status": "PASS" if grade >= 80 else "NEEDS_WORK", "checks": [asdict(check) for check in checks]}
